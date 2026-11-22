import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { prisma, Role } from '@elder-care/db';
import { recordAuditLog, extractClientDetails } from '@/lib/audit';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { createSignedExportLink, verifySignedExportLink } from '@/lib/export-signed-link';

/**
 * Escapes CSV values and strictly neutralizes spreadsheet formula injection (CSV injection)
 * by prefixing risky initial characters (=, +, -, @, \t, \r) with an apostrophe.
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Spreadsheet formula neutralization
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * POST /api/profiles/[id]/export
 * Generates an authorized, time-limited (15-minute) signed export link.
 * Strictly restricted to profile OWNER.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id } = await params;
    const { membership } = await requireProfileAccess(id);

    if (membership.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Export generation is restricted strictly to profile OWNER.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const format = (body.format || 'json').toLowerCase();
    const downloadUrl = createSignedExportLink(id, format, 900); // 15 minutes

    return NextResponse.json({
      success: true,
      downloadUrl,
      expiresInSeconds: 900,
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

/**
 * GET /api/profiles/[id]/export
 * Downloads the complete health data bundle.
 * Requires:
 * 1. Caller is OWNER role.
 * 2. Valid, unexpired signed link token (15-minute expiry).
 * 3. Applies isPrivate filters for delegates without view_private_items.
 * 4. Escapes CSV formula characters.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { ip, userAgent } = extractClientDetails(request);
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const signature = searchParams.get('signature');
    const expires = searchParams.get('expires');

    // Exporting health data is restricted strictly to OWNER role (as per API.md and Goal.md)
    const { user, profile, membership } = await requireProfileAccess(id);
    if (membership.role !== Role.OWNER) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Health data export is restricted strictly to profile OWNER.' },
        { status: 403 }
      );
    }

    // Must verify 15-minute signed token
    if (!verifySignedExportLink(id, format, expires, signature)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: A valid, non-expired signed link is required to download health export data.' },
        { status: 403 }
      );
    }

    // Bundle everything the elder owns (with isPrivate filter respected)
    const canViewPrivate =
      membership.role === Role.OWNER ||
      (Array.isArray(membership.scopes) && membership.scopes.includes('view_private_items')) ||
      (membership.scopes as any)?.view_private_items === true;

    const [medications, appointments, careNotes, memberships] = await Promise.all([
      prisma.medication.findMany({
        where: { profileId: id },
        include: { schedules: { include: { doseEvents: true } } },
      }),
      prisma.appointment.findMany({
        where: {
          profileId: id,
          ...(canViewPrivate ? {} : { isPrivate: false }),
        },
      }),
      prisma.careNote.findMany({
        where: {
          profileId: id,
          ...(canViewPrivate ? {} : { isPrivate: false }),
        },
      }),
      prisma.membership.findMany({
        where: { profileId: id },
        select: {
          id: true,
          role: true,
          scopes: true,
          status: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    // Audited as mandatory in Section 1, Principle 2 & Section 8
    await recordAuditLog({
      profileId: id,
      actorUserId: user.id,
      actorMembershipId: membership.id,
      action: 'DATA:EXPORT',
      entityType: 'CareProfile',
      entityId: id,
      metadata: {
        format,
        itemsCount: (medications?.length || 0) + (appointments?.length || 0) + (careNotes?.length || 0),
      },
      ip,
      userAgent,
    });

    const dateSlug = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const lines: string[] = [];

      // Header: Profile Details
      lines.push('=== Profile Export ===');
      lines.push(
        ['ID', 'Display Name', 'Date of Birth', 'Timezone', 'Blood Type', 'Allergies', 'Conditions', 'Doctor', 'Hospital']
          .map(escapeCsv)
          .join(',')
      );
      lines.push(
        [
          profile.id,
          profile.displayName,
          profile.dateOfBirth?.toISOString() || '',
          profile.timezone,
          profile.bloodType,
          profile.allergies,
          profile.conditions,
          profile.primaryDoctorName,
          profile.preferredHospital,
        ]
          .map(escapeCsv)
          .join(',')
      );
      lines.push('');

      // Section: Medications
      lines.push('=== Medications ===');
      lines.push(
        ['Medication Name', 'Strength', 'Form', 'Criticality', 'Stock Count', 'Refill Threshold', 'Instructions']
          .map(escapeCsv)
          .join(',')
      );
      for (const m of medications || []) {
        lines.push(
          [
            m.name,
            m.strength,
            m.form,
            m.criticality,
            m.stockCount,
            m.refillThreshold,
            m.instructions || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }
      lines.push('');

      // Section: Appointments
      lines.push('=== Doctor Appointments ===');
      lines.push(
        ['Title', 'Doctor Name', 'Clinic', 'Scheduled At', 'Travel Buffer (Mins)', 'Questions To Ask']
          .map(escapeCsv)
          .join(',')
      );
      for (const a of appointments || []) {
        lines.push(
          [
            a.title,
            a.doctorName,
            a.clinicName || '',
            new Date((a as any).startsAt || (a as any).scheduledAt || new Date()).toISOString(),
            a.travelMinutes,
            a.questionsToAsk || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }
      lines.push('');

      // Section: Care Notes
      lines.push('=== Care Notes ===');
      lines.push(['Date', 'Body', 'Private'].map(escapeCsv).join(','));
      for (const n of careNotes || []) {
        lines.push(
          [new Date(n.createdAt).toISOString(), n.body, n.isPrivate ? 'Yes' : 'No']
            .map(escapeCsv)
            .join(',')
        );
      }

      const csvContent = lines.join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="elder_care_export_${id}_${dateSlug}.csv"`,
        },
      });
    }

    // Default: JSON Export
    const exportBundle = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        dateOfBirth: profile.dateOfBirth,
        timezone: profile.timezone,
        bloodType: profile.bloodType,
        allergies: profile.allergies,
        conditions: profile.conditions,
        primaryDoctorName: profile.primaryDoctorName,
        preferredHospital: profile.preferredHospital,
      },
      medications,
      appointments,
      careNotes,
      careCircleMembers: memberships,
    };

    return new NextResponse(JSON.stringify(exportBundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="elder_care_export_${id}_${dateSlug}.json"`,
      },
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

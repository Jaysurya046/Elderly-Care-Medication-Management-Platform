import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { prisma, Role } from '@elder-care/db';
import { recordAuditLog, extractClientDetails } from '@/lib/audit';
import { handleApiError } from '@/lib/api-error';

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { ip, userAgent } = extractClientDetails(request);
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'json').toLowerCase();

    // Exporting health data requires manage_medications scope or OWNER role
    const { user, profile } = await requireProfileAccess(id, { scope: 'manage_medications' });

    // Bundle everything the elder owns
    const [medications, appointments, careNotes, memberships] = await Promise.all([
      prisma.medication.findMany({
        where: { profileId: id },
        include: { schedules: { include: { doseEvents: true } } },
      }),
      prisma.appointment.findMany({ where: { profileId: id } }),
      prisma.careNote.findMany({ where: { profileId: id } }),
      prisma.membership.findMany({
        where: { profileId: id },
        select: { id: true, role: true, scopes: true, status: true, createdAt: true },
      }),
    ]);

    // Audited as mandatory in Section 1, Principle 2 & Section 8
    await recordAuditLog({
      profileId: id,
      actorUserId: user.id,
      action: 'DATA:EXPORT',
      entityType: 'CareProfile',
      entityId: id,
      metadata: {
        format,
        itemsCount: medications.length + appointments.length + careNotes.length,
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
      for (const m of medications) {
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
      for (const a of appointments) {
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
      for (const n of careNotes) {
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

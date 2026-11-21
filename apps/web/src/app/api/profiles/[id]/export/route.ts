import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { prisma, Role } from '@elder-care/db';
import { recordAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Exporting complete health bundle strictly requires OWNER role
    const { user, profile } = await requireProfileAccess(id, { role: Role.OWNER });

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

    // Audited as mandatory in Section 1, Principle 2 & Section 8
    await recordAuditLog({
      profileId: id,
      actorUserId: user.id,
      action: 'DATA:EXPORT',
      entityType: 'CareProfile',
      entityId: id,
      metadata: { itemsCount: medications.length + appointments.length + careNotes.length },
    });

    return new NextResponse(JSON.stringify(exportBundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="elder_care_export_${id}_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { createMedication } from '@/services/medication-service';
import { createMedicationSchema } from '@elder-care/core';
import { prisma } from '@elder-care/db';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { recordAuditLog, extractClientDetails } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { ip, userAgent } = extractClientDetails(request);
    const { user, membership } = await requireProfileAccess(id, { scope: 'view_medications' });

    const medications = await prisma.medication.findMany({
      where: { profileId: id, isActive: true },
      include: { schedules: true },
      orderBy: { name: 'asc' },
    });

    // Audit successful health data read (medications)
    await recordAuditLog({
      profileId: id,
      actorUserId: user.id,
      actorMembershipId: membership.id,
      action: 'HEALTH_DATA:READ',
      entityType: 'Medication',
      entityId: id,
      metadata: { count: medications.length },
      ip,
      userAgent,
    });

    return NextResponse.json({ success: true, data: medications });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

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
    await requireProfileAccess(id, { scope: 'manage_medications' });

    const rawBody = await request.json();
    const validatedData = createMedicationSchema.parse(rawBody);

    const result = await createMedication(id, validatedData);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

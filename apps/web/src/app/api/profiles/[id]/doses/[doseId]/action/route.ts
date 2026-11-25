import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { recordDoseAction } from '@/services/medication-service';
import { prisma } from '@elder-care/db';
import { doseActionSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; doseId: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id, doseId } = await params;
    const rawBody = await request.json();
    const validatedData = doseActionSchema.parse(rawBody);

    // Verify dose belongs to profile before acting (return 404 otherwise)
    const dose = await prisma.doseEvent.findUnique({
      where: { id: doseId },
      select: { id: true, profileId: true },
    });

    if (!dose || dose.profileId !== id) {
      return NextResponse.json(
        { success: false, error: 'Dose event not found for this profile.' },
        { status: 404 }
      );
    }

    // Derive required permission from the action (TAKE, SNOOZE, SKIP require manage_medications)
    const requiredScope =
      validatedData.action === 'TAKE' ||
      validatedData.action === 'SNOOZE' ||
      validatedData.action === 'SKIP'
        ? 'manage_medications'
        : 'view_medications';

    const { user } = await requireProfileAccess(id, { scope: requiredScope });

    const updatedDose = await recordDoseAction(doseId, validatedData, user.id, id);

    return NextResponse.json({ success: true, data: updatedDose });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { recordDoseAction } from '@/services/medication-service';
import { doseCorrectionSchema } from '@elder-care/core';
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
    const { user } = await requireProfileAccess(id, { scope: 'manage_medications' });

    const rawBody = await request.json();
    const validatedData = doseCorrectionSchema.parse(rawBody);

    const updated = await recordDoseAction(
      doseId,
      {
        action: 'CORRECTION',
        correctionTargetStatus: validatedData.targetStatus,
        note: validatedData.reason,
      },
      user.id,
      id
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

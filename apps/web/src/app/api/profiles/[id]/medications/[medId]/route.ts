import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { updateMedication, deleteMedication } from '@/services/medication-service';
import { updateMedicationSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; medId: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id, medId } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'manage_medications' });

    const rawBody = await request.json();
    const validatedData = updateMedicationSchema.parse(rawBody);

    const updated = await updateMedication(id, medId, validatedData as any, user.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; medId: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id, medId } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'manage_medications' });

    await deleteMedication(id, medId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

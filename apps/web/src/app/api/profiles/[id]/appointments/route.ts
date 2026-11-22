import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { createAppointment, getAppointments } from '@/services/appointment-service';
import { createAppointmentSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'view_appointments' });

    const appointments = await getAppointments(id, user.id);
    return NextResponse.json({ success: true, data: appointments });
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
    const { user } = await requireProfileAccess(id, { scope: 'manage_appointments' });

    const rawBody = await request.json();
    const validatedData = createAppointmentSchema.parse(rawBody);

    const appointment = await createAppointment(
      id,
      {
        ...validatedData,
        startsAt: validatedData.startsAt || validatedData.scheduledAt!,
      },
      user.id
    );

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

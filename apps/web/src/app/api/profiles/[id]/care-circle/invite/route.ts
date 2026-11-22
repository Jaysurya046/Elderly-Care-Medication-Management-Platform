import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { createCareCircleInvitation } from '@/services/care-circle-service';
import { invitationCreateSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { Role } from '@elder-care/db';

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
    const { user } = await requireProfileAccess(id, { role: Role.OWNER });

    const rawBody = await request.json();
    const validatedData = invitationCreateSchema.parse(rawBody);

    const result = await createCareCircleInvitation(id, validatedData as any, user.id);
    return NextResponse.json({ success: true, data: result.invitation }, { status: 201 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

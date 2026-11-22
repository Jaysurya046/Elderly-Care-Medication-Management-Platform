import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { confirmCareCircleMember } from '@/services/care-circle-service';
import { confirmCareCircleMemberSchema } from '@elder-care/core';
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
    const validatedData = confirmCareCircleMemberSchema.parse(rawBody);

    const result = await confirmCareCircleMember(
      id,
      validatedData.membershipId,
      user.id,
      validatedData.confirmedScopes
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

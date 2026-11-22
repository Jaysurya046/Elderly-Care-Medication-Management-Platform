import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { revokeCareCircleMembership } from '@/services/care-circle-service';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { Role } from '@elder-care/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id, memberId } = await params;
    const { user } = await requireProfileAccess(id, { role: Role.OWNER });

    await revokeCareCircleMembership(id, memberId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

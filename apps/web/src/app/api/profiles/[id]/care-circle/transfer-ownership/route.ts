import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { transferProfileOwnership } from '@/services/care-circle-service';
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
    if (!rawBody.targetMembershipId) {
      return NextResponse.json(
        { success: false, error: 'targetMembershipId is required.' },
        { status: 400 }
      );
    }

    const result = await transferProfileOwnership(id, rawBody.targetMembershipId, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

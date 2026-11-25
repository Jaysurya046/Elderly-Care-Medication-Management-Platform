import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { acceptCareCircleInvitation } from '@/services/care-circle-service';
import { invitationAcceptSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Sign-in is required to accept an invitation.' },
        { status: 401 }
      );
    }

    const rawBody = await request.json();
    const { token } = invitationAcceptSchema.parse(rawBody);

    const membership = await acceptCareCircleInvitation(token, user.id);
    return NextResponse.json({ success: true, data: membership }, { status: 200 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

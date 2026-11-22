import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { revokeUserSession } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function DELETE(
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

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: sessionId } = await params;
    await revokeUserSession(user.id, sessionId);

    return NextResponse.json({ success: true, message: 'Session revoked.' });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

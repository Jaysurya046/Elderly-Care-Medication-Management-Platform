import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getCurrentSessionId } from '@/lib/session';
import { listUserSessions, revokeAllUserSessions } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const currentSessionId = await getCurrentSessionId();
    const sessions = await listUserSessions(user.id, currentSessionId || undefined);

    return NextResponse.json({ success: true, data: sessions });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

export async function DELETE(request: NextRequest) {
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

    const currentSessionId = await getCurrentSessionId();
    await revokeAllUserSessions(user.id, currentSessionId || undefined);

    return NextResponse.json({
      success: true,
      message: 'All other active sessions revoked.',
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

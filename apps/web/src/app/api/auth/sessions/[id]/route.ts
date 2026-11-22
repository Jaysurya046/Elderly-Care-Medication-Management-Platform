import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { revokeUserSession } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

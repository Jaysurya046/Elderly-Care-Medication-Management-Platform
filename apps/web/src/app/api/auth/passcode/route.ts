import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { setMemberPasscode, verifyMemberPasscode } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (body.action === 'set') {
      await setMemberPasscode(body.membershipId, body.passcode);
      return NextResponse.json({ success: true, message: 'Passcode updated.' });
    } else if (body.action === 'verify') {
      const result = await verifyMemberPasscode(body.membershipId, body.passcode, user);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Passcode verified.' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

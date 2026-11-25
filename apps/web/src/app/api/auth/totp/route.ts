import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { enrolTotp, disableTotp, verifyAndEnableTotp } from '@/services/auth-service';
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
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (body.action === 'enrol') {
      const result = await enrolTotp(user.id);
      return NextResponse.json({ success: true, data: result });
    } else if (body.action === 'verify') {
      if (!body.secret || !body.code) {
        return NextResponse.json(
          { success: false, error: 'Both secret and code are required to enable 2FA.' },
          { status: 400 }
        );
      }
      await verifyAndEnableTotp(user.id, body.secret, body.code);
      return NextResponse.json({ success: true, message: 'Two-factor authentication enabled successfully.' });
    } else if (body.action === 'disable') {
      await disableTotp(user.id);
      return NextResponse.json({ success: true, message: '2FA disabled.' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
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

    await clearSessionCookie();
    return NextResponse.json({ success: true, message: 'Signed out successfully.' });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

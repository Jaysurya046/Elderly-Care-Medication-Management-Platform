import { NextRequest, NextResponse } from 'next/server';
import { signInSchema } from '@elder-care/core';
import { authenticateWithPassword } from '@/services/auth-service';
import { createSession, setSessionCookie } from '@/lib/session';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { extractClientDetails } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { ip, userAgent } = extractClientDetails(request);
    const rawBody = await request.json();
    const validatedData = signInSchema.parse(rawBody);

    try {
      const user = await authenticateWithPassword(
        validatedData.email,
        validatedData.password,
        validatedData.totpCode
      );

      const sessionId = await createSession(user.id, ip, userAgent);
      await setSessionCookie(sessionId);

      return NextResponse.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
      });
    } catch (authError: any) {
      if (authError.message === 'TOTP_REQUIRED') {
        return NextResponse.json({
          success: false,
          requiresTotp: true,
          message: 'Two-factor authentication code required.',
        });
      }
      throw authError;
    }
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

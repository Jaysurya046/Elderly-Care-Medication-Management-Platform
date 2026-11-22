import { NextRequest, NextResponse } from 'next/server';
import { signInSchema } from '@elder-care/core';
import { authenticateWithPassword } from '@/services/auth-service';
import { createSession, setSessionCookie } from '@/lib/session';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validatedData = signInSchema.parse(rawBody);

    try {
      const user = await authenticateWithPassword(
        validatedData.email,
        validatedData.password,
        validatedData.totpCode
      );

      const sessionId = await createSession(user.id);
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

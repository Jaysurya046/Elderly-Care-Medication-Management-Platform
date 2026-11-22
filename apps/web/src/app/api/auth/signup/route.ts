import { NextRequest, NextResponse } from 'next/server';
import { signUpSchema } from '@elder-care/core';
import { signUpUser } from '@/services/auth-service';
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
    const validatedData = signUpSchema.parse(rawBody);

    const user = await signUpUser(validatedData);
    const sessionId = await createSession(user.id, ip, userAgent);
    await setSessionCookie(sessionId);

    return NextResponse.json(
      {
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

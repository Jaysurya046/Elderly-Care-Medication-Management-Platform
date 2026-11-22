import { NextRequest, NextResponse } from 'next/server';
import { signUpSchema } from '@elder-care/core';
import { signUpUser } from '@/services/auth-service';
import { createSession, setSessionCookie } from '@/lib/session';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validatedData = signUpSchema.parse(rawBody);

    const user = await signUpUser(validatedData);
    const sessionId = await createSession(user.id);
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

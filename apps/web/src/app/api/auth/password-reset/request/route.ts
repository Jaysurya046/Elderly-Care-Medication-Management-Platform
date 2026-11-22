import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordResetSchema } from '@elder-care/core';
import { requestPasswordReset } from '@/services/auth-service';
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

    const rawBody = await request.json();
    const { email } = requestPasswordResetSchema.parse(rawBody);

    await requestPasswordReset(email);

    // Strictly never return the token in any environment (including dev/test)
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, password reset instructions have been dispatched.',
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

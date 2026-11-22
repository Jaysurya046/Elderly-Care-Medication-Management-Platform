import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordResetSchema } from '@elder-care/core';
import { requestPasswordReset } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const { email } = requestPasswordResetSchema.parse(rawBody);

    const result = await requestPasswordReset(email);
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, password reset instructions have been dispatched.',
      ...(result.rawToken ? { devResetToken: result.rawToken } : {}),
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

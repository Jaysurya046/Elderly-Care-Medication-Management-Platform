import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordSchema } from '@elder-care/core';
import { resetPasswordWithToken } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const { token, newPassword } = resetPasswordSchema.parse(rawBody);

    await resetPasswordWithToken(token, newPassword);
    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. All active sessions have been revoked. Please sign in.',
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

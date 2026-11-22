import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    await clearSessionCookie();
    return NextResponse.json({ success: true, message: 'Signed out successfully.' });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

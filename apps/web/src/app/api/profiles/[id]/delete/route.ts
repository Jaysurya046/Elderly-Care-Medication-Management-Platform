import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { Role } from '@elder-care/db';
import { requestProfileDeletion } from '@/services/profile-service';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const { id } = await params;
    // Profile deletion strictly requires OWNER role
    await requireProfileAccess(id, { role: Role.OWNER });

    const gracePeriodEnd = await requestProfileDeletion(id);

    return NextResponse.json({
      success: true,
      message: 'Profile deletion scheduled with a 30-day grace period.',
      hardDeletionDate: gracePeriodEnd.toISOString(),
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { Role } from '@elder-care/db';
import { requestProfileDeletion } from '@/services/profile-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

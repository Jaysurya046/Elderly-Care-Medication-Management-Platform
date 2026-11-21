import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { recordDoseAction } from '@/services/medication-service';
import { prisma } from '@elder-care/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; doseId: string }> }
) {
  try {
    const { id, doseId } = await params;
    const body = await request.json();

    // Verify dose belongs to profile before acting (return 404 otherwise)
    const dose = await prisma.doseEvent.findUnique({
      where: { id: doseId },
      select: { id: true, profileId: true },
    });

    if (!dose || dose.profileId !== id) {
      return NextResponse.json(
        { success: false, error: 'Dose event not found for this profile.' },
        { status: 404 }
      );
    }

    // Derive required permission from the action
    const requiredScope =
      body.action === 'TAKE' ||
      body.action === 'SNOOZE' ||
      body.action === 'SKIP' ||
      body.action === 'CORRECTION'
        ? 'manage_medications'
        : 'view_medications';

    await requireProfileAccess(id, { scope: requiredScope });

    const updatedDose = await recordDoseAction(doseId, body, undefined, id);

    return NextResponse.json({ success: true, data: updatedDose });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 400 }
    );
  }
}

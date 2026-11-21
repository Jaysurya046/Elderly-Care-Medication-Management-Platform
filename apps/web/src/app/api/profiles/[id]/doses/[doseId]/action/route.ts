import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { recordDoseAction } from '@/services/medication-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; doseId: string }> }
) {
  try {
    const { id, doseId } = await params;
    await requireProfileAccess(id, { scope: 'view_medications' });

    const body = await request.json();
    const updatedDose = await recordDoseAction(doseId, body);

    return NextResponse.json({ success: true, data: updatedDose });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 400 }
    );
  }
}

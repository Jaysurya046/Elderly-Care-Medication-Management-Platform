import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { createMedication } from '@/services/medication-service';
import { prisma } from '@elder-care/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireProfileAccess(id, { scope: 'view_medications' });

    const medications = await prisma.medication.findMany({
      where: { profileId: id, isActive: true },
      include: { schedules: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: medications });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireProfileAccess(id, { scope: 'manage_medications' });

    const body = await request.json();
    const result = await createMedication(id, body);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

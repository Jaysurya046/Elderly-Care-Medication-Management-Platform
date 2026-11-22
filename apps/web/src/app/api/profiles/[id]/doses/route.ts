import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { getProfileDoses } from '@/services/medication-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'view_medications' });

    const searchParams = request.nextUrl.searchParams;
    const startStr = searchParams.get('startDate');
    const endStr = searchParams.get('endDate');
    const statusStr = searchParams.get('status');

    const startDate = startStr ? new Date(startStr) : undefined;
    const endDate = endStr ? new Date(endStr) : undefined;
    const status = statusStr as any;

    const doses = await getProfileDoses(id, { startDate, endDate, status }, user.id);
    return NextResponse.json({ success: true, data: doses });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

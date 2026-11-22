import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { getActivityFeed } from '@/services/care-notes-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'view_notes' });

    const feed = await getActivityFeed(id, user.id);
    return NextResponse.json({ success: true, data: feed });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

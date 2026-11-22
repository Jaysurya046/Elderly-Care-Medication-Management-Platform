import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { createCareNote, getCareNotes } from '@/services/care-notes-service';
import { createCareNoteSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireProfileAccess(id, { scope: 'view_notes' });

    const notes = await getCareNotes(id, user.id);
    return NextResponse.json({ success: true, data: notes });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

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
    const { user } = await requireProfileAccess(id, { scope: 'write_notes' });

    const rawBody = await request.json();
    const validatedData = createCareNoteSchema.parse(rawBody);

    const note = await createCareNote(id, validatedData, user.id);
    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

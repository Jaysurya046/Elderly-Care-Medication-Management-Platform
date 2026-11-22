import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { setMemberPasscode, verifyMemberPasscode } from '@/services/auth-service';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { prisma, Role } from '@elder-care/db';
import { setPasscodeSchema, verifyPasscodeSchema } from '@elder-care/core';
import { z } from 'zod';

const passcodeActionSchema = z.discriminatedUnion('action', [
  setPasscodeSchema.extend({ action: z.literal('set') }),
  verifyPasscodeSchema.extend({ action: z.literal('verify') }),
]);

export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { success: false, error: csrf.error },
        { status: csrf.status || 403 }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json();
    const validated = passcodeActionSchema.parse(rawBody);

    if (validated.action === 'set') {
      // Membership must exist and caller must be the OWNER of that profile OR the membership's own user
      const membership = await prisma.membership.findUnique({
        where: { id: validated.membershipId },
        include: { profile: true },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        return NextResponse.json(
          { success: false, error: 'Membership not found or inactive.' },
          { status: 404 }
        );
      }

      const isOwner = membership.profile.ownerId === user.id;
      const isSelf = membership.userId === user.id;

      if (!isOwner && !isSelf) {
        return NextResponse.json(
          { success: false, error: 'You do not have permission to set a passcode for this member.' },
          { status: 403 }
        );
      }

      await setMemberPasscode(validated.membershipId, validated.passcode);
      return NextResponse.json({ success: true, message: 'Passcode updated.' });
    } else if (validated.action === 'verify') {
      const result = await verifyMemberPasscode(validated.membershipId, validated.passcode, user);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Passcode verified.' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { handleApiError } from '@/lib/api-error';
import { prisma, Role } from '@elder-care/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        profile: true,
      },
    });

    const sanitizedMemberships = memberships.map((m) => {
      const profile = { ...m.profile };
      if (m.role !== Role.OWNER) {
        delete (profile as any).emergencyCode;
      }
      return {
        id: m.id,
        role: m.role,
        scopes: m.scopes,
        profile,
        careProfile: profile,
      };
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        consentVersion: user.consentVersion,
      },
      memberships: sanitizedMemberships,
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

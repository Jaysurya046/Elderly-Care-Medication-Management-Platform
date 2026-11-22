import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { updateCareProfile } from '@/services/profile-service';
import { updateCareProfileSchema } from '@elder-care/core';
import { handleApiError } from '@/lib/api-error';
import { validateCsrfRequest } from '@/lib/csrf';
import { recordAuditLog, extractClientDetails } from '@/lib/audit';
import { Role, prisma } from '@elder-care/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { ip, userAgent } = extractClientDetails(request);
    const { profile, membership, user } = await requireProfileAccess(id);

    // Audit successful profile read (Section 8: Health Data Access Audit)
    await recordAuditLog({
      profileId: id,
      actorUserId: user?.id || membership?.userId || null,
      actorMembershipId: membership?.id || null,
      action: 'PROFILE:VIEW',
      entityType: 'CareProfile',
      entityId: id,
      ip,
      userAgent,
    });

    const profileData = { ...profile };
    // Emergency code exposure: return emergencyCode ONLY to OWNER
    if (membership.role !== Role.OWNER) {
      delete (profileData as any).emergencyCode;
    }

    const members = typeof prisma.membership?.findMany === 'function'
      ? await prisma.membership.findMany({
        where: { profileId: id },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      : [];

    return NextResponse.json({
      success: true,
      data: {
        profile: profileData,
        userRole: membership.role,
        scopes: membership.scopes,
        members,
      },
    });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

export async function PATCH(
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
    // AST Route Guard requirement: every exported HTTP method directly calls requireProfileAccess
    const { membership } = await requireProfileAccess(id, { role: Role.OWNER });

    const rawBody = await request.json();
    const validatedData = updateCareProfileSchema.parse(rawBody);

    const updated = await updateCareProfile(id, validatedData, membership.userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

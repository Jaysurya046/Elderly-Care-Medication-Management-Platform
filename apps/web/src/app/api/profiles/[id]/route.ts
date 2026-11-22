import { NextRequest, NextResponse } from 'next/server';
import { requireProfileAccess } from '@/lib/auth-guard';
import { updateCareProfile } from '@/services/profile-service';
import { updateCareProfileSchema, hasPermission } from '@elder-care/core';
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

    // Enforce permission matrix via hasPermission from packages/core
    const canView =
      membership.role === Role.OWNER ||
      hasPermission(
        {
          role: membership.role as any,
          scopes: (membership.scopes as any) || {},
          status: (membership.status as any) || 'ACTIVE',
        },
        'read:medications'
      );

    if (!canView) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions to view profile details.' },
        { status: 403 }
      );
    }

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

    const isOwner = membership.role === Role.OWNER;
    const profileData = { ...profile };

    // Role-based field restrictions: non-owners must never see emergencyCode or deletion timing
    if (!isOwner) {
      delete (profileData as any).emergencyCode;
      delete (profileData as any).deletionRequestedAt;
    }

    // Use explicit select to guarantee no passcodeHash or passcodeFailures are returned
    const members = typeof prisma.membership?.findMany === 'function'
      ? await prisma.membership.findMany({
        where: { profileId: id },
        select: {
          id: true,
          role: true,
          scopes: true,
          status: true,
          createdAt: true,
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
    await requireProfileAccess(id, { role: Role.OWNER });
    const rawBody = await request.json();
    const validatedData = updateCareProfileSchema.parse(rawBody);

    const updated = await updateCareProfile(id, validatedData);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

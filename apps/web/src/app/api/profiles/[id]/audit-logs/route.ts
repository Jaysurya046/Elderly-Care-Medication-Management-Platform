import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@elder-care/db';
import { requireProfileAccess, ForbiddenError } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/api-error';
import { recordAuditLog, extractClientDetails } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Direct invocation of requireProfileAccess for AST route-guard compliance
    const { user, membership } = await requireProfileAccess(id);

    // Access restricted to OWNER or CAREGIVER
    if (membership.role !== 'OWNER' && membership.role !== 'CAREGIVER') {
      throw new ForbiddenError('Only OWNER or CAREGIVER can inspect the security audit trail');
    }

    const logs = await prisma.auditLog.findMany({
      where: { profileId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        profileId: true,
        actorUserId: true,
        actorMembershipId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });

    const client = extractClientDetails(request);
    await recordAuditLog({
      profileId: id,
      actorUserId: user.id,
      actorMembershipId: membership.id,
      action: 'AUDIT_LOG:VIEW',
      entityType: 'AuditLog',
      entityId: id,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error: any) {
    return handleApiError(error, request);
  }
}

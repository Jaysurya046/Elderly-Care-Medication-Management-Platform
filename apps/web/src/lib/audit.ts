import { prisma } from '@elder-care/db';
import { sanitizeIpAddress, sanitizeAuditMetadata, AuditAction } from '@elder-care/core';

export interface WriteAuditLogParams {
  profileId?: string | null;
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends an audit log entry directly to the append-only AuditLog table.
 * Strictly sanitizes IP (anonymized/hashed) and metadata (no health values or passwords).
 */
export async function recordAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    const sanitizedIp = sanitizeIpAddress(params.ip);
    const sanitizedMeta = sanitizeAuditMetadata(params.metadata);

    await prisma.auditLog.create({
      data: {
        profileId: params.profileId || null,
        actorUserId: params.actorUserId || null,
        actorMembershipId: params.actorMembershipId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        metadata: sanitizedMeta as any,
        ip: sanitizedIp,
        userAgent: params.userAgent || null,
      },
    });
  } catch (error) {
    // Audit logging should not crash the primary flow, but must log errors securely
    console.error('CRITICAL: Failed to write audit log entry:', error);
  }
}

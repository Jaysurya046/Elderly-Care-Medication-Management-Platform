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
 * Extracts client IP (supporting X-Forwarded-For and X-Real-IP) and User-Agent
 * from an incoming HTTP request.
 */
export function extractClientDetails(request?: Request | null): { ip: string; userAgent: string | null } {
  if (!request) return { ip: 'unknown', userAgent: null };
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const rawIp = forwardedFor ? forwardedFor.split(',')[0].trim() : realIp || 'unknown';
  const userAgent = request.headers.get('user-agent');
  return { ip: rawIp, userAgent };
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
    // Audit logging failure is logged, but should not crash the primary flow
    console.error('CRITICAL: Failed to write audit log entry:', error);
  }
}

import { prisma, Role, Membership, CareProfile, User } from '@elder-care/db';
import { ScopeKey, Scopes } from '@elder-care/core';
import { getCurrentUser } from './session';
import { recordAuditLog } from './audit';

export class UnauthorizedError extends Error {
  public statusCode = 401;
  constructor(message: string = 'You must be signed in to perform this action.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  public statusCode = 403;
  constructor(message: string = 'You do not have permission to access this health data.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  constructor(message: string = 'Requested care profile was not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  constructor(message: string = 'Conflict: resource was modified concurrently.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface ProfileAccessOptions {
  role?: Role;
  scope?: ScopeKey;
  isPrivateItem?: boolean;
  userIdOverride?: string; // For testing or background context
}

export interface ProfileAccessResult {
  user: User;
  membership: Membership;
  profile: CareProfile;
}

/**
 * Central authorization helper (Section 4, Goal.md).
 * Checks membership and scopes against the database on EVERY request.
 * Immediate revocation takes effect on the subsequent request.
 * Throws typed errors and audits unauthorized access attempts.
 */
export async function requireProfileAccess(
  profileId: string,
  options: ProfileAccessOptions = {}
): Promise<ProfileAccessResult> {
  const user = options.userIdOverride
    ? await prisma.user.findUnique({ where: { id: options.userIdOverride } })
    : await getCurrentUser();

  if (!user) {
    await recordAuditLog({
      profileId,
      action: 'HEALTH_DATA:READ',
      entityType: 'CareProfile',
      entityId: profileId,
      metadata: { reason: 'UNAUTHENTICATED_ACCESS_ATTEMPT' },
    });
    throw new UnauthorizedError();
  }

  const profile = await prisma.careProfile.findUnique({
    where: { id: profileId },
  });

  if (!profile) {
    throw new NotFoundError();
  }

  // Query membership directly from DB (no token caching of scopes)
  const membership = await prisma.membership.findUnique({
    where: {
      profileId_userId: {
        profileId,
        userId: user.id,
      },
    },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    await recordAuditLog({
      profileId,
      actorUserId: user.id,
      actorMembershipId: membership?.id,
      action: 'HEALTH_DATA:READ',
      entityType: 'CareProfile',
      entityId: profileId,
      metadata: {
        reason: 'INACTIVE_OR_REVOKED_MEMBERSHIP',
        status: membership?.status || 'NO_MEMBERSHIP',
      },
    });
    throw new ForbiddenError(
      membership?.status === 'REVOKED'
        ? 'Your access to this care profile has been revoked.'
        : 'You are not an active member of this care circle.'
    );
  }

  const scopes = (membership.scopes || {}) as Partial<Scopes>;

  // Check role requirement if requested
  if (options.role && membership.role !== options.role) {
    // OWNER can satisfy any role requirement
    if (membership.role !== Role.OWNER) {
      await recordAuditLog({
        profileId,
        actorUserId: user.id,
        actorMembershipId: membership.id,
        action: 'HEALTH_DATA:READ',
        entityType: 'CareProfile',
        entityId: profileId,
        metadata: {
          reason: 'ROLE_MISMATCH',
          requiredRole: options.role,
          actualRole: membership.role,
        },
      });
      throw new ForbiddenError(`Action requires role ${options.role}.`);
    }
  }

  // Check specific scope requirement
  if (options.scope) {
    const hasScope = membership.role === Role.OWNER || Boolean(scopes[options.scope]);
    if (!hasScope) {
      await recordAuditLog({
        profileId,
        actorUserId: user.id,
        actorMembershipId: membership.id,
        action: 'HEALTH_DATA:READ',
        entityType: 'CareProfile',
        entityId: profileId,
        metadata: {
          reason: 'MISSING_SCOPE',
          requiredScope: options.scope,
        },
      });
      throw new ForbiddenError(`You do not have the required scope (${options.scope}).`);
    }
  }

  // Check private item barrier (Section 4 & 5)
  if (options.isPrivateItem) {
    const canViewPrivate = membership.role === Role.OWNER || Boolean(scopes.view_private_items);
    if (!canViewPrivate) {
      await recordAuditLog({
        profileId,
        actorUserId: user.id,
        actorMembershipId: membership.id,
        action: 'HEALTH_DATA:READ',
        entityType: 'CareProfile',
        entityId: profileId,
        metadata: {
          reason: 'PRIVATE_ITEM_RESTRICTION',
        },
      });
      throw new ForbiddenError('This item is marked private and cannot be viewed.');
    }
  }

  return { user, membership, profile };
}

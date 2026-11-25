import { prisma, Role, MembershipStatus, Membership, Invitation } from '@elder-care/db';
import {
  DEFAULT_ROLE_SCOPES,
  Scopes,
  RateLimitError,
  ServiceUnavailableError,
} from '@elder-care/core';
import { generateRandomToken, hashToken } from '../lib/crypto';
import { checkRateLimit } from '../lib/rate-limiter';
import {
  requireProfileAccess,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../lib/auth-guard';
import { recordAuditLog } from '../lib/audit';
import { sendEmail } from '../lib/email';
import { CaregiverInvitationEmail } from '@elder-care/email';
import React from 'react';

export interface CreateInvitationInput {
  email: string;
  role: Role;
  scopes?: Partial<Scopes>;
}

export async function createCareCircleInvitation(
  profileId: string,
  input: CreateInvitationInput,
  actorUserId?: string
): Promise<{ invitation: Invitation; rawToken: string }> {
  // Reject role: OWNER invitations
  if (input.role === Role.OWNER) {
    throw new ValidationError('Cannot invite a member with role OWNER. Transfer ownership instead.');
  }

  const { membership, profile } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const rateLimitKey = `rate_limit:invite:${profileId}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 10, 3600);
  if (!rateLimit.success) {
    if (rateLimit.isDown) {
      throw new ServiceUnavailableError(
        rateLimit.error || 'Rate limiting service temporarily unavailable.'
      );
    }
    throw new RateLimitError('Too many invitation requests. Please try again later.');
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  // Combine default role scopes with any custom scopes provided
  const baseScopes = DEFAULT_ROLE_SCOPES[input.role] || DEFAULT_ROLE_SCOPES.FAMILY;
  const scopes = { ...baseScopes, ...input.scopes };

  // Generate 7-day single-use token
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await prisma.invitation.create({
    data: {
      profileId,
      email: normalizedEmail,
      role: input.role,
      scopes,
      tokenHash,
      expiresAt,
    },
  });

  // Actually send the invitation email using the existing template
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const invitationUrl = `${appBaseUrl}/invite/accept?token=${rawToken}`;
  await sendEmail({
    to: normalizedEmail,
    subject: `Invitation to join ${profile.displayName}'s Care Circle`,
    template: React.createElement(CaregiverInvitationEmail, {
      elderName: profile.displayName,
      role: input.role,
      invitationUrl,
      expiresInDays: 7,
    }),
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'CARE_CIRCLE:INVITE',
    entityType: 'Invitation',
    entityId: invitation.id,
    metadata: { role: input.role, invitedEmail: normalizedEmail },
  });

  return { invitation, rawToken };
}

export async function acceptCareCircleInvitation(
  rawToken: string,
  currentUserId: string
): Promise<Membership> {
  const rateLimitKey = `rate_limit:invite_accept:${currentUserId}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 10, 3600);
  if (!rateLimit.success) {
    if (rateLimit.isDown) {
      throw new ServiceUnavailableError(
        rateLimit.error || 'Rate limiting service temporarily unavailable.'
      );
    }
    throw new RateLimitError('Too many invitation acceptance attempts. Please try again later.');
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUserId },
  });

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const tokenHash = hashToken(rawToken);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
  });

  if (!invitation) {
    throw new NotFoundError('Invalid or expired invitation token.');
  }

  if (invitation.usedAt) {
    throw new ConflictError('This invitation has already been used.');
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new ConflictError('This invitation has expired. Please request a new invitation.');
  }

  // Invitee must be signed in with the invited email address (Section 4)
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ForbiddenError(
      `This invitation was issued to ${invitation.email}. You are signed in as ${user.email}.`
    );
  }

  // Make acceptance atomic with invitation.updateMany and check count
  const updateRes = await prisma.invitation.updateMany({
    where: { id: invitation.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (updateRes.count !== 1) {
    throw new ConflictError('This invitation has already been used.');
  }

  // Membership stays INVITED until elder or an OWNER confirms role and scopes
  const membership = await prisma.membership.upsert({
    where: {
      profileId_userId: {
        profileId: invitation.profileId,
        userId: user.id,
      },
    },
    create: {
      profileId: invitation.profileId,
      userId: user.id,
      role: invitation.role,
      scopes: invitation.scopes as any,
      status: MembershipStatus.INVITED,
    },
    update: {
      role: invitation.role,
      scopes: invitation.scopes as any,
      status: MembershipStatus.INVITED,
      revokedAt: null,
    },
  });

  await recordAuditLog({
    profileId: invitation.profileId,
    actorUserId: user.id,
    actorMembershipId: membership.id,
    action: 'CARE_CIRCLE:ACCEPT',
    entityType: 'Membership',
    entityId: membership.id,
    metadata: { role: invitation.role, status: 'INVITED_PENDING_CONFIRMATION' },
  });

  return membership;
}

export async function getPendingCareCircleConfirmations(
  profileId: string,
  actorUserId?: string
): Promise<Membership[]> {
  await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  return prisma.membership.findMany({
    where: {
      profileId,
      status: MembershipStatus.INVITED,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function confirmCareCircleMember(
  profileId: string,
  targetMembershipId: string,
  actorUserId?: string,
  confirmedScopes?: Partial<Scopes>
): Promise<Membership> {
  const { membership: actorMembership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const target = await prisma.membership.findUnique({
    where: { id: targetMembershipId },
  });

  if (!target || target.profileId !== profileId) {
    throw new NotFoundError('Membership not found in this profile.');
  }

  const finalScopes = confirmedScopes
    ? { ...((target.scopes || {}) as Record<string, boolean>), ...confirmedScopes }
    : target.scopes;

  const confirmed = await prisma.membership.update({
    where: { id: targetMembershipId },
    data: {
      status: MembershipStatus.ACTIVE,
      scopes: finalScopes as any,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: actorMembership.userId,
    actorMembershipId: actorMembership.id,
    action: 'CARE_CIRCLE:CONFIRM_MEMBERSHIP',
    entityType: 'Membership',
    entityId: targetMembershipId,
    metadata: { role: target.role, scopes: finalScopes },
  });

  return confirmed;
}

export async function revokeCareCircleMembership(
  profileId: string,
  targetMembershipId: string,
  actorUserId?: string
): Promise<Membership> {
  const { membership: actorMembership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const target = await prisma.membership.findUnique({
    where: { id: targetMembershipId },
  });

  if (!target || target.profileId !== profileId) {
    throw new NotFoundError('Membership not found in this profile.');
  }

  if (target.role === Role.OWNER) {
    const ownerCount = await prisma.membership.count({
      where: { profileId, role: Role.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (ownerCount <= 1) {
      throw new ConflictError('Cannot remove the last owner of the profile.');
    }
  }

  const revoked = await prisma.membership.update({
    where: { id: targetMembershipId },
    data: {
      status: MembershipStatus.REVOKED,
      revokedAt: new Date(),
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: actorMembership.userId,
    actorMembershipId: actorMembership.id,
    action: 'CARE_CIRCLE:REVOKE',
    entityType: 'Membership',
    entityId: targetMembershipId,
  });

  return revoked;
}

export async function updateCareCircleScopes(
  profileId: string,
  targetMembershipId: string,
  newScopes: Partial<Scopes>,
  actorUserId?: string
): Promise<Membership> {
  const { membership: actorMembership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const target = await prisma.membership.findUnique({
    where: { id: targetMembershipId },
  });

  if (!target || target.profileId !== profileId) {
    throw new NotFoundError('Membership not found.');
  }

  const mergedScopes = { ...((target.scopes || {}) as Record<string, boolean>), ...newScopes };

  const updated = await prisma.membership.update({
    where: { id: targetMembershipId },
    data: {
      scopes: mergedScopes,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: actorMembership.userId,
    actorMembershipId: actorMembership.id,
    action: 'CARE_CIRCLE:UPDATE_SCOPES',
    entityType: 'Membership',
    entityId: targetMembershipId,
    metadata: { newScopes },
  });

  return updated;
}

export async function transferProfileOwnership(
  profileId: string,
  targetMembershipId: string,
  actorUserId?: string
): Promise<{ success: boolean }> {
  const { membership: actorMembership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const target = await prisma.membership.findUnique({
    where: { id: targetMembershipId },
  });

  if (!target || target.profileId !== profileId) {
    throw new NotFoundError('Target membership not found in this profile.');
  }

  if (target.status !== MembershipStatus.ACTIVE) {
    throw new ConflictError('Cannot transfer ownership to an inactive or revoked member.');
  }

  // Update profile ownerId
  await prisma.careProfile.update({
    where: { id: profileId },
    data: { ownerId: target.userId },
  });

  // Promote target member to OWNER with default OWNER scopes
  await prisma.membership.update({
    where: { id: targetMembershipId },
    data: {
      role: Role.OWNER,
      scopes: DEFAULT_ROLE_SCOPES.OWNER as any,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: actorMembership.userId,
    actorMembershipId: actorMembership.id,
    action: 'CARE_CIRCLE:TRANSFER_OWNERSHIP',
    entityType: 'CareProfile',
    entityId: profileId,
    metadata: {
      previousOwnerId: actorMembership.userId,
      newOwnerUserId: target.userId,
      newOwnerMembershipId: target.id,
    },
  });

  return { success: true };
}

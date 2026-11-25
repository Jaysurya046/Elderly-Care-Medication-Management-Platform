import { createHash } from 'node:crypto';
import { prisma, User } from '@elder-care/db';
import {
  AuthError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServiceUnavailableError,
} from '@elder-care/core';
import {
  hashSecret,
  verifySecret,
  generateTotpSecret,
  verifyTotpCode,
  encryptString,
  decryptString,
  generateRandomToken,
} from '../lib/crypto';
import { checkRateLimit, resetRateLimit } from '../lib/rate-limiter';
import { recordAuditLog } from '../lib/audit';
import { UnauthorizedError, ForbiddenError } from '../lib/auth-guard';

export interface SignUpInput {
  email: string;
  name: string;
  password: string;
  consentGiven: boolean;
}

export async function signUpUser(input: SignUpInput): Promise<User> {
  if (!input.consentGiven) {
    throw new ValidationError('Explicit consent to data processing is required to create an account.');
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
  });
  if (existing) {
    throw new ConflictError('An account with this email address already exists.');
  }

  const passwordHash = await hashSecret(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
      consentVersion: 'v1.0',
    },
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'AUTH:LOGIN',
    entityType: 'User',
    entityId: user.id,
    metadata: { method: 'SIGN_UP' },
  });

  return user;
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  totpCode?: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim();
  const rateLimitKey = `rate_limit:login:${normalizedEmail}`;

  const rateLimit = await checkRateLimit(rateLimitKey, 5, 900);
  if (!rateLimit.success) {
    if (rateLimit.isDown) {
      throw new ServiceUnavailableError(
        rateLimit.error || 'Rate limiting service temporarily unavailable.'
      );
    }
    throw new RateLimitError(
      `Too many failed attempts. Account temporarily locked. Try again in ${Math.ceil(
        rateLimit.resetSeconds / 60
      )} minutes.`
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.deletedAt) {
    throw new AuthError('Invalid email or password.');
  }

  const passwordValid = await verifySecret(user.passwordHash, password);
  if (!passwordValid) {
    throw new AuthError('Invalid email or password.');
  }

  // Check 2FA if enabled
  if (user.totpSecret) {
    if (!totpCode) {
      throw new AuthError('TOTP_REQUIRED');
    }
    const decryptedSecret = decryptString(user.totpSecret);
    const totpValid = verifyTotpCode(decryptedSecret, totpCode);
    if (!totpValid) {
      throw new AuthError('Invalid two-factor authentication code.');
    }
  }

  await resetRateLimit(rateLimitKey);

  await recordAuditLog({
    actorUserId: user.id,
    action: 'AUTH:LOGIN',
    entityType: 'User',
    entityId: user.id,
    metadata: { method: user.totpSecret ? 'PASSWORD_AND_TOTP' : 'PASSWORD' },
  });

  return user;
}

export async function setMemberPasscode(
  membershipId: string,
  passcode: string
): Promise<void> {
  if (!/^\d{4,6}$/.test(passcode)) {
    throw new ValidationError('Passcode must be between 4 and 6 numeric digits.');
  }

  const passcodeHash = await hashSecret(passcode);
  await prisma.membership.update({
    where: { id: membershipId },
    data: {
      passcodeHash,
      passcodeFailures: 0,
      passcodeLockedUntil: null,
    },
  });
}

export async function verifyMemberPasscode(
  membershipId: string,
  candidatePasscode: string,
  signedInUser?: User | string | null
): Promise<{ success: boolean; error?: string }> {
  const userId = typeof signedInUser === 'string' ? signedInUser : signedInUser?.id;
  if (!userId) {
    throw new UnauthorizedError('Passcode verification requires a signed-in session.');
  }

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });

  if (!membership || !membership.passcodeHash) {
    return { success: false, error: 'No passcode configured for this profile.' };
  }

  // Verify membership belongs to signed-in user
  if (membership.userId !== userId) {
    throw new ForbiddenError('Membership does not belong to the signed-in user.');
  }

  // Verify membership is active
  if (membership.status !== 'ACTIVE') {
    throw new ForbiddenError('Membership is not active.');
  }

  // Rate limit passcode attempts in Redis (5 per 15 minutes per membership)
  const rateLimitKey = `passcode:${membership.id}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 5, 15 * 60);
  if (!rateLimit.success) {
    if (rateLimit.isDown) {
      throw new ServiceUnavailableError(
        rateLimit.error || 'Rate limiting service temporarily unavailable.'
      );
    }
    return {
      success: false,
      error: 'Passcode locked due to 5 consecutive failures. Please try again in 15 minute(s).',
    };
  }

  // Check database lockout
  const now = new Date();
  if (membership.passcodeLockedUntil && membership.passcodeLockedUntil > now) {
    const minutesLeft = Math.ceil(
      (membership.passcodeLockedUntil.getTime() - now.getTime()) / (60 * 1000)
    );
    return {
      success: false,
      error: `Passcode locked due to multiple failed attempts. Try again in ${minutesLeft} minute(s).`,
    };
  }

  const isValid = await verifySecret(membership.passcodeHash, candidatePasscode);

  if (isValid) {
    // Reset Redis rate limit counter and DB failure counter on success
    await resetRateLimit(rateLimitKey);
    await prisma.membership.update({
      where: { id: membershipId },
      data: {
        passcodeFailures: 0,
        passcodeLockedUntil: null,
      },
    });

    await recordAuditLog({
      profileId: membership.profileId,
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: 'AUTH:PASSCODE_VERIFIED',
      entityType: 'Membership',
      entityId: membership.id,
    });

    return { success: true };
  }

  // Increment failures
  const newFailures = membership.passcodeFailures + 1;
  const shouldLock = newFailures >= 5;
  const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null; // 15 min lockout

  await prisma.membership.update({
    where: { id: membershipId },
    data: {
      passcodeFailures: newFailures,
      passcodeLockedUntil: lockedUntil,
    },
  });

  if (shouldLock) {
    await recordAuditLog({
      profileId: membership.profileId,
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: 'AUTH:PASSCODE_LOCKED',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { failures: newFailures },
    });
    return {
      success: false,
      error: 'Passcode locked due to 5 consecutive failures. Please wait 15 minutes or use your password.',
    };
  }

  return {
    success: false,
    error: `Incorrect passcode. ${5 - newFailures} attempt(s) remaining before lockout.`,
  };
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Requests a password reset. Rate-limited (3 attempts per hour).
 * Generates an unguessable raw token, stores only its SHA-256 hash with 1 hour expiration.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; rawToken?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const rateLimitKey = `rate_limit:pw_reset:${normalizedEmail}`;

  const rateLimit = await checkRateLimit(rateLimitKey, 3, 3600);
  if (!rateLimit.success) {
    if (rateLimit.isDown) {
      throw new ServiceUnavailableError(
        rateLimit.error || 'Rate limiting service temporarily unavailable.'
      );
    }
    throw new RateLimitError('Too many password reset requests. Please wait an hour before trying again.');
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.deletedAt) {
    // Return success to avoid email enumeration
    return { success: true };
  }

  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'AUTH:LOGIN',
    entityType: 'User',
    entityId: user.id,
    metadata: { action: 'PASSWORD_RESET_REQUESTED' },
  });

  return {
    success: true,
    rawToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
  };
}

/**
 * Verifies a password reset token, updates password with Argon2id,
 * and strictly revokes ALL active sessions for that user across all devices.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean }> {
  if (newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long.');
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < now) {
    throw new AuthError('Password reset link is invalid or has expired.');
  }

  // Atomically mark token as used
  const updateRes = await prisma.passwordResetToken.updateMany({
    where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  if (updateRes.count !== 1) {
    throw new ConflictError('Password reset link has already been used.');
  }

  const passwordHash = await hashSecret(newPassword);
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: { passwordHash },
  });

  // CRITICAL SECURITY CONTROL: Revoke all active sessions on password change
  await prisma.session.deleteMany({
    where: { userId: resetToken.userId },
  });

  await recordAuditLog({
    actorUserId: resetToken.userId,
    action: 'AUTH:LOGOUT',
    entityType: 'User',
    entityId: resetToken.userId,
    metadata: { reason: 'PASSWORD_CHANGED_ALL_SESSIONS_REVOKED' },
  });

  return { success: true };
}

/**
 * Enrolls TOTP two-factor authentication for a user.
 * Generates an encrypted secret stored at rest.
 */
export async function enrolTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) throw new UnauthorizedError();

  const totp = generateTotpSecret(user.email);
  const encryptedSecret = encryptString(totp.secret);

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encryptedSecret },
  });

  return { secret: totp.secret, otpauthUrl: totp.uri };
}

/**
 * Disables TOTP two-factor authentication for a user.
 */
export async function disableTotp(userId: string): Promise<{ success: boolean }> {
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: null },
  });

  await recordAuditLog({
    actorUserId: userId,
    action: 'AUTH:LOGOUT',
    entityType: 'User',
    entityId: userId,
    metadata: { action: 'TOTP_DISABLED' },
  });

  return { success: true };
}

export interface UserSessionView {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
  isCurrent: boolean;
}

/**
 * Lists all active database sessions for a user.
 */
export async function listUserSessions(
  userId: string,
  currentSessionId?: string
): Promise<UserSessionView[]> {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  const currentHashed = currentSessionId ? hashToken(currentSessionId) : null;

  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    ip: s.ip,
    userAgent: s.userAgent,
    isCurrent: s.id === currentSessionId || s.id === currentHashed,
  }));
}

/**
 * Revokes an individual user session from the database.
 */
export async function revokeUserSession(
  userId: string,
  targetSessionId: string
): Promise<{ success: boolean }> {
  await prisma.session.deleteMany({
    where: { id: targetSessionId, userId },
  });

  await recordAuditLog({
    actorUserId: userId,
    action: 'AUTH:LOGOUT',
    entityType: 'Session',
    entityId: targetSessionId,
    metadata: { reason: 'INDIVIDUAL_SESSION_REVOKED' },
  });

  return { success: true };
}

/**
 * Revokes all sessions for a user (except optionally the current one).
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string
): Promise<{ success: boolean }> {
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
  });

  return { success: true };
}

export const registerUser = signUpUser;
export const loginWithPassword = authenticateWithPassword;


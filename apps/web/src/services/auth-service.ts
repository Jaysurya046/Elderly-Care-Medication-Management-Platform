import { prisma, User } from '@elder-care/db';
import {
  hashSecret,
  verifySecret,
  generateTotpSecret,
  verifyTotpCode,
  encryptString,
  decryptString,
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
    throw new Error('Explicit consent to data processing is required to create an account.');
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
  });
  if (existing) {
    throw new Error('An account with this email address already exists.');
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
    throw new Error(
      `Too many failed attempts. Account temporarily locked. Try again in ${Math.ceil(
        rateLimit.resetSeconds / 60
      )} minutes.`
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.deletedAt) {
    throw new Error('Invalid email or password.');
  }

  const passwordValid = await verifySecret(user.passwordHash, password);
  if (!passwordValid) {
    throw new Error('Invalid email or password.');
  }

  // Check 2FA if enabled
  if (user.totpSecret) {
    if (!totpCode) {
      throw new Error('TOTP_REQUIRED');
    }
    const decryptedSecret = decryptString(user.totpSecret);
    const totpValid = verifyTotpCode(decryptedSecret, totpCode);
    if (!totpValid) {
      throw new Error('Invalid two-factor authentication code.');
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
    throw new Error('Passcode must be between 4 and 6 numeric digits.');
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

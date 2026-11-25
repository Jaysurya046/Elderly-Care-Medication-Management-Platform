import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@elder-care/db';
import {
  signUpUser,
  authenticateWithPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  listUserSessions,
  revokeUserSession,
} from '../services/auth-service';
import { createCareProfile } from '../services/profile-service';
import { createSession, validateSession, destroySession } from '../lib/session';

describe('Real Database Integration: User Auth, Profile Creation & Immediate Session Revocation', () => {
  let isDbAvailable = false;
  let testEmail: string;
  let createdUserId: string;

  beforeAll(async () => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('PostgreSQL connection timed out after 2500ms')), 2500)),
      ]);
      isDbAvailable = true;
    } catch (err) {
      const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
      if (isDbRequired) {
        throw new Error(`Real database required (REQUIRE_DB=1 or CI=true) but connection failed: ${(err as Error).message}`);
      }
      console.warn('Real Postgres database not reachable, skipping live DB auth lifecycle test');
      return;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && createdUserId) {
      try {
        await prisma.auditLog.deleteMany({ where: { actorUserId: createdUserId } }).catch(() => {});
        await prisma.careProfile.deleteMany({ where: { ownerId: createdUserId } }).catch(() => {});
        await prisma.session.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: createdUserId } }).catch(() => {});
      } catch {
        // ignore
      }
    }
  });

  it('runs complete lifecycle: signup -> profile creation -> signin -> session revocation -> rejected on next request', async () => {
    if (!isDbAvailable) {
      const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
      if (isDbRequired) {
        throw new Error('Real database required but unavailable');
      }
      console.warn('Skipping test because real database is not available');
      return;
    }

    testEmail = `integration-${Date.now()}@test.com`;

    // 1. Sign up user with explicit consent
    const user = await signUpUser({
      name: 'Integration Elder',
      email: testEmail,
      password: 'SecurePassword123!',
      consentGiven: true,
    });
    createdUserId = user.id;

    expect(user.id).toBeDefined();
    expect(user.consentVersion).toBe('v1.0');

    // Verify user in real DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.email).toBe(testEmail);
    expect(dbUser?.consentVersion).toBe('v1.0');

    // 2. Create Care Profile
    const profile = await createCareProfile(user.id, {
      displayName: 'Integration Elder Profile',
      dateOfBirth: new Date('1945-05-15'),
      bloodType: 'A+',
    });
    expect(profile.ownerId).toBe(user.id);

    // 3. Authenticate with password
    const authenticated = await authenticateWithPassword(testEmail, 'SecurePassword123!');
    expect(authenticated.id).toBe(user.id);

    // 4. Create real database session
    const sessionId = await createSession(user.id);
    expect(sessionId).toBeDefined();

    // 5. Validate session on subsequent request
    const sessionValidation = await validateSession(sessionId);
    expect(sessionValidation).not.toBeNull();
    expect(sessionValidation?.user.id).toBe(user.id);

    // 6. Sign out / revoke session
    await destroySession(sessionId);

    // 7. Verify session is strictly rejected on next request
    const postRevocationValidation = await validateSession(sessionId);
    expect(postRevocationValidation).toBeNull();

    // 8. Multiple sessions & password reset invalidation
    const session1 = await createSession(user.id);
    const session2 = await createSession(user.id);

    const activeSessionsBefore = await listUserSessions(user.id);
    expect(activeSessionsBefore.length).toBeGreaterThanOrEqual(2);

    // Request reset (must never leak rawToken in any environment)
    const resetReq = await requestPasswordReset(testEmail);
    expect(resetReq.success).toBe(true);
    expect((resetReq as any).rawToken).toBeUndefined();

    // Create a known reset token directly to test token redemption & session revocation
    const resetToken = 'test-token-lifecycle-session-revocation-token';
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Reset password
    await resetPasswordWithToken(resetToken, 'BrandNewPassword123!');

    // All previous sessions must be revoked in database
    const s1Validation = await validateSession(session1);
    const s2Validation = await validateSession(session2);
    expect(s1Validation).toBeNull();
    expect(s2Validation).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, Role } from '@elder-care/db';
import { guardSeedExecution } from '../../../../packages/db/src/seed-guard';
import {
  signUpUser,
  authenticateWithPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  listUserSessions,
  revokeUserSession,
} from '../services/auth-service';
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

vi.mock('@elder-care/db', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' },
  };
});

describe('Phase 2: Authentication, Sessions, Password Reset, and Middleware Route Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Seed Guard in Production', () => {
    it('refuses to seed database when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        expect(() => guardSeedExecution()).toThrow(/production/i);

        // Verify seed.ts calls guardSeedExecution
        const seedPath = path.resolve(__dirname, '../../../../packages/db/prisma/seed.ts');
        const seedContent = fs.readFileSync(seedPath, 'utf-8');
        expect(seedContent).toContain('guardSeedExecution()');
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });

  describe('Sign-Up & Sign-In with Server-Side Consent & TOTP', () => {
    it('records consentVersion on sign-up and rejects sign-up if explicit consent is omitted', async () => {
      await expect(
        signUpUser({
          name: 'Elder',
          email: 'elder@example.com',
          password: 'Password123!',
          consentGiven: false,
        })
      ).rejects.toThrow(/consent.*required/i);

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: 'user-new',
        name: 'Elder',
        email: 'elder@example.com',
        consentVersion: 'v1.0',
      });

      const user = await signUpUser({
        name: 'Elder',
        email: 'elder@example.com',
        password: 'Password123!',
        consentGiven: true,
      });

      expect(user.consentVersion).toBe('v1.0');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentVersion: 'v1.0',
          }),
        })
      );
    });

    it('requires TOTP code if user has 2FA enabled', async () => {
      const { hashSecret, encryptString, generateTotpSecret } = await import('../lib/crypto');
      const pwHash = await hashSecret('Password123!');
      const { secret } = generateTotpSecret('2fa@example.com');
      const encryptedTotp = encryptString(secret);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-2fa',
        email: '2fa@example.com',
        passwordHash: pwHash,
        totpSecret: encryptedTotp,
      });

      // Attempt login without totpCode
      await expect(
        authenticateWithPassword('2fa@example.com', 'Password123!')
      ).rejects.toThrow('TOTP_REQUIRED');
    });
  });

  describe('Password Reset Flow & Session Revocation', () => {
    it('generates a hashed password reset token and revokes ALL user sessions upon password reset', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
      });
      (prisma.passwordResetToken.create as any).mockResolvedValue({
        id: 'prt-1',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Request reset
      const reqResult = await requestPasswordReset('user@example.com');
      expect(reqResult.success).toBe(true);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-123',
            tokenHash: expect.any(String),
          }),
        })
      );

      // Confirm reset
      (prisma.passwordResetToken.findUnique as any).mockResolvedValue({
        id: 'prt-1',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        usedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
      });
      (prisma.passwordResetToken.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.session.deleteMany as any).mockResolvedValue({ count: 3 });

      const resetResult = await resetPasswordWithToken('sample-raw-token', 'NewSecurePassword123!');
      expect(resetResult.success).toBe(true);

      // CRITICAL: All sessions must be revoked on password change
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });
  });

  describe('Session Listing & Revocation', () => {
    it('lists user sessions and revokes specific session row', async () => {
      (prisma.session.findMany as any).mockResolvedValue([
        { id: 'sess-1', userId: 'user-123', createdAt: new Date(), expiresAt: new Date(Date.now() + 100000) },
        { id: 'sess-2', userId: 'user-123', createdAt: new Date(), expiresAt: new Date(Date.now() + 100000) },
      ]);
      (prisma.session.deleteMany as any).mockResolvedValue({ count: 1 });

      const sessions = await listUserSessions('user-123', 'sess-1');
      expect(sessions.length).toBe(2);
      expect(sessions[0].isCurrent).toBe(true);
      expect(sessions[1].isCurrent).toBe(false);

      const revokeResult = await revokeUserSession('user-123', 'sess-2');
      expect(revokeResult.success).toBe(true);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'sess-2', userId: 'user-123' },
      });
    });
  });

  describe('Edge Middleware Route Protection', () => {
    it('redirects unauthenticated users away from /dashboard, /senior, /profiles/* to /login', () => {
      const protectedPaths = ['/dashboard', '/senior', '/profiles/p1/medications'];

      for (const pathname of protectedPaths) {
        const req = new NextRequest(`http://localhost:3000${pathname}`);
        // No session cookie
        const res = middleware(req);
        expect(res?.status).toBe(307); // Next.js redirect
        expect(res?.headers.get('location')).toContain('/login');
      }
    });

    it('permits unauthenticated access to the emergency code path without redirection', () => {
      const emergencyReq = new NextRequest('http://localhost:3000/profiles/p1/emergency');
      const res = middleware(emergencyReq);
      // Not redirected
      expect(res?.status).not.toBe(307);
    });
  });
});

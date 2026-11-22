import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma, Role } from '@elder-care/db';
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
        // Dynamically import seed script
        const seedModule = await import('../../../../packages/db/prisma/seed');
        // If seedModule exports a guard function or main, calling it must throw
        if (typeof seedModule.guardSeedExecution === 'function') {
          expect(() => seedModule.guardSeedExecution()).toThrow(/production/i);
        } else {
          // If guard does not exist, fail
          expect(typeof (seedModule as any).guardSeedExecution).toBe('function');
        }
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
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

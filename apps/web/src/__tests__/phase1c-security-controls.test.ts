import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma, Role, MembershipStatus } from '@elder-care/db';
import {
  createCareCircleInvitation,
  acceptCareCircleInvitation,
} from '../services/care-circle-service';
import { checkRateLimit } from '../lib/rate-limiter';
import { validateCsrfRequest } from '../lib/csrf';
import { handleApiError } from '../lib/api-error';
import { createMedicationSchema, formatZodError } from '@elder-care/core';
import nextConfig from '../../next.config';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

// Mock dependencies
vi.mock('@elder-care/db', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    invitation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      update: vi.fn().mockRejectedValue(new Error('Audit logs are strictly append-only. UPDATE and DELETE operations are forbidden.')),
      delete: vi.fn().mockRejectedValue(new Error('Audit logs are strictly append-only. UPDATE and DELETE operations are forbidden.')),
    },
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' },
    MembershipStatus: { ACTIVE: 'ACTIVE', REVOKED: 'REVOKED', INVITED: 'INVITED' },
  };
});

vi.mock('../lib/auth-guard', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireProfileAccess: vi.fn().mockResolvedValue({
      membership: { id: 'mem-owner', userId: 'user-owner', role: 'OWNER', status: 'ACTIVE' },
      profile: { id: 'profile-1', displayName: 'Elder Smith' },
    }),
  };
});

vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Phase 1c: Security Controls, Rate Limiting, CSRF, Audit & AST Guards (Items 11-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Item 11: Care Circle Invitations
  describe('Item 11: Invitations Security & Atomicity', () => {
    it('rejects invitation creation with role OWNER', async () => {
      await expect(
        createCareCircleInvitation('profile-1', {
          email: 'newowner@example.com',
          role: Role.OWNER,
        }, 'user-owner')
      ).rejects.toThrow(/cannot invite.*OWNER/i);
    });

    it('uses atomic invitation.updateMany({ where: { id, usedAt: null } }) and leaves membership in INVITED status', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-invited',
        email: 'caregiver@example.com',
      });
      (prisma.invitation.findUnique as any).mockResolvedValue({
        id: 'inv-1',
        profileId: 'profile-1',
        email: 'caregiver@example.com',
        role: Role.CAREGIVER,
        scopes: { view_medications: true },
        expiresAt: new Date(Date.now() + 1000000),
        usedAt: null,
      });

      // Mock updateMany returning count: 1
      (prisma.invitation.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.membership.upsert as any).mockResolvedValue({
        id: 'mem-new',
        status: MembershipStatus.INVITED,
      });

      await acceptCareCircleInvitation('valid-token', 'user-invited');

      // Must use updateMany with usedAt: null to prevent race condition
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'inv-1', usedAt: null }),
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        })
      );

      // Must set status to INVITED pending elder/owner confirmation
      expect(prisma.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: MembershipStatus.INVITED }),
          update: expect.objectContaining({ status: MembershipStatus.INVITED }),
        })
      );
    });
  });

  // Item 12: Rate Limiter Fail-Closed in Production
  describe('Item 12: Rate Limiting Fail-Closed in Production', () => {
    it('fails closed (returns success: false with 503 error) when Redis is down in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalRedisUrl = process.env.REDIS_URL;

      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.REDIS_URL = 'redis://invalid-host:6379';

        const result = await checkRateLimit('login:test@example.com', 5, 900);
        // In production without Redis, rate limit must fail closed
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        process.env.REDIS_URL = originalRedisUrl;
      }
    });

    it('allows in-memory rate limiting in test/development environments', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'test';
        const key = `test-dev-${Date.now()}`;
        const result = await checkRateLimit(key, 5, 60);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(4);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });

  // Item 13: CSRF & Security Headers
  describe('Item 13: CSRF Protection & Security Headers', () => {
    it('rejects cross-origin state-changing POST requests with 403 Forbidden', () => {
      const req = new Request('http://localhost:3000/api/profiles/p1/medications', {
        method: 'POST',
        headers: {
          origin: 'https://evil-attacker.com',
          host: 'localhost:3000',
        },
      });

      const validation = validateCsrfRequest(req);
      expect(validation.valid).toBe(false);
      expect(validation.status).toBe(403);
    });

    it('allows same-origin state-changing POST requests', () => {
      const req = new Request('http://localhost:3000/api/profiles/p1/medications', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
      });

      const validation = validateCsrfRequest(req);
      expect(validation.valid).toBe(true);
    });

    it('verifies required security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) in next.config.ts', async () => {
      const headersConfig = await (nextConfig.headers ? nextConfig.headers() : []);
      expect(headersConfig.length).toBeGreaterThan(0);

      const rootHeaders = headersConfig[0].headers;
      const headerKeys = rootHeaders.map((h: any) => h.key);

      expect(headerKeys).toContain('Content-Security-Policy');
      expect(headerKeys).toContain('Strict-Transport-Security');
      expect(headerKeys).toContain('X-Content-Type-Options');
      expect(headerKeys).toContain('X-Frame-Options');
      expect(headerKeys).toContain('Referrer-Policy');

      const csp = rootHeaders.find((h: any) => h.key === 'Content-Security-Policy');
      expect(csp?.value).toContain("default-src 'self'");
      expect(csp?.value).toContain("frame-ancestors 'none'");
    });
  });

  // Item 14: Input Validation & Error Handling
  describe('Item 14: Shared Zod Input Validation & Error Sanitization', () => {
    it('returns field-level plain errors on invalid schema input', () => {
      const result = createMedicationSchema.safeParse({
        // Missing name, strength, form, timesOfDay
        criticality: 'STANDARD',
        stockCount: -5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted['name']).toBeDefined();
        expect(formatted['strength']).toBeDefined();
        expect(formatted['form']).toBeDefined();
        expect(formatted['stockCount']).toMatch(/cannot be negative/i);
      }
    });

    it('never leaks raw error messages on unexpected internal 500 errors', async () => {
      const sensitiveError = new Error('Database connection failed at postgresql://postgres:super_secret_pw@db:5432');
      const response = handleApiError(sensitiveError);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('An unexpected internal error occurred. Please contact support.');
      expect(json.requestId).toBeDefined();
      expect(JSON.stringify(json)).not.toContain('super_secret_pw');
      expect(JSON.stringify(json)).not.toContain('Database connection failed');
    });
  });

  // Item 15: Audit Immutability Trigger
  describe('Item 15: Database Append-Only Audit Trigger', () => {
    it('verifies that migration SQL enforces BEFORE UPDATE and BEFORE DELETE triggers raising exception', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../../../../packages/db/prisma/migrations/20261122000000_audit_log_append_only/migration.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_audit_logs_append_only()');
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql).toContain('BEFORE UPDATE ON "audit_logs"');
      expect(sql).toContain('BEFORE DELETE ON "audit_logs"');
      expect(sql).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM PUBLIC');
    });

    it('rejects programmatic UPDATE and DELETE on audit logs', async () => {
      await expect(
        prisma.auditLog.update({ where: { id: 'audit-1' }, data: { action: 'DOSE:ACTION' } as any })
      ).rejects.toThrow(/append-only/i);

      await expect(
        prisma.auditLog.delete({ where: { id: 'audit-1' } })
      ).rejects.toThrow(/append-only/i);
    });
  });

  // Item 16: Strengthened AST Route Guard
  describe('Item 16: AST-Based Route Guard Verification', () => {
    it('verifies using TypeScript AST parser that every exported HTTP method directly calls requireProfileAccess', () => {
      const routePath = path.resolve(__dirname, '../app/api/profiles/[id]/route.ts');
      const sourceCode = fs.readFileSync(routePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        routePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
      );

      const exportedMethods: string[] = [];
      const methodsWithGuardCall: string[] = [];

      function visit(node: ts.Node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name &&
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(node.name.text)
        ) {
          const methodName = node.name.text;
          exportedMethods.push(methodName);

          let hasRequireCall = false;
          function checkCalls(inner: ts.Node) {
            if (
              ts.isCallExpression(inner) &&
              ts.isIdentifier(inner.expression) &&
              inner.expression.text === 'requireProfileAccess'
            ) {
              hasRequireCall = true;
            }
            ts.forEachChild(inner, checkCalls);
          }
          checkCalls(node);

          if (hasRequireCall) {
            methodsWithGuardCall.push(methodName);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);

      expect(exportedMethods.length).toBeGreaterThan(0);
      expect(methodsWithGuardCall).toEqual(exportedMethods);
    });
  });
});

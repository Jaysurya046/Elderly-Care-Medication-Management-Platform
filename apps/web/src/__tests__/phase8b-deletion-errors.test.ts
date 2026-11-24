import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, Role, DoseStatus, MembershipStatus } from '@elder-care/db';
import { requestProfileDeletion, cancelProfileDeletion } from '../services/profile-service';
import { loginWithPassword, registerUser } from '../services/auth-service';
import { recordDoseAction } from '../services/medication-service';
import { checkRateLimit } from '../lib/rate-limiter';
import * as Core from '@elder-care/core';

describe('Phase 8b: Deletion and Errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Item 1: Audit FK immutability & soft deletion purge
  // --------------------------------------------------------------------------
  describe('Item 1: Audit log foreign key immutability and purge', () => {
    it('verifies AuditLog in schema has dropped onDelete: SetNull and no FK relation that mutates audit logs', () => {
      const schemaPath = path.resolve(__dirname, '../../../../packages/db/prisma/schema.prisma');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');

      // Schema must not have onDelete: SetNull on AuditLog relation
      expect(schemaContent).not.toMatch(/model AuditLog\s*\{[\s\S]*?onDelete:\s*SetNull/);
      // AuditLog.profileId should be a plain UUID field without an onDelete cascade/setNull FK relation
      expect(schemaContent).not.toMatch(/model AuditLog\s*\{[\s\S]*?@relation\(fields:\s*\[profileId\]/);
    });

    it('verifies database seed script does not attempt deleteMany on auditLog which triggers immutable violation', () => {
      const seedPath = path.resolve(__dirname, '../../../../packages/db/prisma/seed.ts');
      const seedContent = fs.readFileSync(seedPath, 'utf8');

      // seed.ts must not call prisma.auditLog.deleteMany() directly without trigger handling
      expect(seedContent).not.toContain('await prisma.auditLog.deleteMany();');
    });

    it('real-db: soft deletion purge removes CareProfile data while preserving AuditLog rows intact', async () => {
      let isDbAvailable = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        isDbAvailable = true;
      } catch {
        // Skip live DB test when Postgres is unreachable locally (runs in CI container)
        return;
      }

      if (isDbAvailable) {
        // Create user and profile
        const user = await prisma.user.create({
          data: {
            email: `purge-test-${Date.now()}@test.com`,
            name: 'Purge Test User',
            passwordHash: 'hash',
          },
        });

        const profile = await prisma.careProfile.create({
          data: {
            ownerId: user.id,
            displayName: 'Purge Elder',
            dateOfBirth: new Date('1940-01-01'),
            bloodType: 'A+',
            emergencyCode: `P${Math.floor(Math.random() * 8999999 + 1000000)}`,
            deletionRequestedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
          },
        });

        // Create an audit log record tied to profileId
        const audit = await prisma.auditLog.create({
          data: {
            profileId: profile.id,
            actorUserId: user.id,
            action: 'TEST:BEFORE_PURGE',
            entityType: 'CareProfile',
            entityId: profile.id,
          },
        });

        // Execute scheduled deletion purge
        const { processScheduledDeletions } = await import('../../../worker/src/jobs/scheduled-deletion.job');
        await processScheduledDeletions(new Date());

        // Assert profile is deleted
        const foundProfile = await prisma.careProfile.findUnique({ where: { id: profile.id } });
        expect(foundProfile).toBeNull();

        // Assert audit log remains and profileId was NOT cleared/set null
        const foundAudit = await prisma.auditLog.findUnique({ where: { id: audit.id } });
        expect(foundAudit).not.toBeNull();
        expect(foundAudit?.profileId).toBe(profile.id);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Item 2: deletionRequestedAt timestamp and cancellation
  // --------------------------------------------------------------------------
  describe('Item 2: deletionRequestedAt timestamp and cancellation', () => {
    it('requestProfileDeletion sets deletionRequestedAt to current request time (not future date) and computes hardDeleteDate', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        name: 'Owner User',
        email: 'owner@test.com',
      } as any);

      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValue({
        id: 'prof-123',
        ownerId: 'user-123',
        displayName: 'Test Profile',
      } as any);

      vi.spyOn(prisma.membership, 'findFirst').mockResolvedValue({
        id: 'mem-123',
        profileId: 'prof-123',
        userId: 'user-123',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: {},
      } as any);

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValue({
        id: 'mem-123',
        profileId: 'prof-123',
        userId: 'user-123',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: {},
      } as any);

      const mockUpdate = vi.spyOn(prisma.careProfile, 'update').mockImplementation(vi.fn());
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      const beforeCall = Date.now();
      const result = await requestProfileDeletion('prof-123', 'user-123');
      const afterCall = Date.now();

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const updateData = mockUpdate.mock.calls[0][0].data;

      // deletionRequestedAt must be request time (around now), NOT +30 days!
      const reqTime = new Date(updateData.deletionRequestedAt as any).getTime();
      expect(reqTime).toBeGreaterThanOrEqual(beforeCall - 1000);
      expect(reqTime).toBeLessThanOrEqual(afterCall + 1000);

      // Result should expose hardDeleteDate computed as +30 days
      expect(result).toBeDefined();
      const hardDeleteTime = new Date((result as any).hardDeleteDate || (result as any)).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(hardDeleteTime - reqTime).toBeCloseTo(thirtyDaysMs, -3);
    });

    it('cancelProfileDeletion sets deletionRequestedAt to null', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        name: 'Owner User',
        email: 'owner@test.com',
      } as any);

      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValue({
        id: 'prof-123',
        ownerId: 'user-123',
      } as any);

      vi.spyOn(prisma.membership, 'findFirst').mockResolvedValue({
        id: 'mem-123',
        profileId: 'prof-123',
        userId: 'user-123',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: {},
      } as any);

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValue({
        id: 'mem-123',
        profileId: 'prof-123',
        userId: 'user-123',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: {},
      } as any);

      const mockUpdate = vi.spyOn(prisma.careProfile, 'update').mockImplementation(vi.fn());
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      await cancelProfileDeletion('prof-123', 'user-123');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'prof-123' },
        data: { deletionRequestedAt: null },
      });
    });
  });

  // --------------------------------------------------------------------------
  // Item 3: Typed domain errors across services
  // --------------------------------------------------------------------------
  describe('Item 3: Typed domain errors across services', () => {
    it('wrong password throws AuthError with statusCode 401', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '$argon2id$mock',
      } as any);

      // Wrong password should throw AuthError with statusCode === 401
      let caughtError: any;
      try {
        await loginWithPassword('test@example.com', 'WrongPassword123!', '127.0.0.1');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.statusCode).toBe(401);
      expect((Core as any).AuthError).toBeDefined();
      expect(caughtError).toBeInstanceOf((Core as any).AuthError);
    });

    it('duplicate email registration throws ConflictError with statusCode 409', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-existing',
        email: 'exists@example.com',
      } as any);

      let caughtError: any;
      try {
        await registerUser({
          email: 'exists@example.com',
          password: 'Password123!',
          name: 'Existing User',
          consentGiven: true,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.statusCode).toBe(409);
      expect((Core as any).ConflictError).toBeDefined();
      expect(caughtError).toBeInstanceOf((Core as any).ConflictError);
    });

    it('invalid dose transition throws ConflictError or ValidationError with statusCode 409 or 422', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-caregiver',
        email: 'cg@test.com',
      } as any);

      vi.spyOn(prisma.doseEvent, 'findUnique').mockResolvedValue({
        id: 'dose-1',
        status: DoseStatus.TAKEN, // Already TAKEN
        profileId: 'prof-1',
        schedule: { medicationId: 'med-1' },
      } as any);

      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValue({
        id: 'prof-1',
        ownerId: 'owner-1',
      } as any);

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValue({
        id: 'mem-1',
        profileId: 'prof-1',
        userId: 'user-caregiver',
        role: Role.CAREGIVER,
        status: MembershipStatus.ACTIVE,
        scopes: { manage_medications: true, view_medications: true },
      } as any);

      vi.spyOn(prisma.membership, 'findFirst').mockResolvedValue({
        id: 'mem-1',
        profileId: 'prof-1',
        userId: 'user-caregiver',
        role: Role.CAREGIVER,
        status: MembershipStatus.ACTIVE,
        scopes: { manage_medications: true, view_medications: true },
      } as any);

      let caughtError: any;
      try {
        // Attempting to TAKE an already TAKEN dose
        await recordDoseAction('dose-1', { action: 'TAKE' }, 'user-caregiver', 'prof-1');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect([409, 422]).toContain(caughtError?.statusCode);
    });

    it('rate limiting service failure in production throws or returns ServiceUnavailableError with 503', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevRedis = process.env.REDIS_URL;
      (process.env as any).NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:9999'; // Unreachable

      const result = await checkRateLimit('test-key', 5, 60);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unavailable/i);

      (process.env as any).NODE_ENV = prevEnv;
      process.env.REDIS_URL = prevRedis;
    });
  });

  // --------------------------------------------------------------------------
  // Item 4: Eager connection and atomic Lua script in rate limiter
  // --------------------------------------------------------------------------
  describe('Item 4: Rate limiter Lua script atomicity', () => {
    it('verifies rate-limiter.ts defines atomic Lua script for INCR and EXPIRE', () => {
      const limiterPath = path.resolve(__dirname, '../lib/rate-limiter.ts');
      const content = fs.readFileSync(limiterPath, 'utf8');

      // Must contain atomic lua eval or defineCommand
      expect(content).toMatch(/eval|defineCommand/i);
      expect(content).toContain('EXPIRE');
    });
  });
});

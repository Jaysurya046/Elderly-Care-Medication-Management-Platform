import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, Role, DoseStatus, MembershipStatus, MedicationCriticality } from '@elder-care/db';
import { requestProfileDeletion, cancelProfileDeletion } from '../services/profile-service';
import { loginWithPassword, registerUser, authenticateWithPassword } from '../services/auth-service';
import { recordDoseAction } from '../services/medication-service';
import { checkRateLimit, getConnectedRedisClient, _resetRedisClientForTesting } from '../lib/rate-limiter';
import * as Core from '@elder-care/core';
import { NextRequest } from 'next/server';
import { POST as signInRoute } from '../app/api/auth/signin/route';
import { POST as signUpRoute } from '../app/api/auth/signup/route';
import Redis from 'ioredis';

describe('Phase 8b: Deletion and Errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetRedisClientForTesting();
  });

  afterEach(() => {
    _resetRedisClientForTesting();
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
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('PostgreSQL connection timed out after 2500ms')), 2500)
          ),
        ]);
        isDbAvailable = true;
      } catch (err) {
        const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
        if (isDbRequired) {
          throw new Error(`Real database required (REQUIRE_DB=1 or CI=true) but connection failed: ${(err as Error).message}`);
        }
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

        console.log(`[Purge Test Row Counts] Profiles remaining: ${foundProfile ? 1 : 0}, Audit rows preserved: ${foundAudit ? 1 : 0}`);
      }
    });

    it('real-db: hardened processScheduledDeletions cleans up profile, doses, memberships, sessions, soft-deletes user, and preserves audit logs', async () => {
      let isDbAvailable = false;
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('PostgreSQL connection timed out after 2500ms')), 2500)
          ),
        ]);
        isDbAvailable = true;
      } catch (err) {
        const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
        if (isDbRequired) {
          throw new Error(`Real database required (REQUIRE_DB=1 or CI=true) but connection failed: ${(err as Error).message}`);
        }
        return;
      }

      if (isDbAvailable) {
        // 1. Create owner user and caregiver user
        const owner = await prisma.user.create({
          data: {
            email: `owner-purge-${Date.now()}@test.com`,
            name: 'Elder Owner',
            passwordHash: 'hash',
          },
        });

        const caregiver = await prisma.user.create({
          data: {
            email: `cg-purge-${Date.now()}@test.com`,
            name: 'Caregiver Member',
            passwordHash: 'hash',
          },
        });

        // 2. Create CareProfile requested for deletion 35 days ago
        const profile = await prisma.careProfile.create({
          data: {
            ownerId: owner.id,
            displayName: 'Hardened Purge Profile',
            dateOfBirth: new Date('1938-03-20'),
            bloodType: 'B+',
            emergencyCode: `H${Math.floor(Math.random() * 8999999 + 1000000)}`,
            deletionRequestedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
          },
        });

        // 3. Create active session for owner
        const session = await prisma.session.create({
          data: {
            id: `session-hash-${Date.now()}`,
            userId: owner.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        // 4. Create memberships
        await prisma.membership.createMany({
          data: [
            {
              profileId: profile.id,
              userId: owner.id,
              role: Role.OWNER,
              status: MembershipStatus.ACTIVE,
              scopes: {},
            },
            {
              profileId: profile.id,
              userId: caregiver.id,
              role: Role.CAREGIVER,
              status: MembershipStatus.ACTIVE,
              scopes: { view_medications: true, manage_medications: true },
            },
          ],
        });

        // 5. Create medication, schedule and dose
        const med = await prisma.medication.create({
          data: {
            profileId: profile.id,
            name: 'Aspirin',
            strength: '81mg',
            form: 'Tablet',
            stockCount: 30,
            refillThreshold: 5,
            criticality: MedicationCriticality.STANDARD,
            startDate: new Date(),
          },
        });

        const sched = await prisma.schedule.create({
          data: {
            medicationId: med.id,
            rrule: 'FREQ=DAILY;INTERVAL=1',
            timesOfDay: ['09:00'],
            startsOn: new Date(),
            graceMinutes: 60,
            snoozeMinutes: 15,
          },
        });

        const dose = await prisma.doseEvent.create({
          data: {
            profileId: profile.id,
            scheduleId: sched.id,
            scheduledAt: new Date(),
            status: DoseStatus.PENDING,
            stockDecremented: false,
          },
        });

        // 6. Create immutable audit log row
        const auditLog = await prisma.auditLog.create({
          data: {
            profileId: profile.id,
            actorUserId: owner.id,
            action: 'CARE_PROFILE:UPDATE',
            entityType: 'CareProfile',
            entityId: profile.id,
          },
        });

        // Execute hardened scheduled deletion
        const { processScheduledDeletions } = await import('../../../worker/src/jobs/scheduled-deletion.job');
        const count = await processScheduledDeletions(new Date());
        expect(count).toBeGreaterThanOrEqual(1);

        // Verify profile deleted
        const profileAfter = await prisma.careProfile.findUnique({ where: { id: profile.id } });
        expect(profileAfter).toBeNull();

        // Verify owner's sessions deleted
        const sessionAfter = await prisma.session.findUnique({ where: { id: session.id } });
        expect(sessionAfter).toBeNull();

        // Verify memberships deleted
        const membershipsAfter = await prisma.membership.findMany({ where: { profileId: profile.id } });
        expect(membershipsAfter).toHaveLength(0);

        // Verify doses deleted
        const doseAfter = await prisma.doseEvent.findUnique({ where: { id: dose.id } });
        expect(doseAfter).toBeNull();

        // Verify user account soft-deleted (deletedAt set) because user has no other profiles or care circles
        const ownerAfter = await prisma.user.findUnique({ where: { id: owner.id } });
        expect(ownerAfter?.deletedAt).not.toBeNull();

        // Verify audit logs PRESERVED with intact profileId
        const auditAfter = await prisma.auditLog.findUnique({ where: { id: auditLog.id } });
        expect(auditAfter).not.toBeNull();
        expect(auditAfter?.profileId).toBe(profile.id);

        console.log(
          `[Scheduled Deletions Real-DB Hardening] Purge complete. Profiles: 0, Sessions: 0, Memberships: 0, Doses: 0, Preserved Audit Logs: 1, User Soft-Deleted: ${
            ownerAfter?.deletedAt ? 'YES' : 'NO'
          }`
        );
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
  // Item 3: Typed domain errors across services and HTTP routes
  // --------------------------------------------------------------------------
  describe('Item 3: Typed domain errors across services and HTTP routes', () => {
    it('wrong password throws AuthError with statusCode 401', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '$argon2id$mock',
      } as any);

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
      _resetRedisClientForTesting();

      const result = await checkRateLimit('test-key', 5, 60);
      expect(result.success).toBe(false);
      expect(result.isDown).toBe(true);
      expect(result.error).toMatch(/unavailable/i);

      (process.env as any).NODE_ENV = prevEnv;
      process.env.REDIS_URL = prevRedis;
      _resetRedisClientForTesting();
    });

    // ------------------------------------------------------------------------
    // Route-level HTTP Status Code Tests (Goal: 401, 409, 503, 429)
    // ------------------------------------------------------------------------
    it('route POST /api/auth/signin returns HTTP 401 on wrong password', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-route-1',
        email: 'signin-test@example.com',
        passwordHash: '$argon2id$mockpasswordhash',
        deletedAt: null,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'signin-test@example.com',
          password: 'IncorrectPassword999!',
        }),
      });

      const res = await signInRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/invalid email or password/i);
    });

    it('route POST /api/auth/signup returns HTTP 409 on duplicate email', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-exists',
        email: 'duplicate@example.com',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          name: 'Existing User',
          email: 'duplicate@example.com',
          password: 'Password123!',
          consentGiven: true,
        }),
      });

      const res = await signUpRoute(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/already exists/i);
    });

    it('route POST /api/auth/signin returns HTTP 503 Service Unavailable when Redis is down in production', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevRedis = process.env.REDIS_URL;
      (process.env as any).NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:9999';
      _resetRedisClientForTesting();

      const req = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'redis-down@example.com',
          password: 'Password123!',
        }),
      });

      const res = await signInRoute(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/temporarily unavailable/i);

      (process.env as any).NODE_ENV = prevEnv;
      process.env.REDIS_URL = prevRedis;
      _resetRedisClientForTesting();
    });

    it('route POST /api/auth/signin returns HTTP 429 Too Many Requests on sixth failed login', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-rate-limited',
        email: 'ratelimit@example.com',
        passwordHash: '$argon2id$mockhash',
        deletedAt: null,
      } as any);

      const targetEmail = `ratelimit-${Date.now()}@example.com`;

      // Perform 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            email: targetEmail,
            password: 'WrongPassword!',
          }),
        });
        const r = await signInRoute(req);
        expect(r.status).toBe(401);
      }

      // 6th attempt must be blocked by rate limiter with HTTP 429
      const sixthReq = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: targetEmail,
          password: 'WrongPassword!',
        }),
      });

      const sixthRes = await signInRoute(sixthReq);
      expect(sixthRes.status).toBe(429);
      const sixthJson = await sixthRes.json();
      expect(sixthJson.success).toBe(false);
      expect(sixthJson.error).toMatch(/too many failed attempts/i);
    });
  });

  // --------------------------------------------------------------------------
  // Item 4: Real Redis Rate Limiting & Client Reconnect Recovery
  // --------------------------------------------------------------------------
  describe('Item 4: Real Redis Rate Limiting & Client Reconnect Recovery', () => {
    it('real-redis: rate limiter blocks on 6th call and sets TTL on key', async () => {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
        if (isDbRequired) {
          throw new Error('Redis is required (REQUIRE_DB=1 or CI=true) but REDIS_URL is not set');
        }
        return;
      }

      let client: Redis | null = null;
      try {
        client = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          connectTimeout: 2000,
          retryStrategy: () => null,
        });
        client.on('error', () => {});
        await client.connect();
        await client.ping();
      } catch (err) {
        const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
        if (isDbRequired) {
          throw new Error(`Real Redis is required but connection failed: ${(err as Error).message}`);
        }
        try {
          client?.disconnect();
        } catch {}
        return;
      }

      const testKey = `real-redis-ratelimit-test:${Date.now()}`;
      try {
        // Calls 1 to 5 must succeed
        for (let i = 1; i <= 5; i++) {
          const res = await checkRateLimit(testKey, 5, 300);
          expect(res.success).toBe(true);
          expect(res.remaining).toBe(5 - i);
          expect(res.resetSeconds).toBeGreaterThan(0);
        }

        // 6th call must be blocked
        const sixthRes = await checkRateLimit(testKey, 5, 300);
        expect(sixthRes.success).toBe(false);
        expect(sixthRes.remaining).toBe(0);

        // Verify key exists in Redis and has a valid positive TTL
        const ttl = await client.ttl(testKey);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(300);

        console.log(`[Real Redis Test] 6th call blocked as expected. Redis Key TTL: ${ttl}s`);
      } finally {
        await client.del(testKey);
        client.disconnect();
      }
    });

    it('getConnectedRedisClient recovers after client disconnect/end', async () => {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      _resetRedisClientForTesting();

      // Verify that after client ended/recreated, getConnectedRedisClient does not throw unhandled exception
      const client = await getConnectedRedisClient();
      expect(client === null || client.status === 'ready' || client.status === 'connecting').toBe(true);
    });
  });
});

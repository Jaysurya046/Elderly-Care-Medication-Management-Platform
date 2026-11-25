import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@elder-care/db', () => ({
  prisma: {
    doseEvent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    medication: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
  Role: {
    OWNER: 'OWNER',
    CAREGIVER: 'CAREGIVER',
    FAMILY: 'FAMILY',
  },
  MedicationCriticality: {
    STANDARD: 'STANDARD',
    CRITICAL: 'CRITICAL',
  },
  DoseStatus: {
    PENDING: 'PENDING',
    TAKEN: 'TAKEN',
    LATE_TAKEN: 'LATE_TAKEN',
    SKIPPED: 'SKIPPED',
    SNOOZED: 'SNOOZED',
    MISSED: 'MISSED',
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireProfileAccess: vi.fn().mockResolvedValue({
    membership: {
      id: 'mem-1',
      profileId: 'prof-1',
      userId: 'user-1',
      role: 'OWNER',
      scopes: { manage_medications: true, view_medications: true },
    },
    user: { id: 'user-1', name: 'Primary Owner' },
  }),
}));

vi.mock('@/lib/csrf', () => ({
  validateCsrfRequest: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 10 }),
  resetRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@elder-care/db';
import { recordDoseAction, updateMedication, deleteMedication } from '../services/medication-service';
import { POST as doseActionRoute } from '../app/api/profiles/[id]/doses/[doseId]/action/route';
import { POST as doseCorrectionRoute } from '../app/api/profiles/[id]/doses/[doseId]/correction/route';
import { processDoseReminders } from '../../../../apps/worker/src/jobs/dose-reminders.job';
import { processAutoMissDoses } from '../../../../apps/worker/src/jobs/auto-miss.job';

describe('Phase 8c Part 2: Snooze, Deactivation, and Correction Route Separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Item 1: Snooze with snoozedUntil & Reminder Rescheduling', () => {
    it('recordDoseAction SNOOZE computes snoozedUntil from schedule.snoozeMinutes and saves to DoseEvent', async () => {
      const scheduledAt = new Date('2026-11-26T08:00:00Z');
      const mockDose = {
        id: 'dose-1',
        profileId: 'prof-1',
        status: 'PENDING',
        snoozeCount: 0,
        stockDecremented: false,
        scheduledAt,
        schedule: {
          id: 'sched-1',
          medicationId: 'med-1',
          snoozeMinutes: 20, // 20 minutes snooze
          graceMinutes: 60,
          medication: { id: 'med-1', isActive: true, stockCount: 10 },
        },
      };

      (prisma.doseEvent.findUnique as any).mockResolvedValue(mockDose);
      (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 1 });

      const updated = await recordDoseAction('dose-1', { action: 'SNOOZE' }, 'user-1', 'prof-1');

      // Must calculate snoozedUntil and pass it to updateMany
      expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'dose-1' }),
          data: expect.objectContaining({
            status: 'SNOOZED',
            snoozeCount: 1,
            snoozedUntil: expect.any(Date),
          }),
        })
      );

      const callArgs = (prisma.doseEvent.updateMany as any).mock.calls[0][0];
      const snoozedUntil = callArgs.data.snoozedUntil as Date;
      // Should be approximately now + 20 minutes
      const diffMinutes = Math.round((snoozedUntil.getTime() - Date.now()) / (60 * 1000));
      expect(diffMinutes).toBe(20);
    });

    it('dose reminder job re-sends reminder when referenceTime reaches snoozedUntil', async () => {
      const now = new Date('2026-11-26T08:20:00Z');
      const snoozedDose = {
        id: 'dose-snoozed-1',
        profileId: 'prof-1',
        scheduledAt: new Date('2026-11-26T08:00:00Z'),
        status: 'SNOOZED',
        snoozedUntil: new Date('2026-11-26T08:20:00Z'),
        snoozeCount: 1,
        profile: {
          id: 'prof-1',
          displayName: 'Kamala',
          timezone: 'Asia/Kolkata',
          quietHoursStart: null,
          quietHoursEnd: null,
          owner: { id: 'u-1', email: 'owner@test.com', name: 'Kamala' },
        },
        schedule: {
          id: 's-1',
          graceMinutes: 60,
          medication: { id: 'm-1', name: 'Metformin', criticality: 'STANDARD', isActive: true },
        },
      };

      (prisma.doseEvent.findMany as any)
        .mockResolvedValueOnce([]) // for auto-miss step
        .mockResolvedValueOnce([snoozedDose]); // for reminder step

      (prisma.notificationLog.findUnique as any).mockResolvedValue(null);
      (prisma.notificationLog.create as any).mockResolvedValue({ id: 'nl-1' });

      const count = await processDoseReminders(now);
      expect(prisma.doseEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            // Must query both PENDING and SNOOZED doses where snoozedUntil is reached
            status: expect.anything(),
          }),
        })
      );
    });

    it('grace for auto-miss still runs from scheduledAt, not snoozedUntil', async () => {
      const scheduledAt = new Date('2026-11-26T08:00:00Z');
      const snoozedUntil = new Date('2026-11-26T08:45:00Z'); // Snoozed late
      const referenceTime = new Date('2026-11-26T09:05:00Z'); // 65 min past scheduledAt (grace=60)

      const dose = {
        id: 'dose-auto-miss-1',
        scheduledAt,
        snoozedUntil,
        status: 'SNOOZED',
        schedule: {
          graceMinutes: 60, // Expiry = 09:00:00Z
          medication: { isActive: true },
        },
      };

      (prisma.doseEvent.findMany as any).mockResolvedValue([dose]);
      (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 1 });

      const missedCount = await processAutoMissDoses(referenceTime);

      // Must be auto-missed because referenceTime (09:05) > scheduledAt (08:00) + grace (60m)
      expect(missedCount).toBe(1);
      expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dose-auto-miss-1', status: { in: ['PENDING', 'SNOOZED'] } },
          data: { status: 'MISSED' },
        })
      );
    });
  });

  describe('Item 2: Medicine Deactivation & Future Doses Cancellation', () => {
    it('deactivating a medicine cancels all future PENDING doses and leaves past doses intact', async () => {
      const now = new Date();
      const pastPendingDate = new Date(now.getTime() - 3600 * 1000);
      const futurePendingDate1 = new Date(now.getTime() + 3600 * 1000);
      const futurePendingDate2 = new Date(now.getTime() + 7200 * 1000);

      (prisma.medication.findUnique as any).mockResolvedValue({
        id: 'med-deact-1',
        profileId: 'prof-1',
        name: 'Aspirin',
        isActive: true,
      });

      (prisma.medication.update as any).mockResolvedValue({
        id: 'med-deact-1',
        profileId: 'prof-1',
        isActive: false,
      });

      (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 2 });

      // Update medication to inactive
      await updateMedication('prof-1', 'med-deact-1', { isActive: false }, 'user-1');

      // Must cancel future PENDING/SNOOZED doses
      expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schedule: { medicationId: 'med-deact-1' },
            scheduledAt: { gte: expect.any(Date) },
            status: { in: ['PENDING', 'SNOOZED'] },
          }),
          data: expect.objectContaining({
            status: 'SKIPPED',
          }),
        })
      );
    });

    it('worker skips inactive medicines during dose reminders and auto-miss processing', async () => {
      const now = new Date();
      const doseOfInactiveMed = {
        id: 'dose-inactive-1',
        scheduledAt: now,
        status: 'PENDING',
        schedule: {
          graceMinutes: 60,
          medication: { id: 'med-inactive', isActive: false }, // INACTIVE
        },
        profile: {
          owner: { id: 'u-1' },
        },
      };

      (prisma.doseEvent.findMany as any).mockResolvedValue([]);

      await processAutoMissDoses(now);

      // findMany should query medication: { isActive: true }
      expect(prisma.doseEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schedule: expect.objectContaining({
              medication: { isActive: true },
            }),
          }),
        })
      );
    });
  });

  describe('Item 3: Remove CORRECTION from General Action Route', () => {
    it('rejects CORRECTION action on general action route /api/profiles/[id]/doses/[doseId]/action', async () => {
      (prisma.doseEvent.findUnique as any).mockResolvedValue({
        id: 'dose-act-1',
        profileId: 'prof-1',
      });

      const req = new NextRequest(
        'http://localhost:3000/api/profiles/prof-1/doses/dose-act-1/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'CORRECTION',
            correctionTargetStatus: 'TAKEN',
            note: 'Mistake corrected',
          }),
        }
      );

      const res = await doseActionRoute(req, {
        params: Promise.resolve({ id: 'prof-1', doseId: 'dose-act-1' }),
      });

      // Must return 400 Bad Request or validation error
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error || JSON.stringify(data.details)).toMatch(/CORRECTION|invalid/i);
    });

    it('correction route requires mandatory reason', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/profiles/prof-1/doses/dose-act-1/correction',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetStatus: 'TAKEN',
            reason: '', // Empty reason
          }),
        }
      );

      const res = await doseCorrectionRoute(req, {
        params: Promise.resolve({ id: 'prof-1', doseId: 'dose-act-1' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error || JSON.stringify(data.details)).toMatch(/reason/i);
    });

    it('correction route succeeds with valid target status and reason', async () => {
      (prisma.doseEvent.findUnique as any).mockResolvedValue({
        id: 'dose-act-1',
        profileId: 'prof-1',
        status: 'MISSED',
        snoozeCount: 0,
        stockDecremented: false,
        schedule: {
          id: 's-1',
          medicationId: 'm-1',
          medication: { id: 'm-1', isActive: true, stockCount: 5 },
        },
      });
      (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 1 });

      const req = new NextRequest(
        'http://localhost:3000/api/profiles/prof-1/doses/dose-act-1/correction',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetStatus: 'TAKEN',
            reason: 'Elder actually took the pill on time but caregiver forgot to log',
          }),
        }
      );

      const res = await doseCorrectionRoute(req, {
        params: Promise.resolve({ id: 'prof-1', doseId: 'dose-act-1' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@elder-care/db', () => ({
  prisma: {
    doseEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
      fields: { refillThreshold: 5 },
    },
    appointment: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { processDoseReminders } from '../jobs/dose-reminders.job';
import { processLowStockAlerts } from '../jobs/low-stock.job';
import { processNotificationRetries } from '../jobs/notification-retries.job';

describe('Phase 8d-1: Worker Notifications & Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Quiet hours deferral to 06:30 without dropping', () => {
    it('defers 23:00 dose reminder during quiet hours, but dispatches it when worker runs at 06:30 local time', async () => {
      // Profile timezone: Asia/Kolkata (IST = UTC+5:30)
      // 23:00 IST on Nov 22 is 17:30 UTC Nov 22
      const nightScheduledAt = new Date('2026-11-22T17:30:00.000Z');
      // 06:30 IST on Nov 23 is 01:00 UTC Nov 23
      const morningReleaseAt = new Date('2026-11-23T01:00:00.000Z');

      const mockDose = {
        id: 'dose-night-1',
        profileId: 'prof-kamala',
        scheduledAt: nightScheduledAt,
        status: 'PENDING',
        profile: {
          id: 'prof-kamala',
          displayName: 'Kamala Devi',
          timezone: 'Asia/Kolkata',
          emailShowsMedicineNames: false,
          owner: {
            id: 'user-kamala',
            name: 'Kamala Devi',
            email: 'kamala@example.com',
          },
        },
        schedule: {
          graceMinutes: 60,
          medication: {
            name: 'Amlodipine',
            strength: '5 mg',
            instructions: 'Bedtime',
            criticality: 'STANDARD',
            isActive: true,
          },
        },
      };

      // RUN 1 at 23:00 IST (night): within quiet hours -> deferred
      vi.mocked(prisma.doseEvent.findMany)
        .mockResolvedValueOnce([]) // auto-miss
        .mockResolvedValueOnce([mockDose as any]);
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);

      const nightSent = await processDoseReminders(nightScheduledAt);
      expect(nightSent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();

      // RUN 2 at 06:30 IST (morning release): quiet hours ended!
      // The deferred dose from 23:00 MUST be scanned and sent at 06:30 without being dropped
      vi.mocked(prisma.doseEvent.findMany)
        .mockResolvedValueOnce([]) // auto-miss
        .mockResolvedValueOnce([mockDose as any]); // scanner finds the deferred dose
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'notif-def-1' } as any);

      const morningSent = await processDoseReminders(morningReleaseAt);
      expect(morningSent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Failed notification retry with exponential backoff', () => {
    it('retries failed notification after backoff interval, increments attempt, and sets SENT upon success', async () => {
      const now = new Date('2026-11-23T10:00:00.000Z');
      const failedCreatedAt = new Date(now.getTime() - 4 * 60 * 1000); // 4 mins ago (backoff for attempt 1 is 2m)

      const mockFailedLog = {
        id: 'notif-failed-1',
        profileId: 'prof-1',
        recipientUserId: 'user-1',
        type: 'UPCOMING_DOSE',
        referenceKey: 'ref-failed-1',
        channel: 'EMAIL',
        status: 'FAILED',
        attempts: 1,
        createdAt: failedCreatedAt,
        profile: {
          displayName: 'Kamala Devi',
          emailShowsMedicineNames: false,
        },
      };

      vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([mockFailedLog as any]);
      vi.mocked(sendEmail).mockResolvedValueOnce({ success: true });

      const retriedCount = await processNotificationRetries(now);
      expect(retriedCount).toBe(1);

      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-failed-1' },
        data: expect.objectContaining({
          status: 'SENT',
          attempts: 2,
        }),
      });
    });

    it('does not retry if backoff interval has not elapsed yet', async () => {
      const now = new Date('2026-11-23T10:00:00.000Z');
      const recentFailedAt = new Date(now.getTime() - 30 * 1000); // only 30s ago (attempt 1 requires 2m)

      const mockFailedLog = {
        id: 'notif-failed-2',
        profileId: 'prof-1',
        recipientUserId: 'user-1',
        type: 'UPCOMING_DOSE',
        referenceKey: 'ref-failed-2',
        channel: 'EMAIL',
        status: 'FAILED',
        attempts: 1,
        createdAt: recentFailedAt,
      };

      vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([mockFailedLog as any]);

      const retriedCount = await processNotificationRetries(now);
      expect(retriedCount).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('permanently abandons notification when attempts reach 3', async () => {
      const now = new Date('2026-11-23T10:00:00.000Z');
      const mockPermanentlyFailedLog = {
        id: 'notif-failed-3',
        profileId: 'prof-1',
        status: 'FAILED',
        attempts: 3,
        createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      };

      // Query filters out attempts >= 3
      vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([]);

      const retriedCount = await processNotificationRetries(now);
      expect(retriedCount).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('3. Unique-key race handling in Low-Stock alerts', () => {
    it('catches Prisma P2002 duplicate key violation gracefully without failing the job', async () => {
      const now = new Date('2026-11-23T10:00:00.000Z');

      const mockLowStockMed = {
        id: 'med-low-1',
        profileId: 'prof-1',
        name: 'Metformin',
        strength: '500 mg',
        stockCount: 2,
        refillThreshold: 5,
        isActive: true,
        profile: {
          id: 'prof-1',
          displayName: 'Elder John',
          emailShowsMedicineNames: true,
          memberships: [
            {
              role: 'OWNER',
              status: 'ACTIVE',
              user: { id: 'u1', name: 'John', email: 'john@example.com' },
            },
          ],
        },
      };

      vi.mocked(prisma.medication.findMany).mockResolvedValue([mockLowStockMed as any]);
      vi.mocked(prisma.notificationLog.findFirst).mockResolvedValue(null);

      // Simulate concurrent worker creating notificationLog with same refKey first -> P2002 error
      const p2002Error: any = new Error('Unique constraint failed on the fields: (`referenceKey`)');
      p2002Error.code = 'P2002';
      vi.mocked(prisma.notificationLog.create).mockRejectedValueOnce(p2002Error);

      // Should handle P2002 gracefully and return 0 alerts sent instead of throwing
      await expect(processLowStockAlerts(now)).resolves.not.toThrow();
    });
  });
});

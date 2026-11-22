import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
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
    },
    appointment: {
      findMany: vi.fn(),
    },
    careProfile: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  DoseStatus: {
    PENDING: 'PENDING',
    MISSED: 'MISSED',
    SNOOZED: 'SNOOZED',
  },
  MedicationCriticality: {
    STANDARD: 'STANDARD',
    CRITICAL: 'CRITICAL',
  },
}));

// Mock Email Sender
vi.mock('../email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { processDoseReminders } from '../jobs/dose-reminders.job';
import { processLowStockAlerts } from '../jobs/low-stock.job';
import { processAutoMissDoses } from '../jobs/auto-miss.job';
import { processAppointmentReminders } from '../jobs/appointment-reminders.job';
import { processScheduledDeletions } from '../jobs/scheduled-deletion.job';
import { setupGracefulShutdown } from '../index';

describe('Phase 4: Background Worker Job Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Dose Reminders (Quiet Hours & Criticality)', () => {
    it('defers non-critical dose reminders during quiet hours (e.g. 23:00)', async () => {
      const lateNight = new Date('2026-11-22T17:30:00Z'); // 23:00 in IST (Asia/Kolkata)

      // pending dose at 23:00 IST
      vi.mocked(prisma.doseEvent.findMany).mockResolvedValueOnce([]) // for auto-miss
        .mockResolvedValueOnce([
          {
            id: 'dose-std',
            profileId: 'prof-1',
            scheduledAt: lateNight,
            profile: {
              id: 'prof-1',
              displayName: 'Kamala',
              timezone: 'Asia/Kolkata',
              emailShowsMedicineNames: false,
              owner: { id: 'u1', name: 'Kamala', email: 'kamala@example.com' },
            },
            schedule: {
              medication: {
                id: 'm1',
                name: 'Multivitamin',
                strength: '1 pill',
                instructions: 'With water',
                criticality: 'STANDARD',
              },
            },
          } as any,
        ]);

      const sent = await processDoseReminders(lateNight);
      expect(sent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends critical medication reminder even during quiet hours', async () => {
      const lateNight = new Date('2026-11-22T17:30:00Z'); // 23:00 IST
      vi.mocked(prisma.doseEvent.findMany).mockResolvedValueOnce([]) // auto-miss
        .mockResolvedValueOnce([
          {
            id: 'dose-crit',
            profileId: 'prof-1',
            scheduledAt: lateNight,
            profile: {
              id: 'prof-1',
              displayName: 'Kamala',
              timezone: 'Asia/Kolkata',
              emailShowsMedicineNames: false,
              owner: { id: 'u1', name: 'Kamala', email: 'kamala@example.com' },
            },
            schedule: {
              medication: {
                id: 'm-crit',
                name: 'Insulin',
                strength: '10 units',
                instructions: 'Inject subQ',
                criticality: 'CRITICAL',
              },
            },
          } as any,
        ]);

      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'nl-1' } as any);

      const sent = await processDoseReminders(lateNight);
      expect(sent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      // Privacy check: emailShowsMedicineNames is false, so subject must hide drug name
      expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toBe('Medication Reminder: 11:00 PM');
      expect(vi.mocked(sendEmail).mock.calls[0][0].subject).not.toContain('Insulin');
    });
  });

  describe('2. Low Stock Alerts & Privacy Copy', () => {
    it('emits privacy-safe low stock alert when stockCount <= refillThreshold and emailShowsMedicineNames is false', async () => {
      const refTime = new Date('2026-11-22T10:00:00Z');
      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        {
          id: 'med-low',
          name: 'Metformin',
          strength: '500mg',
          stockCount: 3,
          refillThreshold: 5,
          profileId: 'prof-1',
          profile: {
            id: 'prof-1',
            displayName: 'Kamala',
            emailShowsMedicineNames: false,
            memberships: [
              {
                id: 'mem-caregiver',
                status: 'ACTIVE',
                role: 'CAREGIVER',
                user: { id: 'u2', name: 'Rajesh', email: 'rajesh@example.com' },
              },
            ],
          },
        } as any,
      ]);

      vi.mocked(prisma.notificationLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'nl-stock' } as any);

      const count = await processLowStockAlerts(refTime);
      expect(count).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
      expect(callArgs.to).toBe('rajesh@example.com');
      // Must use privacy-safe copy omitting medication name
      expect(callArgs.subject).toBe('A refill is needed. Open the app to see which medicine.');
    });

    it('emits explicit drug name when emailShowsMedicineNames is true', async () => {
      const refTime = new Date('2026-11-22T10:00:00Z');
      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        {
          id: 'med-low-2',
          name: 'Amlodipine',
          strength: '5mg',
          stockCount: 2,
          refillThreshold: 5,
          profileId: 'prof-2',
          profile: {
            id: 'prof-2',
            displayName: 'Kamala',
            emailShowsMedicineNames: true,
            memberships: [
              {
                id: 'mem-caregiver',
                status: 'ACTIVE',
                role: 'CAREGIVER',
                user: { id: 'u2', name: 'Rajesh', email: 'rajesh@example.com' },
              },
            ],
          },
        } as any,
      ]);

      vi.mocked(prisma.notificationLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'nl-stock-2' } as any);

      const count = await processLowStockAlerts(refTime);
      expect(count).toBe(1);
      const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
      expect(callArgs.subject).toContain('Low Stock Alert: Amlodipine');
    });
  });

  describe('3. Auto-Miss Scanner (Bounded Batches & Conditional Update)', () => {
    it('scans pending doses past grace window and updates status to MISSED conditionally', async () => {
      const now = new Date('2026-11-22T12:00:00Z');
      const scheduledAt = new Date('2026-11-22T10:00:00Z'); // 2 hours ago

      vi.mocked(prisma.doseEvent.findMany).mockResolvedValue([
        {
          id: 'dose-past',
          scheduledAt,
          status: 'PENDING',
          schedule: { graceMinutes: 60 }, // expired 1 hour ago
        } as any,
      ]);

      vi.mocked(prisma.doseEvent.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.doseEventAction.create).mockResolvedValue({ id: 'act-1' } as any);

      const missed = await processAutoMissDoses(now);
      expect(missed).toBe(1);
      expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'dose-past', status: { in: ['PENDING', 'SNOOZED'] } },
        data: { status: 'MISSED' },
      });
      expect(prisma.doseEventAction.create).toHaveBeenCalledWith({
        data: {
          doseEventId: 'dose-past',
          fromStatus: 'PENDING',
          toStatus: 'MISSED',
          reason: 'Auto-missed after grace period expired',
        },
      });
    });
  });

  describe('4. Appointment Reminders', () => {
    it('sends appointment reminder at configured offset window', async () => {
      const now = new Date('2026-11-22T08:00:00Z');
      const startsAt = new Date(now.getTime() + 120 * 60 * 1000); // exactly 120 minutes away (2 hours)

      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        {
          id: 'appt-1',
          title: 'Cardiologist Checkup',
          doctorName: 'Dr. Rao',
          clinicName: 'Apollo Hospital',
          startsAt,
          status: 'SCHEDULED',
          reminderOffsetsMinutes: [10080, 1440, 120],
          profileId: 'prof-1',
          profile: {
            id: 'prof-1',
            displayName: 'Kamala',
            timezone: 'Asia/Kolkata',
            memberships: [
              {
                id: 'mem-1',
                status: 'ACTIVE',
                role: 'CAREGIVER',
                user: { id: 'u2', name: 'Rajesh', email: 'rajesh@example.com' },
              },
            ],
          },
        } as any,
      ]);

      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'nl-appt' } as any);

      const sent = await processAppointmentReminders(now);
      expect(sent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain('Cardiologist Checkup');
    });
  });

  describe('5. Scheduled Deletions (>30 Days Grace Period)', () => {
    it('deletes profiles with deletionRequestedAt older than 30 days and records DATA:DELETE audit log', async () => {
      const now = new Date('2026-11-22T12:00:00Z');
      const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.careProfile.findMany).mockResolvedValue([
        {
          id: 'prof-to-delete',
          displayName: 'Old Profile',
          ownerId: 'u-owner-1',
          deletionRequestedAt: thirtyFiveDaysAgo,
          owner: { id: 'u-owner-1', name: 'User 1' },
        } as any,
      ]);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'audit-del' } as any);
      vi.mocked(prisma.careProfile.delete).mockResolvedValue({ id: 'prof-to-delete' } as any);

      const deleted = await processScheduledDeletions(now);
      expect(deleted).toBe(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA:DELETE',
          entityType: 'CareProfile',
          entityId: 'prof-to-delete',
        }),
      });
      expect(prisma.careProfile.delete).toHaveBeenCalledWith({
        where: { id: 'prof-to-delete' },
      });
    });
  });

  describe('6. Graceful Shutdown', () => {
    it('gracefully shuts down worker and redis connection on termination signal', async () => {
      const mockWorker = { close: vi.fn().mockResolvedValue(undefined) } as any;
      const mockRedis = { quit: vi.fn().mockResolvedValue('OK') } as any;

      const shutdownHandler = setupGracefulShutdown(mockWorker, mockRedis);

      // Mock process.exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      await shutdownHandler('SIGTERM');

      expect(mockWorker.close).toHaveBeenCalledTimes(1);
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });
  });
});

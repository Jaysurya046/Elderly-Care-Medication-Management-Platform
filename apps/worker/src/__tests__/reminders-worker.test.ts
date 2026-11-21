import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processDoseReminders } from '../jobs/dose-reminders.job';
import { processCriticalEscalations } from '../jobs/critical-escalation.job';
import { prisma } from '@elder-care/db';
import * as emailSender from '../email-sender';

vi.mock('@elder-care/db', () => {
  const mockPrisma: any = {
    doseEvent: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      update: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock('../email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Phase 4: Worker Reminders, Escalation & Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs reminder scan twice in same window and dispatches exactly ONE email (idempotency criterion)', async () => {
    const referenceTime = new Date('2026-11-21T08:00:00.000Z');

    const mockDose = {
      id: 'dose-id-1',
      profileId: 'prof-kamala',
      scheduledAt: referenceTime,
      status: 'PENDING',
      profile: {
        id: 'prof-kamala',
        displayName: 'Kamala Devi',
        timezone: 'Asia/Kolkata',
        emailShowsMedicineNames: false,
        owner: {
          id: 'user-kamala',
          name: 'Kamala Devi',
          email: 'kamala@demo.com',
        },
      },
      schedule: {
        graceMinutes: 60,
        medication: {
          name: 'Metformin',
          strength: '500 mg',
          criticality: 'STANDARD',
        },
      },
    };

    // First run: no notification log exists yet
    (prisma.doseEvent.findMany as any).mockResolvedValue([mockDose]);
    (prisma.notificationLog.findUnique as any).mockResolvedValueOnce(null);

    const firstRunSent = await processDoseReminders(referenceTime);
    expect(firstRunSent).toBe(1);
    expect(emailSender.sendEmail).toHaveBeenCalledTimes(1);

    // Second run with the same event: existing notification log found!
    (prisma.notificationLog.findUnique as any).mockResolvedValueOnce({
      id: 'notif-1',
      referenceKey: 'already-exists',
    });

    const secondRunSent = await processDoseReminders(referenceTime);
    // Should be skipped due to idempotent referenceKey
    expect(secondRunSent).toBe(0);
    // Email count must remain 1
    expect(emailSender.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('escalates critical dose that remains MISSED after graceMinutes + 60 minutes delay', async () => {
    // Scheduled at 08:00 UTC, grace is 60m (09:00), escalation is after 60m (10:00 UTC)
    const scheduledAt = new Date('2026-11-21T08:00:00.000Z');
    const eligibleEscalationTime = new Date('2026-11-21T10:05:00.000Z'); // past 10:00

    const mockCriticalDose = {
      id: 'dose-crit-1',
      profileId: 'prof-kamala',
      scheduledAt,
      status: 'MISSED',
      profile: {
        id: 'prof-kamala',
        displayName: 'Kamala Devi',
        timezone: 'Asia/Kolkata',
      },
      schedule: {
        graceMinutes: 60,
        escalateToCaregivers: true,
        medication: {
          name: 'Telmisartan',
          criticality: 'CRITICAL',
        },
      },
    };

    (prisma.doseEvent.findMany as any).mockResolvedValue([mockCriticalDose]);
    (prisma.membership.findMany as any).mockResolvedValue([
      {
        id: 'mem-rajesh',
        profileId: 'prof-kamala',
        role: 'CAREGIVER',
        status: 'ACTIVE',
        scopes: { receive_missed_dose_alerts: true },
        user: {
          id: 'user-rajesh',
          name: 'Rajesh Sharma',
          email: 'rajesh@demo.com',
        },
      },
    ]);
    (prisma.notificationLog.findUnique as any).mockResolvedValue(null);

    const escalationsSent = await processCriticalEscalations(eligibleEscalationTime);
    expect(escalationsSent).toBe(1);
    expect(emailSender.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rajesh@demo.com',
        subject: expect.stringContaining('URGENT: Critical medication missed'),
      })
    );
  });
});

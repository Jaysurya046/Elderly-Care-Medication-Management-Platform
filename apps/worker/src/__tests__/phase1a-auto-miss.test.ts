import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@elder-care/db';
import { processDoseReminders } from '../jobs/dose-reminders.job';

vi.mock('@elder-care/db', () => {
  const mockPrisma = {
    doseEvent: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock('../email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

describe('Phase 1a Item 5: Worker Auto-Miss Conditional Update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Item 5: Worker auto-miss uses conditional updateMany and only creates DoseEventAction if count === 1', async () => {
    const expiredScheduledAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    // 1st call: expired pending doses
    (prisma.doseEvent.findMany as any).mockResolvedValueOnce([
      {
        id: 'dose-expired-1',
        profileId: 'profile-1',
        status: 'PENDING',
        scheduledAt: expiredScheduledAt,
        schedule: { graceMinutes: 60 },
        profile: { timezone: 'Asia/Kolkata' },
      },
    ]);
    // 2nd call: upcoming doses
    (prisma.doseEvent.findMany as any).mockResolvedValueOnce([]);

    // Simulate concurrent update took it, so updateMany returns count: 0
    (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 0 });

    await processDoseReminders();

    // Must NOT create DoseEventAction if count was 0
    expect(prisma.doseEventAction.create).not.toHaveBeenCalled();
    // Must have used updateMany with status in PENDING, SNOOZED
    expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'dose-expired-1',
          status: { in: ['PENDING', 'SNOOZED'] },
        }),
        data: expect.objectContaining({ status: 'MISSED' }),
      })
    );
  });
});

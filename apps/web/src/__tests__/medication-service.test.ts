import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordDoseAction } from '../services/medication-service';
import { prisma } from '@elder-care/db';

vi.mock('@elder-care/db', () => {
  const mockPrisma: any = {
    user: {
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    doseEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    medication: {
      update: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY' },
    MembershipStatus: { ACTIVE: 'ACTIVE' },
    DoseStatus: { PENDING: 'PENDING', TAKEN: 'TAKEN', LATE_TAKEN: 'LATE_TAKEN', SKIPPED: 'SKIPPED', MISSED: 'MISSED' },
    MedicationCriticality: { STANDARD: 'STANDARD', CRITICAL: 'CRITICAL' },
  };
});

describe('Phase 3: Medication & Dose Tracking Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records TAKE action, decrements stock atomically, and logs action history', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-kamala' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-1',
      profileId: 'prof-1',
      userId: 'user-kamala',
      role: 'OWNER',
      status: 'ACTIVE',
      scopes: { view_medications: true, manage_medications: true },
    });

    const mockDose = {
      id: 'dose-123',
      profileId: 'prof-1',
      status: 'PENDING',
      snoozeCount: 0,
      stockDecremented: false,
      schedule: {
        medicationId: 'med-metformin',
        medication: {
          id: 'med-metformin',
          stockCount: 10,
        },
      },
    };

    (prisma.doseEvent.findUnique as any).mockResolvedValue(mockDose);
    (prisma.doseEvent.update as any).mockResolvedValue({
      ...mockDose,
      status: 'TAKEN',
      stockDecremented: true,
      actedAt: new Date(),
    });

    const result = await recordDoseAction('dose-123', { action: 'TAKE' }, 'user-kamala');

    expect(result.status).toBe('TAKEN');
    expect(result.stockDecremented).toBe(true);

    // Verify medication stock decremented
    expect(prisma.medication.update).toHaveBeenCalledWith({
      where: { id: 'med-metformin' },
      data: { stockCount: 9 },
    });

    // Verify append-only dose action history created
    expect(prisma.doseEventAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        doseEventId: 'dose-123',
        fromStatus: 'PENDING',
        toStatus: 'TAKEN',
        membershipId: 'mem-1',
      }),
    });

    // Verify audit log created
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DOSE:ACTION',
          entityType: 'DoseEvent',
          entityId: 'dose-123',
        }),
      })
    );
  });

  it('prevents double-action race condition if another caregiver already recorded the dose', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-rajesh' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-caregiver',
      profileId: 'prof-1',
      userId: 'user-rajesh',
      role: 'CAREGIVER',
      status: 'ACTIVE',
      scopes: { view_medications: true },
    });

    // First lookup was PENDING
    const initialDose = {
      id: 'dose-456',
      profileId: 'prof-1',
      status: 'PENDING',
      snoozeCount: 0,
      stockDecremented: false,
      schedule: {
        medicationId: 'med-telmisartan',
        medication: { id: 'med-telmisartan', stockCount: 20 },
      },
    };
    (prisma.doseEvent.findUnique as any)
      .mockResolvedValueOnce(initialDose) // Initial fetch
      .mockResolvedValueOnce({ ...initialDose, status: 'TAKEN' }); // Fresh fetch in transaction shows already TAKEN

    await expect(
      recordDoseAction('dose-456', { action: 'TAKE' }, 'user-rajesh')
    ).rejects.toThrow('Already recorded by another caregiver (Status: TAKEN).');
  });
});

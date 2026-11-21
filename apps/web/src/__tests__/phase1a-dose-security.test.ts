import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma, Role } from '@elder-care/db';
import { recordDoseAction } from '../services/medication-service';

// Mock dependencies
vi.mock('@elder-care/db', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => ({
        id: where.id || 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      })),
    },
    careProfile: {
      findUnique: vi.fn(async ({ where }: any) => ({
        id: where.id,
        name: 'Grandma Smith',
        timezone: 'Asia/Kolkata',
      })),
    },
    doseEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    medication: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' },
    DoseStatus: { PENDING: 'PENDING', TAKEN: 'TAKEN', LATE_TAKEN: 'LATE_TAKEN', SKIPPED: 'SKIPPED', SNOOZED: 'SNOOZED', MISSED: 'MISSED' },
    MedicationCriticality: { STANDARD: 'STANDARD', CRITICAL: 'CRITICAL' },
  };
});

describe('Phase 1a: Dose Security & Atomic Transitions (Items 1-4)', () => {
  const mockProfileId = 'profile-123';
  const mockDoseId = 'dose-456';
  const mockMedicationId = 'med-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Item 1: FAMILY role must be view-only and rejected with 403 on TAKE action', async () => {
    // Mock dose belonging to profile
    (prisma.doseEvent.findUnique as any).mockResolvedValue({
      id: mockDoseId,
      profileId: mockProfileId,
      status: 'PENDING',
      snoozeCount: 0,
      stockDecremented: false,
      schedule: {
        medicationId: mockMedicationId,
        medication: { id: mockMedicationId, stockCount: 10 },
      },
    });

    // Mock caller as FAMILY role with only view_medications scope
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'membership-family',
      profileId: mockProfileId,
      userId: 'user-family',
      role: Role.FAMILY,
      scopes: { view_medications: true, manage_medications: false },
      status: 'ACTIVE',
    });

    // MUST throw error rejecting FAMILY from modifying doses
    await expect(
      recordDoseAction(mockDoseId, { action: 'TAKE' }, 'user-family')
    ).rejects.toThrow(/Forbidden|manage_medications|view-only/i);
  });

  it('Item 2: Calling dose action verifies dose.profileId === expected profile or rejects with 404', async () => {
    (prisma.doseEvent.findUnique as any).mockResolvedValue({
      id: mockDoseId,
      profileId: 'different-profile-id',
      status: 'PENDING',
      snoozeCount: 0,
      stockDecremented: false,
      schedule: {
        medicationId: mockMedicationId,
        medication: { id: mockMedicationId, stockCount: 10 },
      },
    });

    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'membership-owner',
      profileId: mockProfileId,
      userId: 'user-owner',
      role: Role.OWNER,
      scopes: { view_medications: true, manage_medications: true },
      status: 'ACTIVE',
    });

    // When calling with expectedProfileId mismatch, must reject with 404
    await expect(
      recordDoseAction(mockDoseId, { action: 'TAKE' }, 'user-owner', mockProfileId)
    ).rejects.toThrow(/not found|does not belong to/i);
  });

  it('Item 3: Atomic transition throws ConflictError with actor details when updateMany count is not 1', async () => {
    (prisma.doseEvent.findUnique as any)
      .mockResolvedValueOnce({
        id: mockDoseId,
        profileId: mockProfileId,
        status: 'PENDING',
        snoozeCount: 0,
        stockDecremented: false,
        schedule: {
          medicationId: mockMedicationId,
          medication: { id: mockMedicationId, stockCount: 10 },
        },
      })
      // Second findUnique is on conflict re-read
      .mockResolvedValueOnce({
        id: mockDoseId,
        profileId: mockProfileId,
        status: 'TAKEN',
        actedAt: new Date('2026-11-21T10:00:00Z'),
        actedByMembership: {
          user: { name: 'Nurse Joy' },
        },
      });

    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'membership-caregiver',
      profileId: mockProfileId,
      userId: 'user-cg',
      role: Role.CAREGIVER,
      scopes: { view_medications: true, manage_medications: true },
      status: 'ACTIVE',
    });

    // Simulate updateMany returning count: 0 (another caregiver acted concurrently)
    (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 0 });

    await expect(
      recordDoseAction(mockDoseId, { action: 'TAKE' }, 'user-cg')
    ).rejects.toThrow(/Already recorded by Nurse Joy/i);
  });

  it('Item 4: Atomic stock decrement uses conditional decrement with zero floor gt: 0', async () => {
    (prisma.doseEvent.findUnique as any).mockResolvedValue({
      id: mockDoseId,
      profileId: mockProfileId,
      status: 'PENDING',
      snoozeCount: 0,
      stockDecremented: false,
      schedule: {
        medicationId: mockMedicationId,
        medication: { id: mockMedicationId, stockCount: 0 }, // 0 stock
      },
    });

    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'membership-owner',
      profileId: mockProfileId,
      userId: 'user-owner',
      role: Role.OWNER,
      scopes: { view_medications: true, manage_medications: true },
      status: 'ACTIVE',
    });

    (prisma.doseEvent.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.medication.updateMany as any).mockResolvedValue({ count: 0 }); // 0 updated because stock was 0

    // Should succeed recording the dose even when stock is 0
    await recordDoseAction(mockDoseId, { action: 'TAKE' }, 'user-owner');

    // Asserts updateMany was used with { gt: 0 } and { decrement: 1 }
    expect(prisma.medication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: mockMedicationId,
          stockCount: { gt: 0 },
        }),
        data: expect.objectContaining({
          stockCount: { decrement: 1 },
        }),
      })
    );
  });
});

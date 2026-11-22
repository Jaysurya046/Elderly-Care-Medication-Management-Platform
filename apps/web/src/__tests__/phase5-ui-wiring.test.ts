import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { calculateAdherence, isLowStock, calculateDaysOfSupply } from '@elder-care/core';

// Mock dependencies
vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentSessionId: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock('@elder-care/db', () => ({
  prisma: {
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    doseEvent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  Role: {
    OWNER: 'OWNER',
    CAREGIVER: 'CAREGIVER',
    FAMILY: 'FAMILY',
    EMERGENCY_VIEWER: 'EMERGENCY_VIEWER',
  },
  DoseStatus: {
    PENDING: 'PENDING',
    TAKEN: 'TAKEN',
    SNOOZED: 'SNOOZED',
    SKIPPED: 'SKIPPED',
    MISSED: 'MISSED',
  },
}));

import { getCurrentUser } from '@/lib/session';
import { prisma, Role } from '@elder-care/db';
import { GET as getMe } from '@/app/api/auth/me/route';

describe('Phase 5 UI Wiring & Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User Profile & Membership Context (/api/auth/me)', () => {
    it('returns active memberships and care profile details, including emergencyCode for OWNER', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-owner-1',
        name: 'Kamala Devi',
        email: 'kamala@test.com',
        consentVersion: 'v1.0',
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValue([
        {
          id: 'mem-1',
          userId: 'user-owner-1',
          profileId: 'profile-1',
          role: Role.OWNER,
          status: 'ACTIVE',
          scopes: ['manage_medications', 'view_medications'],
          profile: {
            id: 'profile-1',
            elderName: 'Kamala Devi',
            dateOfBirth: new Date('1950-01-01'),
            timezone: 'Asia/Kolkata',
            emergencyCode: 'EMRG8821',
            bloodType: 'O+',
            allergies: 'Penicillin',
            conditions: 'Hypertension',
            primaryDoctorName: 'Dr. Anand Kulkarni',
            preferredHospital: 'Ruby Hall Clinic',
          },
        },
      ] as any);

      const req = new NextRequest('http://localhost:3000/api/auth/me');
      const res = await getMe(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.id).toBe('user-owner-1');
      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].role).toBe(Role.OWNER);
      expect(data.memberships[0].careProfile.emergencyCode).toBe('EMRG8821');
    });

    it('strips emergencyCode from careProfile for non-OWNER members in /api/auth/me', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-caregiver-1',
        name: 'Rajesh Sharma',
        email: 'rajesh@test.com',
        consentVersion: 'v1.0',
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValue([
        {
          id: 'mem-2',
          userId: 'user-caregiver-1',
          profileId: 'profile-1',
          role: Role.CAREGIVER,
          status: 'ACTIVE',
          scopes: ['manage_medications', 'view_medications'],
          profile: {
            id: 'profile-1',
            elderName: 'Kamala Devi',
            dateOfBirth: new Date('1950-01-01'),
            timezone: 'Asia/Kolkata',
            emergencyCode: 'EMRG8821',
            bloodType: 'O+',
            allergies: 'Penicillin',
            conditions: 'Hypertension',
            primaryDoctorName: 'Dr. Anand Kulkarni',
            preferredHospital: 'Ruby Hall Clinic',
          },
        },
      ] as any);

      const req = new NextRequest('http://localhost:3000/api/auth/me');
      const res = await getMe(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.memberships[0].role).toBe(Role.CAREGIVER);
      expect(data.memberships[0].careProfile.emergencyCode).toBeUndefined();
    });
  });

  describe('Adherence Score & Inventory Calculation', () => {
    it('calculates adherence rate accurately using standard formula', () => {
      const now = new Date('2026-11-22T12:00:00Z');
      const doses = [
        { id: '1', scheduledAt: new Date('2026-11-22T08:00:00Z'), status: 'TAKEN' as const },
        { id: '2', scheduledAt: new Date('2026-11-22T09:00:00Z'), status: 'LATE_TAKEN' as const },
        { id: '3', scheduledAt: new Date('2026-11-22T10:00:00Z'), status: 'MISSED' as const },
        { id: '4', scheduledAt: new Date('2026-11-22T11:00:00Z'), status: 'SKIPPED' as const, skipReason: 'Doctor advised' },
        { id: '5', scheduledAt: new Date('2026-11-22T18:00:00Z'), status: 'PENDING' as const }, // future dose, excluded
      ];

      const result = calculateAdherence(doses, now);
      // Taken = 1, LateTaken = 1 => 2 successful
      // Missed = 1
      // Valid skipped = 1 (excluded from eligible denominator)
      // Total eligible = 2 + 1 = 3
      // Percentage = (2 / 3) * 100 = 67%
      expect(result.takenCount).toBe(1);
      expect(result.lateTakenCount).toBe(1);
      expect(result.missedCount).toBe(1);
      expect(result.validSkippedCount).toBe(1);
      expect(result.totalEligibleDoses).toBe(3);
      expect(result.percentage).toBe(67);
    });

    it('accurately identifies low stock and calculates days of supply', () => {
      expect(isLowStock(4, 5)).toBe(true);
      expect(isLowStock(5, 5)).toBe(true);
      expect(isLowStock(6, 5)).toBe(false);

      expect(calculateDaysOfSupply(28, 1)).toBe(28);
      expect(calculateDaysOfSupply(45, 2)).toBe(22);
      expect(calculateDaysOfSupply(4, 1)).toBe(4);
    });
  });
});

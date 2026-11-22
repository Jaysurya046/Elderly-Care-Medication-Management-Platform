import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@elder-care/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
    careNote: {
      findMany: vi.fn(),
    },
    doseEvent: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  },
  Role: {
    OWNER: 'OWNER',
    CAREGIVER: 'CAREGIVER',
    FAMILY: 'FAMILY',
    EMERGENCY_VIEWER: 'EMERGENCY_VIEWER',
  },
  MembershipStatus: {
    ACTIVE: 'ACTIVE',
    REVOKED: 'REVOKED',
    INVITED: 'INVITED',
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentSessionId: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  validateCsrfRequest: vi.fn().mockReturnValue({ valid: true }),
}));

import { prisma, Role } from '@elder-care/db';
import { getCurrentUser } from '@/lib/session';
import { GET as exportRoute } from '@/app/api/profiles/[id]/export/route';
import { POST as scheduleDeleteRoute, DELETE as cancelDeleteRoute } from '@/app/api/profiles/[id]/delete/route';
import { processScheduledDeletions } from '../../../../apps/worker/src/jobs/scheduled-deletion.job';

describe('Phase 6 Data Lifecycle & Export (Section 8)', () => {
  const mockUser = { id: 'user-owner', name: 'Owner User', email: 'owner@test.com' };
  const mockProfile = {
    id: 'profile-1',
    ownerId: 'user-owner',
    displayName: 'Kamala Devi',
    dateOfBirth: new Date('1950-01-01'),
    timezone: 'Asia/Kolkata',
    bloodType: 'O+',
    allergies: 'Penicillin',
    conditions: 'Hypertension',
    primaryDoctorName: 'Dr. Anand Kulkarni',
    preferredHospital: 'Ruby Hall Clinic',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'mem-1',
      profileId: 'profile-1',
      userId: 'user-owner',
      role: Role.OWNER,
      status: 'ACTIVE',
      scopes: ['manage_medications', 'view_medications'],
    } as any);
  });

  describe('Data Export API (JSON and CSV)', () => {
    it('exports complete JSON bundle without any secrets (passwords, tokens, passcodes)', async () => {
      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        { id: 'med-1', name: 'Telmisartan', strength: '40 mg', form: 'Tablet', stockCount: 28, refillThreshold: 7, schedules: [] },
      ] as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        { id: 'appt-1', title: 'Cardiology Review', doctorName: 'Dr. Anand Kulkarni', scheduledAt: new Date() },
      ] as any);
      vi.mocked(prisma.careNote.findMany).mockResolvedValue([
        { id: 'note-1', body: 'Blood sugar was 114 mg/dL', createdAt: new Date() },
      ] as any);
      vi.mocked(prisma.membership.findMany).mockResolvedValue([
        { id: 'mem-1', role: 'OWNER', scopes: {}, status: 'ACTIVE', createdAt: new Date() },
      ] as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/export?format=json');
      const res = await exportRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const rawText = await res.text();
      const bundle = JSON.parse(rawText);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      expect(bundle.profile.displayName).toBe('Kamala Devi');
      expect(bundle.medications).toHaveLength(1);
      expect(bundle.appointments).toHaveLength(1);

      // Recursive secret verification
      const walkAndAssertNoSecrets = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        const forbiddenKeys = ['password', 'passwordHash', 'totpSecret', 'passcode', 'passcodeHash', 'token', 'tokenHash'];
        for (const key of Object.keys(obj)) {
          expect(forbiddenKeys).not.toContain(key);
          walkAndAssertNoSecrets(obj[key]);
        }
      };

      walkAndAssertNoSecrets(bundle);
    });

    it('exports CSV formatted file when format=csv is requested', async () => {
      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        { id: 'med-1', name: 'Telmisartan', strength: '40 mg', form: 'Tablet', stockCount: 28, refillThreshold: 7, criticality: 'CRITICAL', schedules: [] },
      ] as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([
        { id: 'appt-1', title: 'Cardiology Review', doctorName: 'Dr. Anand Kulkarni', clinicName: 'Ruby Hall OPD', scheduledAt: new Date('2026-11-25T10:00:00Z'), travelMinutes: 30, questionsToAsk: 'Review HbA1c' },
      ] as any);
      vi.mocked(prisma.careNote.findMany).mockResolvedValue([
        { id: 'note-1', body: 'Blood sugar was 114 mg/dL', createdAt: new Date('2026-11-22T08:30:00Z') },
      ] as any);
      vi.mocked(prisma.membership.findMany).mockResolvedValue([] as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/export?format=csv');
      const res = await exportRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const csvText = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(csvText).toContain('Profile Export');
      expect(csvText).toContain('Telmisartan');
      expect(csvText).toContain('Dr. Anand Kulkarni');
      expect(csvText).toContain('Blood sugar was 114 mg/dL');
    });
  });

  describe('Profile Deletion Lifecycle (30-Day Grace & Cancellation)', () => {
    it('schedules deletion with 30-day grace period end date and audits event', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      vi.mocked(prisma.careProfile.update).mockResolvedValue({
        ...mockProfile,
        deletionRequestedAt: futureDate,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/delete', { method: 'POST' });
      const res = await scheduleDeleteRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.hardDeletionDate).toBeDefined();
      expect(prisma.careProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            deletionRequestedAt: expect.any(Date),
          }),
        })
      );
    });

    it('cancels scheduled profile deletion by clearing deletionRequestedAt', async () => {
      vi.mocked(prisma.careProfile.update).mockResolvedValue({
        ...mockProfile,
        deletionRequestedAt: null,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/delete', { method: 'DELETE' });
      const res = await cancelDeleteRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('cancelled');
      expect(prisma.careProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { deletionRequestedAt: null },
      });
    });

    it('worker job purges expired profiles and creates DATA:DELETE audit log', async () => {
      const now = new Date('2026-12-30T00:00:00Z');
      const expiredProfile = {
        id: 'profile-expired',
        ownerId: 'user-1',
        displayName: 'Kamala Devi',
        deletionRequestedAt: new Date('2026-11-20T00:00:00Z'), // 40 days ago
        owner: { id: 'user-1', name: 'Kamala Devi' },
      };

      vi.mocked(prisma.careProfile.findMany).mockResolvedValue([expiredProfile] as any);
      vi.mocked(prisma.careProfile.delete).mockResolvedValue(expiredProfile as any);

      const deletedCount = await processScheduledDeletions(now);

      expect(deletedCount).toBe(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: 'profile-expired',
            action: 'DATA:DELETE',
            entityType: 'CareProfile',
          }),
        })
      );
      expect(prisma.careProfile.delete).toHaveBeenCalledWith({
        where: { id: 'profile-expired' },
      });
    });
  });
});

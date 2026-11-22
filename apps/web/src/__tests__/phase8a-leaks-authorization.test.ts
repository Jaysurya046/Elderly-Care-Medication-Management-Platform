import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { sanitizeIpAddress } from '@elder-care/core';

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentSessionId: vi.fn(),
  validateSession: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
}));

vi.mock('@elder-care/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    emergencyContact: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
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

vi.mock('@/lib/csrf', () => ({
  validateCsrfRequest: vi.fn().mockImplementation((req: NextRequest) => {
    // If request has origin mismatch header, return invalid
    const origin = req.headers.get('origin');
    if (origin && origin === 'http://malicious.evil.com') {
      return { valid: false, error: 'CSRF validation failed: cross-origin forbidden', status: 403 };
    }
    return { valid: true };
  }),
}));

import { prisma, Role } from '@elder-care/db';
import { getCurrentUser } from '@/lib/session';
import { GET as exportRoute } from '@/app/api/profiles/[id]/export/route';
import { POST as passcodeRoute } from '@/app/api/auth/passcode/route';
import { GET as getProfileRoute } from '@/app/api/profiles/[id]/route';

describe('Phase 8a: Leaks and Authorization', () => {
  const mockOwnerUser = { id: 'user-owner-1', name: 'Elder Kamala', email: 'kamala@test.com' };
  const mockCaregiverUser = { id: 'user-caregiver-1', name: 'Caregiver Rajesh', email: 'rajesh@test.com' };
  const mockFamilyUser = { id: 'user-family-1', name: 'Family Maya', email: 'maya@test.com' };

  const mockProfile = {
    id: 'profile-1',
    ownerId: 'user-owner-1',
    displayName: 'Kamala Devi',
    dateOfBirth: new Date('1950-01-01'),
    timezone: 'Asia/Kolkata',
    bloodType: 'O+',
    allergies: 'Penicillin',
    conditions: 'Hypertension',
    primaryDoctorName: 'Dr. Anand Kulkarni',
    preferredHospital: 'Ruby Hall Clinic',
    emergencyCode: 'EMRG8821',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Export Restrictions, Signed Links & Formula Injection Prevention', () => {
    it('restricts export strictly to OWNER role (CAREGIVER gets 403 even with manage_medications)', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockCaregiverUser as any);
      vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-cg',
        profileId: 'profile-1',
        userId: 'user-caregiver-1',
        role: Role.CAREGIVER,
        status: 'ACTIVE',
        scopes: ['manage_medications', 'view_medications'],
      } as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/export?format=json');
      const res = await exportRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });

      expect(res.status).toBe(403);
    });

    it('requires a valid 15-minute signed token to deliver export bundle', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockOwnerUser as any);
      vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-owner',
        profileId: 'profile-1',
        userId: 'user-owner-1',
        role: Role.OWNER,
        status: 'ACTIVE',
        scopes: ['manage_medications'],
      } as any);

      // Request without signed token or with expired signature must be rejected
      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/export?format=json');
      const res = await exportRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/signed link|token required|expired/i);
    });

    it('escapes CSV formula injection characters (=, +, -, @, tab, cr)', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockOwnerUser as any);
      vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-owner',
        profileId: 'profile-1',
        userId: 'user-owner-1',
        role: Role.OWNER,
        status: 'ACTIVE',
        scopes: ['manage_medications'],
      } as any);

      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        {
          id: 'med-evil',
          name: '=cmd|"/C calc"!A0',
          strength: '+100mg',
          form: '-Tablet',
          criticality: 'STANDARD',
          stockCount: 10,
          refillThreshold: 5,
          instructions: '@hyperlink("evil")',
          schedules: [],
        },
      ] as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.careNote.findMany).mockResolvedValue([]);
      vi.mocked(prisma.membership.findMany).mockResolvedValue([]);

      // Provide valid mock signed link parameters
      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1/export?format=csv&signature=valid&expires=9999999999');
      const res = await exportRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const csvText = await res.text();

      expect(res.status).toBe(200);
      // Formula characters must be sanitized with leading single quote or safe prefix
      expect(csvText).not.toContain('"=cmd|');
      expect(csvText).toContain("'=cmd|");
    });
  });

  describe('2. Passcode Authorization & CSRF on Auth Routes', () => {
    it('rejects setting passcode when caller is neither profile OWNER nor the membership user', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockCaregiverUser as any);
      // Membership belongs to user-other
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-other',
        userId: 'user-other',
        profileId: 'profile-1',
        status: 'ACTIVE',
        role: Role.FAMILY,
        profile: { ownerId: 'user-owner-1' },
      } as any);

      const req = new NextRequest('http://localhost:3000/api/auth/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set',
          membershipId: 'mem-other',
          passcode: '1234',
        }),
      });

      const res = await passcodeRoute(req);
      expect(res.status).toBe(403);
    });

    it('rejects cross-origin requests to /api/auth/passcode via CSRF validation', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockCaregiverUser as any);

      const req = new NextRequest('http://localhost:3000/api/auth/passcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://malicious.evil.com',
        },
        body: JSON.stringify({
          action: 'verify',
          membershipId: 'mem-1',
          passcode: '1234',
        }),
      });

      const res = await passcodeRoute(req);
      expect(res.status).toBe(403);
    });
  });

  describe('3. HMAC-Keyed IP Anonymization for Audit Logging', () => {
    it('hashes IP address using HMAC-SHA256 with server secret, truncated to 16 hex chars', () => {
      const serverSecret = 'my-super-secret-key-that-is-at-least-32-chars!!';
      const ip = '198.51.100.45';

      const hashed = sanitizeIpAddress(ip, serverSecret);
      expect(hashed).toHaveLength(16);
      expect(hashed).toMatch(/^[0-9a-f]{16}$/);

      // Localhost preserved
      expect(sanitizeIpAddress('127.0.0.1', serverSecret)).toBe('127.0.0.1');
      expect(sanitizeIpAddress('::1', serverSecret)).toBe('127.0.0.1');
      expect(sanitizeIpAddress(null, serverSecret)).toBe('unknown');
    });
  });

  describe('4. Role-Scoped Profile Fields in GET /api/profiles/[id]', () => {
    it('restricts sensitive care profile fields when requested by FAMILY role', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(mockFamilyUser as any);
      vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-fam',
        profileId: 'profile-1',
        userId: 'user-family-1',
        role: Role.FAMILY,
        status: 'ACTIVE',
        scopes: ['view_medications'],
      } as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/profile-1');
      const res = await getProfileRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.profile.emergencyCode).toBeUndefined();
      // Internal deletion dates and system audit configs must not leak to FAMILY role
      expect(data.data.profile.deletionRequestedAt).toBeUndefined();
    });
  });
});

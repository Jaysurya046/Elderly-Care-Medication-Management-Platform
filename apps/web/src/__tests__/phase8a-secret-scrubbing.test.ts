import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@elder-care/db';

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
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
    },
    doseEvent: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
    careNote: {
      findMany: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
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
    INVITED: 'INVITED',
    REVOKED: 'REVOKED',
  },
}));

import { prisma } from '@elder-care/db';
import { getCurrentUser } from '@/lib/session';
import { GET as getProfileRoute } from '@/app/api/profiles/[id]/route';
import { GET as getMedicationsRoute } from '@/app/api/profiles/[id]/medications/route';
import { GET as getCareNotesRoute } from '@/app/api/profiles/[id]/care-notes/route';
import { GET as getAppointmentsRoute } from '@/app/api/profiles/[id]/appointments/route';
import { GET as getMeRoute } from '@/app/api/auth/me/route';
import { GET as getSessionsRoute } from '@/app/api/auth/sessions/route';

/**
 * Recursively asserts that no forbidden secret keys appear anywhere in an object or array.
 */
function assertNoSecrets(data: unknown, path: string = 'root') {
  if (!data || typeof data !== 'object') return;

  const forbiddenKeys = [
    'passwordHash',
    'passcodeHash',
    'totpSecret',
    'tokenHash',
  ];

  if (Array.isArray(data)) {
    data.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }

  for (const [key, val] of Object.entries(data)) {
    for (const forbidden of forbiddenKeys) {
      if (key.toLowerCase() === forbidden.toLowerCase()) {
        throw new Error(`Leak detected at ${path}.${key}: secret field exposed in API response!`);
      }
    }
    assertNoSecrets(val, `${path}.${key}`);
  }
}

describe('Phase 8a: Recursive Secrets Scrubbing Across All Read Endpoints', () => {
  const roles = [Role.CAREGIVER, Role.FAMILY];

  const mockUsers = {
    [Role.CAREGIVER]: {
      id: 'user-caregiver-1',
      name: 'Caregiver Nina',
      email: 'nina@test.com',
      passwordHash: 'argon2_secret_hash_cg',
      totpSecret: 'totp_secret_key_cg',
    },
    [Role.FAMILY]: {
      id: 'user-family-1',
      name: 'Family Member Dev',
      email: 'dev@test.com',
      passwordHash: 'argon2_secret_hash_fam',
      totpSecret: 'totp_secret_key_fam',
    },
  };

  const mockProfile = {
    id: 'profile-alpha',
    ownerId: 'user-elder-owner',
    displayName: 'Dad Ashok',
    dateOfBirth: new Date('1948-05-15'),
    timezone: 'Asia/Kolkata',
    bloodType: 'B+',
    allergies: 'None',
    conditions: 'Mild Hypertension',
    emergencyCode: 'EMRG1234',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const testRole of roles) {
    describe(`Auditing API routes as role ${testRole}`, () => {
      beforeEach(() => {
        const callerUser = mockUsers[testRole];
        vi.mocked(getCurrentUser).mockResolvedValue(callerUser as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue(callerUser as any);

        vi.mocked(prisma.careProfile.findUnique).mockResolvedValue(mockProfile as any);

        vi.mocked(prisma.membership.findUnique).mockResolvedValue({
          id: `mem-${testRole.toLowerCase()}`,
          profileId: 'profile-alpha',
          userId: callerUser.id,
          role: testRole,
          status: 'ACTIVE',
          scopes: ['view_medications', 'view_notes', 'view_appointments'],
          passcodeHash: 'argon2_secret_passcode_hash',
          passcodeFailures: 0,
        } as any);

        vi.mocked(prisma.membership.findMany).mockResolvedValue([
          {
            id: `mem-${testRole.toLowerCase()}`,
            profileId: 'profile-alpha',
            userId: callerUser.id,
            role: testRole,
            status: 'ACTIVE',
            scopes: ['view_medications'],
            user: { id: callerUser.id, name: callerUser.name, email: callerUser.email },
            profile: mockProfile,
          },
        ] as any);

        vi.mocked(prisma.careNote.findMany).mockResolvedValue([
          {
            id: 'note-1',
            profileId: 'profile-alpha',
            body: 'Observed good appetite today.',
            isPrivate: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            authorMembership: {
              id: 'mem-author',
              role: Role.CAREGIVER,
              user: { id: 'user-author', name: 'Nurse Mira' },
            },
          },
        ] as any);

        vi.mocked(prisma.medication.findMany).mockResolvedValue([
          {
            id: 'med-1',
            profileId: 'profile-alpha',
            name: 'Amlodipine',
            strength: '5mg',
            form: 'Tablet',
            criticality: 'STANDARD',
            stockCount: 20,
            refillThreshold: 5,
            schedules: [],
          },
        ] as any);

        vi.mocked(prisma.appointment.findMany).mockResolvedValue([
          {
            id: 'appt-1',
            profileId: 'profile-alpha',
            title: 'Cardiology Checkup',
            doctorName: 'Dr. Sen',
            clinicName: 'Metro Hospital',
            startsAt: new Date(),
            travelMinutes: 30,
            isPrivate: false,
          },
        ] as any);

        vi.mocked(prisma.session.findMany).mockResolvedValue([
          {
            id: 'session-hashed-token-1234',
            userId: callerUser.id,
            ip: '198.51.100.1',
            userAgent: 'Mozilla/5.0 TestBrowser',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        ] as any);
      });

      it(`1. GET /api/profiles/[id] leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/profiles/profile-alpha');
        const res = await getProfileRoute(req, { params: Promise.resolve({ id: 'profile-alpha' }) });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });

      it(`2. GET /api/profiles/[id]/medications leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/profiles/profile-alpha/medications');
        const res = await getMedicationsRoute(req, { params: Promise.resolve({ id: 'profile-alpha' }) });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });

      it(`3. GET /api/profiles/[id]/care-notes leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/profiles/profile-alpha/care-notes');
        const res = await getCareNotesRoute(req, { params: Promise.resolve({ id: 'profile-alpha' }) });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });

      it(`4. GET /api/profiles/[id]/appointments leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/profiles/profile-alpha/appointments');
        const res = await getAppointmentsRoute(req, { params: Promise.resolve({ id: 'profile-alpha' }) });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });

      it(`5. GET /api/auth/me leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/auth/me');
        const res = await getMeRoute(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });

      it(`6. GET /api/auth/sessions leaks no secrets to ${testRole}`, async () => {
        const req = new NextRequest('http://localhost:3000/api/auth/sessions');
        const res = await getSessionsRoute(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        assertNoSecrets(json);
      });
    });
  }
});

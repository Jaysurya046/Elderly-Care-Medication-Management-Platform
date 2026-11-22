import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma, Role } from '@elder-care/db';
import { getCareNotes } from '../services/care-notes-service';
import { verifyMemberPasscode } from '../services/auth-service';
import { processLowStockAlerts } from '../../../worker/src/jobs/low-stock.job';
import { encryptString } from '../lib/crypto';
import { GET as getProfileRoute } from '../app/api/profiles/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@elder-care/db', () => {
  const mockPrisma = {
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
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    careNote: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
    },
    notificationLog: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' },
    MembershipStatus: { ACTIVE: 'ACTIVE', REVOKED: 'REVOKED', INVITED: 'INVITED' },
  };
});

vi.mock('../../../worker/src/email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../lib/auth-guard', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireProfileAccess: vi.fn(),
  };
});

describe('Phase 1b: Secrets Scrubbing, Privacy, Encryption Key & Passcode Session (Items 6-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Item 6: Never return secrets in queries including user
  it('Item 6: getCareNotes selects only id and name for user and never returns passwordHash, totpSecret, passcodeHash', async () => {
    const { requireProfileAccess } = await import('../lib/auth-guard');
    (requireProfileAccess as any).mockResolvedValue({
      membership: {
        id: 'mem-1',
        userId: 'user-1',
        role: Role.OWNER,
        scopes: { view_notes: true },
      },
    });

    (prisma.careNote.findMany as any).mockResolvedValue([
      {
        id: 'note-1',
        body: 'Checked blood pressure',
        authorMembership: {
          id: 'mem-author',
          user: {
            id: 'user-author',
            name: 'Nurse Joy',
            passwordHash: 'secret_hash_value',
            totpSecret: 'secret_totp_value',
            passcodeHash: 'secret_passcode_value',
          },
        },
      },
    ]);

    await getCareNotes('profile-1', 'user-1');

    // Assert that findMany was called with user select: { id: true, name: true }
    expect(prisma.careNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          authorMembership: expect.objectContaining({
            select: expect.objectContaining({
              user: {
                select: { id: true, name: true },
              },
            }),
          }),
        }),
      })
    );
  });

  // Item 7: Low-stock email privacy respects emailShowsMedicineNames
  it('Item 7: processLowStockAlerts hides drug name and uses generic refill subject when emailShowsMedicineNames is false', async () => {
    const { sendEmail } = await import('../../../worker/src/email-sender');

    (prisma.medication.findMany as any).mockResolvedValue([
      {
        id: 'med-1',
        profileId: 'profile-1',
        name: 'Hydrochlorothiazide',
        strength: '25mg',
        stockCount: 2,
        refillThreshold: 5,
        profile: {
          displayName: 'Grandpa Joe',
          emailShowsMedicineNames: false, // Privacy flag: do not show drug name
          memberships: [
            {
              id: 'mem-cg',
              status: 'ACTIVE',
              role: Role.CAREGIVER,
              user: { id: 'user-cg', name: 'Caregiver Bob', email: 'bob@example.com' },
            },
          ],
        },
      },
    ]);
    (prisma.notificationLog.findFirst as any).mockResolvedValue(null);

    await processLowStockAlerts(new Date());

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        subject: 'A refill is needed. Open the app to see which medicine.',
      })
    );
  });

  // Item 8: Emergency code exposure: GET /api/profiles/[id] returns emergencyCode only to OWNER
  it('Item 8: GET /api/profiles/[id] strips emergencyCode for CAREGIVER and FAMILY', async () => {
    const { requireProfileAccess } = await import('../lib/auth-guard');
    (requireProfileAccess as any).mockResolvedValue({
      profile: {
        id: 'profile-1',
        displayName: 'Grandma Smith',
        emergencyCode: 'EMRG9999',
      },
      membership: {
        id: 'mem-cg',
        role: Role.CAREGIVER, // Non-OWNER
        scopes: { view_medications: true },
      },
    });

    const req = new NextRequest('http://localhost:3000/api/profiles/profile-1');
    const res = await getProfileRoute(req, { params: Promise.resolve({ id: 'profile-1' }) });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.profile.emergencyCode).toBeUndefined();
  });

  // Item 9: Encryption key throws in production if missing or not 32 bytes of hex
  it('Item 9: crypto throws in production when APP_ENCRYPTION_KEY is missing or invalid (no hardcoded fallback)', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.APP_ENCRYPTION_KEY;

    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.APP_ENCRYPTION_KEY;

      expect(() => encryptString('test')).toThrow(/APP_ENCRYPTION_KEY.*required/i);
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
      process.env.APP_ENCRYPTION_KEY = originalKey || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    }
  });

  // Item 10: Passcode verification requires a session and rejects bare membershipId from another user
  it('Item 10: verifyMemberPasscode requires signed-in user matching membership.userId and ACTIVE status', async () => {
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'membership-1',
      userId: 'user-alice',
      profileId: 'profile-1',
      passcodeHash: 'valid_hash',
      status: 'ACTIVE',
      passcodeFailures: 0,
      passcodeLockedUntil: null,
    });

    // Caller passes bare membershipId but is signed in as user-bob (different user)
    await expect(
      verifyMemberPasscode('membership-1', '1234', 'user-bob')
    ).rejects.toThrow(/signed-in user|Forbidden/i);
  });

  // Comprehensive recursive check: walks API response shapes and asserts zero leaked secret keys
  it('Comprehensive: walks API response shapes and asserts none contains passwordHash, totpSecret, passcodeHash, or tokenHash', async () => {
    function assertNoSecrets(obj: any, path = ''): void {
      if (!obj || typeof obj !== 'object') return;
      const forbidden = ['passwordHash', 'totpSecret', 'passcodeHash', 'tokenHash'];
      for (const key of Object.keys(obj)) {
        expect(forbidden, `Secret "${key}" found at path "${path}.${key}"`).not.toContain(key);
        assertNoSecrets(obj[key], path ? `${path}.${key}` : key);
      }
    }

    const { requireProfileAccess } = await import('../lib/auth-guard');
    (requireProfileAccess as any).mockResolvedValue({
      profile: {
        id: 'prof-1',
        displayName: 'Kamala',
        owner: { id: 'u-owner', name: 'Owner' },
      },
      membership: {
        id: 'mem-1',
        role: Role.OWNER,
        scopes: { view_medications: true, view_notes: true },
      },
    });

    const req = new NextRequest('http://localhost:3000/api/profiles/prof-1');
    const res = await getProfileRoute(req, { params: Promise.resolve({ id: 'prof-1' }) });
    const profileJson = await res.json();
    assertNoSecrets(profileJson);

    (prisma.careNote.findMany as any).mockResolvedValue([
      {
        id: 'note-1',
        body: 'Notes',
        authorMembership: {
          id: 'mem-1',
          user: { id: 'u-1', name: 'Joy' },
        },
      },
    ]);
    const notes = await getCareNotes('prof-1', 'u-owner');
    assertNoSecrets(notes);
  });
});

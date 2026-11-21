import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireProfileAccess, ForbiddenError, UnauthorizedError } from '../lib/auth-guard';
import { prisma, Role, MembershipStatus } from '@elder-care/db';
import {
  acceptCareCircleInvitation,
  createCareCircleInvitation,
} from '../services/care-circle-service';
import { verifyMemberPasscode } from '../services/auth-service';
import { hashSecret } from '../lib/crypto';

vi.mock('@elder-care/db', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    invitation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  return { prisma: mockPrisma, Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' }, MembershipStatus: { ACTIVE: 'ACTIVE', REVOKED: 'REVOKED', INVITED: 'INVITED' } };
});

describe('Phase 2: Auth, Access Guard, Invitations & Passcodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireProfileAccess Guard', () => {
    it('throws UnauthorizedError if user is not authenticated', async () => {
      await expect(
        requireProfileAccess('prof-1', { userIdOverride: undefined })
      ).rejects.toThrow(UnauthorizedError);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'HEALTH_DATA:READ',
            metadata: { reason: 'UNAUTHENTICATED_ACCESS_ATTEMPT' },
          }),
        })
      );
    });

    it('throws ForbiddenError immediately if membership status is REVOKED (instant revocation)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-caregiver', email: 'rajesh@demo.com' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1', displayName: 'Kamala Devi' });
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        profileId: 'prof-1',
        userId: 'user-caregiver',
        role: 'CAREGIVER',
        status: 'REVOKED',
        scopes: { view_medications: true },
      });

      await expect(
        requireProfileAccess('prof-1', { userIdOverride: 'user-caregiver' })
      ).rejects.toThrow(ForbiddenError);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'HEALTH_DATA:READ',
            metadata: expect.objectContaining({
              reason: 'INACTIVE_OR_REVOKED_MEMBERSHIP',
              status: 'REVOKED',
            }),
          }),
        })
      );
    });

    it('enforces scope restrictions: blocks user without manage_medications', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-family', email: 'family@demo.com' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-2',
        profileId: 'prof-1',
        userId: 'user-family',
        role: 'FAMILY',
        status: 'ACTIVE',
        scopes: { view_medications: true, manage_medications: false },
      });

      await expect(
        requireProfileAccess('prof-1', {
          userIdOverride: 'user-family',
          scope: 'manage_medications',
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('blocks access to private items unless membership has view_private_items', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-caregiver', email: 'caregiver@demo.com' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-3',
        profileId: 'prof-1',
        userId: 'user-caregiver',
        role: 'CAREGIVER',
        status: 'ACTIVE',
        scopes: { view_appointments: true, view_private_items: false },
      });

      await expect(
        requireProfileAccess('prof-1', {
          userIdOverride: 'user-caregiver',
          scope: 'view_appointments',
          isPrivateItem: true,
        })
      ).rejects.toThrow('This item is marked private');
    });

    it('allows OWNER full access regardless of individual scope flags', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-owner', email: 'kamala@demo.com' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1', ownerId: 'user-owner' });
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: 'OWNER',
        status: 'ACTIVE',
        scopes: {},
      });

      const result = await requireProfileAccess('prof-1', {
        userIdOverride: 'user-owner',
        scope: 'manage_medications',
        isPrivateItem: true,
      });

      expect(result.user.id).toBe('user-owner');
      expect(result.membership.role).toBe('OWNER');
    });
  });

  describe('Passcode Lockout & Verification', () => {
    it('locks passcode after 5 consecutive failures for 15 minutes', async () => {
      const passcodeHash = await hashSecret('1234');
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        profileId: 'prof-1',
        userId: 'user-1',
        passcodeHash,
        passcodeFailures: 4, // 5th failure incoming
        passcodeLockedUntil: null,
      });

      const result = await verifyMemberPasscode('mem-1', '9999'); // wrong PIN

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked due to 5 consecutive failures');
      expect(prisma.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passcodeFailures: 5,
            passcodeLockedUntil: expect.any(Date),
          }),
        })
      );
    });

    it('resets failure count to 0 upon successful passcode verification', async () => {
      const passcodeHash = await hashSecret('1234');
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        profileId: 'prof-1',
        userId: 'user-1',
        passcodeHash,
        passcodeFailures: 3,
        passcodeLockedUntil: null,
      });

      const result = await verifyMemberPasscode('mem-1', '1234'); // correct PIN

      expect(result.success).toBe(true);
      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
        data: {
          passcodeFailures: 0,
          passcodeLockedUntil: null,
        },
      });
    });
  });

  describe('Invitation Flow', () => {
    it('rejects invitation acceptance if token has expired', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u-1', email: 'invited@demo.com' });
      (prisma.invitation.findUnique as any).mockResolvedValue({
        id: 'inv-1',
        email: 'invited@demo.com',
        expiresAt: new Date(Date.now() - 1000), // Expired!
        usedAt: null,
      });

      await expect(
        acceptCareCircleInvitation('some-token', 'u-1')
      ).rejects.toThrow('This invitation has expired.');
    });

    it('rejects invitation acceptance if user email does not match invited email', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u-other', email: 'intruder@demo.com' });
      (prisma.invitation.findUnique as any).mockResolvedValue({
        id: 'inv-1',
        email: 'genuine.caregiver@demo.com',
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
      });

      await expect(
        acceptCareCircleInvitation('some-token', 'u-other')
      ).rejects.toThrow('This invitation was issued to genuine.caregiver@demo.com');
    });

    it('rejects invitation acceptance if token was already used', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u-1', email: 'invited@demo.com' });
      (prisma.invitation.findUnique as any).mockResolvedValue({
        id: 'inv-1',
        email: 'invited@demo.com',
        expiresAt: new Date(Date.now() + 100000),
        usedAt: new Date(), // Already used!
      });

      await expect(
        acceptCareCircleInvitation('some-token', 'u-1')
      ).rejects.toThrow('This invitation has already been used.');
    });
  });
});

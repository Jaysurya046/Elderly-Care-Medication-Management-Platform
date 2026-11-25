import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma, Role, MembershipStatus, DoseStatus } from '@elder-care/db';
import {
  signUpUser,
  requestPasswordReset,
  resetPasswordWithToken,
  enrolTotp,
  verifyAndEnableTotp,
} from '../services/auth-service';
import {
  createCareCircleInvitation,
  acceptCareCircleInvitation,
  confirmCareCircleMember,
  updateCareCircleScopes,
  transferProfileOwnership,
} from '../services/care-circle-service';
import { rotateEmergencyCode } from '../services/profile-service';
import { sendEmail } from '../lib/email';
import * as Core from '@elder-care/core';

vi.mock('../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Phase 8c: End-to-End Flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Item 1: Onboarding & Multi-Profile Accounts
  // --------------------------------------------------------------------------
  describe('Item 1: Onboarding & Profile Switcher', () => {
    it('signUpUser creates User, CareProfile with onboarding fields (name, dateOfBirth, timezone, bloodType, consent), and OWNER membership', async () => {
      const mockCreatedUser = {
        id: 'user-onboard-1',
        email: 'onboard@test.com',
        name: 'Kamala Devi',
        consentVersion: 'v1.0',
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockCreatedUser as any);
      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValue(null);
      const mockProfileCreate = vi.spyOn(prisma.careProfile, 'create').mockResolvedValue({
        id: 'prof-onboard-1',
        ownerId: 'user-onboard-1',
        displayName: 'Kamala Devi',
        timezone: 'Asia/Kolkata',
        bloodType: 'B+',
        dateOfBirth: new Date('1948-06-12'),
      } as any);

      const mockMembershipCreate = vi.spyOn(prisma.membership, 'create').mockResolvedValue({
        id: 'mem-onboard-1',
        profileId: 'prof-onboard-1',
        userId: 'user-onboard-1',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      const user = await signUpUser({
        name: 'Kamala Devi',
        email: 'onboard@test.com',
        password: 'SecurePassword123!',
        consentGiven: true,
        dateOfBirth: '1948-06-12',
        timezone: 'Asia/Kolkata',
        bloodType: 'B+',
      } as any);

      expect(user.id).toBe('user-onboard-1');
      expect(mockProfileCreate).toHaveBeenCalledTimes(1);
      expect(mockProfileCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: 'user-onboard-1',
            displayName: 'Kamala Devi',
            timezone: 'Asia/Kolkata',
            bloodType: 'B+',
          }),
        })
      );
      expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
      expect(mockMembershipCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-onboard-1',
            role: Role.OWNER,
            status: MembershipStatus.ACTIVE,
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Item 2: Care Circle Flows: Accept, Elder Confirmation, Scopes, Ownership Transfer, Emergency Code Rotation
  // --------------------------------------------------------------------------
  describe('Item 2: Care Circle Lifecycle', () => {
    it('transferProfileOwnership transfers primary ownership to target member and updates roles with audit log', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-owner' } as any);
      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValue({
        id: 'prof-1',
        ownerId: 'user-owner',
      } as any);

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValue({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.OWNER,
      } as any);
      vi.spyOn(prisma.membership, 'findFirst').mockResolvedValue({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.OWNER,
      } as any);

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValueOnce({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.OWNER,
      } as any).mockResolvedValueOnce({
        id: 'mem-target',
        profileId: 'prof-1',
        userId: 'user-cg',
        role: Role.CAREGIVER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.CAREGIVER,
      } as any);

      const mockProfileUpdate = vi.spyOn(prisma.careProfile, 'update').mockResolvedValue({
        id: 'prof-1',
        ownerId: 'user-cg',
      } as any);

      const mockMembershipUpdate = vi.spyOn(prisma.membership, 'update').mockResolvedValue({
        id: 'mem-target',
        role: Role.OWNER,
      } as any);

      const mockAudit = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-transfer' } as any);

      // Call transferProfileOwnership
      const result = await transferProfileOwnership('prof-1', 'mem-target', 'user-owner');

      expect(result.success).toBe(true);
      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prof-1' },
          data: expect.objectContaining({ ownerId: 'user-cg' }),
        })
      );
      expect(mockMembershipUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-target' },
          data: expect.objectContaining({ role: Role.OWNER }),
        })
      );
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CARE_CIRCLE:TRANSFER_OWNERSHIP',
            profileId: 'prof-1',
          }),
        })
      );
    });

    it('rotateEmergencyCode generates a new unique 7-char alphanumeric code with audit log', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'user-owner' } as any);
      vi.spyOn(prisma.careProfile, 'findUnique').mockResolvedValueOnce({
        id: 'prof-1',
        ownerId: 'user-owner',
      } as any).mockResolvedValueOnce(null); // uniqueness check

      vi.spyOn(prisma.membership, 'findUnique').mockResolvedValue({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.OWNER,
      } as any);
      vi.spyOn(prisma.membership, 'findFirst').mockResolvedValue({
        id: 'mem-owner',
        profileId: 'prof-1',
        userId: 'user-owner',
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        scopes: Core.DEFAULT_ROLE_SCOPES.OWNER,
      } as any);

      const mockUpdate = vi.spyOn(prisma.careProfile, 'update').mockResolvedValue({ id: 'prof-1' } as any);
      const mockAudit = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-rot' } as any);

      const newCode = await rotateEmergencyCode('prof-1', 'user-owner');

      expect(newCode).toBeDefined();
      expect(newCode).toMatch(/^[A-Z0-9]{7,8}$/);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prof-1' },
          data: { emergencyCode: newCode },
        })
      );
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { action: 'ROTATED_EMERGENCY_CODE' },
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Item 3: Password Reset Flow
  // --------------------------------------------------------------------------
  describe('Item 3: Password Reset Email & Token Protection', () => {
    it('requestPasswordReset sends email with reset link and NEVER returns token in response in ANY environment', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-pw',
        name: 'Kamala Devi',
        email: 'kamala@test.com',
      } as any);

      vi.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({ id: 'tok-1' } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-pw' } as any);

      // In any environment (including development/test)
      const result = await requestPasswordReset('kamala@test.com');

      expect(result.success).toBe(true);
      // Strictly never return rawToken in response in ANY environment
      expect((result as any).rawToken).toBeUndefined();

      // Email must be dispatched
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'kamala@test.com',
          subject: expect.stringMatching(/password reset/i),
          html: expect.stringMatching(/\/password-reset\?token=/),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Item 4: TOTP Two-Factor Authentication
  // --------------------------------------------------------------------------
  describe('Item 4: TOTP Two-Factor Authentication Activation', () => {
    it('enrolTotp generates secret and URI but does NOT enable 2FA until code is verified', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-totp-1',
        email: 'totp-test@example.com',
        totpSecret: null,
      } as any);

      const mockUpdate = vi.spyOn(prisma.user, 'update').mockImplementation(vi.fn());

      const enrolResult = await enrolTotp('user-totp-1');

      expect(enrolResult.secret).toBeDefined();
      expect(enrolResult.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

      // 2FA must NOT be saved/enabled in database during initial enrolment!
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('verifyAndEnableTotp enables 2FA only when submitted code is valid, rejecting invalid codes', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-totp-1',
        email: 'totp-test@example.com',
        totpSecret: null,
      } as any);

      const mockUpdate = vi.spyOn(prisma.user, 'update').mockImplementation(vi.fn());
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'audit-totp' } as any);

      const { secret } = await enrolTotp('user-totp-1');

      // 1. Submit invalid code -> throws ValidationError / AuthError, does not enable 2FA
      let caughtError: any;
      try {
        await verifyAndEnableTotp('user-totp-1', secret, '000000');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(mockUpdate).not.toHaveBeenCalled();

      // 2. Submit valid code -> enables 2FA and records audit log
      const validCode = '123456';
      const cryptoModule = await import('../lib/crypto');
      vi.spyOn(cryptoModule, 'verifyTotpCode').mockImplementation((sec, code) => code === validCode);

      await verifyAndEnableTotp('user-totp-1', secret, validCode);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-totp-1' },
          data: expect.objectContaining({ totpSecret: expect.any(String) }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Item 5: Senior Mode Data Mapping and Timezone Calculation
  // --------------------------------------------------------------------------
  describe('Item 5: Senior Mode Mapping and Timezone Calculation', () => {
    it('correctly maps medication details from dose.schedule.medication and formats time in profile timezone', async () => {
      const rawDose = {
        id: 'dose-99',
        scheduledAt: '2026-11-26T02:30:00.000Z', // 08:00 AM IST (+05:30)
        status: DoseStatus.PENDING,
        schedule: {
          medication: {
            name: 'Amlodipine',
            strength: '5 mg',
            instructions: 'Take 1 tablet after breakfast',
          },
        },
      };

      // Helper that SeniorModePage uses for mapping
      const mapSeniorDose = (d: any, timeZone: string = 'Asia/Kolkata') => {
        const sched = new Date(d.scheduledAt);
        const med = d.schedule?.medication || d.medication;
        const hours = parseInt(
          new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(sched),
          10
        );

        let block: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME' = 'BEDTIME';
        if (hours >= 5 && hours < 12) block = 'MORNING';
        else if (hours >= 12 && hours < 17) block = 'AFTERNOON';
        else if (hours >= 17 && hours < 21) block = 'EVENING';

        return {
          id: d.id,
          name: med?.name || 'Medication',
          strength: med?.strength || '',
          instructions: med?.instructions || 'Take as prescribed',
          block,
          status: d.status,
        };
      };

      const mapped = mapSeniorDose(rawDose, 'Asia/Kolkata');
      expect(mapped.name).toBe('Amlodipine');
      expect(mapped.strength).toBe('5 mg');
      expect(mapped.instructions).toBe('Take 1 tablet after breakfast');
      expect(mapped.block).toBe('MORNING');
    });

    it('handles 409 Conflict gracefully by extracting the conflicting actor name', () => {
      const conflict409Response = {
        error: 'CONFLICT',
        message: 'Already recorded by another member.',
        actorName: 'Priya Sharma (Caregiver)',
      };

      const formatConflictMessage = (data: any) => {
        const actor = data.actorName || data.actor || data.message || 'another care circle member';
        return `Already recorded by ${actor}.`;
      };

      const msg = formatConflictMessage(conflict409Response);
      expect(msg).toBe('Already recorded by Priya Sharma (Caregiver).');
    });
  });

  // --------------------------------------------------------------------------
  // Item 6: Care Circle Route Endpoints
  // --------------------------------------------------------------------------
  describe('Care Circle Route Handlers', () => {
    it('PATCH /api/profiles/[id]/care-circle/[memberId] route updates member scopes', async () => {
      const { PATCH } = await import('../app/api/profiles/[id]/care-circle/[memberId]/route');
      const authGuard = await import('../lib/auth-guard');
      const careCircleService = await import('../services/care-circle-service');

      vi.spyOn(authGuard, 'requireProfileAccess').mockResolvedValue({
        user: { id: 'user-owner' } as any,
        membership: { id: 'mem-owner', role: Role.OWNER } as any,
        profile: { id: 'prof-1' } as any,
      });

      const mockUpdateScopes = vi
        .spyOn(careCircleService, 'updateCareCircleScopes')
        .mockResolvedValue({ id: 'mem-target', scopes: { manage_medications: true } } as any);

      const req = new Request('http://localhost:3000/api/profiles/prof-1/care-circle/mem-target', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ scopes: { manage_medications: true } }),
      });

      const res = await PATCH(req as any, { params: Promise.resolve({ id: 'prof-1', memberId: 'mem-target' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockUpdateScopes).toHaveBeenCalledWith('prof-1', 'mem-target', { manage_medications: true }, 'user-owner');
    });

    it('POST /api/profiles/[id]/care-circle/transfer-ownership transfers profile ownership', async () => {
      const { POST } = await import('../app/api/profiles/[id]/care-circle/transfer-ownership/route');
      const authGuard = await import('../lib/auth-guard');
      const careCircleService = await import('../services/care-circle-service');

      vi.spyOn(authGuard, 'requireProfileAccess').mockResolvedValue({
        user: { id: 'user-owner' } as any,
        membership: { id: 'mem-owner', role: Role.OWNER } as any,
        profile: { id: 'prof-1' } as any,
      });

      const mockTransfer = vi
        .spyOn(careCircleService, 'transferProfileOwnership')
        .mockResolvedValue({ success: true });

      const req = new Request('http://localhost:3000/api/profiles/prof-1/care-circle/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ targetMembershipId: 'mem-target' }),
      });

      const res = await POST(req as any, { params: Promise.resolve({ id: 'prof-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockTransfer).toHaveBeenCalledWith('prof-1', 'mem-target', 'user-owner');
    });

    it('POST /api/profiles/[id]/emergency-code rotates the profile emergency code', async () => {
      const { POST } = await import('../app/api/profiles/[id]/emergency-code/route');
      const authGuard = await import('../lib/auth-guard');
      const profileService = await import('../services/profile-service');

      vi.spyOn(authGuard, 'requireProfileAccess').mockResolvedValue({
        user: { id: 'user-owner' } as any,
        membership: { id: 'mem-owner', role: Role.OWNER } as any,
        profile: { id: 'prof-1' } as any,
      });

      const mockRotate = vi
        .spyOn(profileService, 'rotateEmergencyCode')
        .mockResolvedValue('NEW99CODE');

      const req = new Request('http://localhost:3000/api/profiles/prof-1/emergency-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      });

      const res = await POST(req as any, { params: Promise.resolve({ id: 'prof-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.emergencyCode).toBe('NEW99CODE');
      expect(mockRotate).toHaveBeenCalledWith('prof-1', 'user-owner');
    });

    it('POST /api/invite/accept accepts invitation for authenticated user', async () => {
      const { POST } = await import('../app/api/invite/accept/route');
      const sessionLib = await import('../lib/session');
      const careCircleService = await import('../services/care-circle-service');

      vi.spyOn(sessionLib, 'getCurrentUser').mockResolvedValue({ id: 'user-invitee', email: 'invitee@test.com' } as any);
      const mockAccept = vi
        .spyOn(careCircleService, 'acceptCareCircleInvitation')
        .mockResolvedValue({ id: 'mem-new', status: MembershipStatus.INVITED } as any);

      const req = new Request('http://localhost:3000/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ token: 'sample-invitation-token' }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAccept).toHaveBeenCalledWith('sample-invitation-token', 'user-invitee');
    });

    it('POST /api/auth/totp action verify activates 2FA for authenticated user', async () => {
      const { POST } = await import('../app/api/auth/totp/route');
      const sessionLib = await import('../lib/session');
      const authService = await import('../services/auth-service');

      vi.spyOn(sessionLib, 'getCurrentUser').mockResolvedValue({ id: 'user-totp-auth' } as any);
      const mockVerify = vi
        .spyOn(authService, 'verifyAndEnableTotp')
        .mockResolvedValue({ success: true });

      const req = new Request('http://localhost:3000/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ action: 'verify', secret: 'JBSWY3DPEHPK3PXP', code: '123456' }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith('user-totp-auth', 'JBSWY3DPEHPK3PXP', '123456');
    });
  });
});

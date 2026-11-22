import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock DB
vi.mock('@elder-care/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'prof-123',
        displayName: 'Kamala',
        timezone: 'Asia/Kolkata',
      }),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    invitation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    medication: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    appointment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    careNote: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    doseEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEventAction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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
  DoseStatus: {
    PENDING: 'PENDING',
    TAKEN: 'TAKEN',
    LATE_TAKEN: 'LATE_TAKEN',
    SKIPPED: 'SKIPPED',
    MISSED: 'MISSED',
    SNOOZED: 'SNOOZED',
  },
  MedicationCriticality: {
    STANDARD: 'STANDARD',
    CRITICAL: 'CRITICAL',
  },
  AppointmentStatus: {
    SCHEDULED: 'SCHEDULED',
    COMPLETED: 'COMPLETED',
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentSessionId: vi.fn(),
  validateSession: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  SESSION_COOKIE_NAME: 'elder_care_session',
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  extractClientDetails: vi.fn().mockReturnValue({ ip: '127.0.0.1', userAgent: 'test-agent' }),
}));

vi.mock('@/services/care-circle-service', () => ({
  createCareCircleInvitation: vi.fn(),
  confirmCareCircleMember: vi.fn(),
  revokeCareCircleMembership: vi.fn(),
}));

vi.mock('@/services/medication-service', () => ({
  updateMedication: vi.fn(),
  deleteMedication: vi.fn(),
  getProfileDoses: vi.fn(),
  recordDoseAction: vi.fn(),
}));

vi.mock('@/services/appointment-service', () => ({
  createAppointment: vi.fn(),
  getAppointments: vi.fn(),
}));

vi.mock('@/services/care-notes-service', () => ({
  createCareNote: vi.fn(),
  getCareNotes: vi.fn(),
  getActivityFeed: vi.fn(),
}));

import { getCurrentUser } from '@/lib/session';
import { prisma, Role, MembershipStatus } from '@elder-care/db';
import {
  createCareCircleInvitation,
  confirmCareCircleMember,
  revokeCareCircleMembership,
} from '@/services/care-circle-service';
import {
  updateMedication,
  deleteMedication,
  getProfileDoses,
  recordDoseAction,
} from '@/services/medication-service';
import { createAppointment, getAppointments } from '@/services/appointment-service';
import { createCareNote, getCareNotes, getActivityFeed } from '@/services/care-notes-service';

// Top-level imports for all Phase 3 route handlers
import { POST as invitePost } from '@/app/api/profiles/[id]/care-circle/invite/route';
import { POST as confirmPost } from '@/app/api/profiles/[id]/care-circle/confirm/route';
import { DELETE as memberDelete } from '@/app/api/profiles/[id]/care-circle/[memberId]/route';
import { PATCH as medPatch, DELETE as medDelete } from '@/app/api/profiles/[id]/medications/[medId]/route';
import { POST as apptPost, GET as apptGet } from '@/app/api/profiles/[id]/appointments/route';
import { POST as notePost, GET as noteGet } from '@/app/api/profiles/[id]/care-notes/route';
import { GET as doseGet } from '@/app/api/profiles/[id]/doses/route';
import { POST as correctionPost } from '@/app/api/profiles/[id]/doses/[doseId]/correction/route';
import { GET as activityGet } from '@/app/api/profiles/[id]/activity/route';

function createMockRequest(url: string, options: { method?: string; body?: any; origin?: string; host?: string } = {}) {
  const headers = new Headers();
  headers.set('host', options.host || 'localhost:3000');
  if (options.origin) {
    headers.set('origin', options.origin);
  } else {
    headers.set('origin', 'http://localhost:3000');
  }
  if (options.body) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('Phase 3: Complete API Surface Integration Tests', () => {
  const profileId = 'prof-123';
  const ownerUser = { id: 'user-owner', name: 'Owner User', email: 'owner@example.com' };
  const ownerMembership = {
    id: 'mem-owner',
    profileId,
    userId: ownerUser.id,
    role: Role.OWNER,
    status: MembershipStatus.ACTIVE,
    scopes: { manage_circle: true, manage_medications: true, view_medications: true, view_notes: true, write_notes: true, manage_appointments: true, view_appointments: true },
  };

  const familyUser = { id: 'user-family', name: 'Family User', email: 'family@example.com' };
  const familyMembership = {
    id: 'mem-family',
    profileId,
    userId: familyUser.id,
    role: Role.FAMILY,
    status: MembershipStatus.ACTIVE,
    scopes: { view_medications: true, view_notes: true, view_appointments: true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Care Circle Invite (POST /api/profiles/[id]/care-circle/invite)', () => {
    it('returns 401 when caller is unauthenticated', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/invite`, {
        method: 'POST',
        body: { email: 'new@example.com', role: 'CAREGIVER' },
      });
      const res = await invitePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(401);
    });

    it('returns 403 when caller is not an OWNER', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/invite`, {
        method: 'POST',
        body: { email: 'new@example.com', role: 'CAREGIVER' },
      });
      const res = await invitePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(403);
    });

    it('returns 400 when body fails Zod validation (e.g. invalid role or email)', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/invite`, {
        method: 'POST',
        body: { email: 'invalid-email', role: 'INVALID_ROLE' },
      });
      const res = await invitePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errors).toBeDefined();
    });

    it('returns 201 on happy path and creates invitation', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(createCareCircleInvitation).mockResolvedValue({
        invitation: { id: 'inv-1', email: 'new@example.com', role: Role.CAREGIVER } as any,
        rawToken: 'token-xyz',
      });
      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/invite`, {
        method: 'POST',
        body: { email: 'new@example.com', role: 'CAREGIVER' },
      });
      const res = await invitePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('inv-1');
    });
  });

  describe('2. Care Circle Confirm (POST /api/profiles/[id]/care-circle/confirm)', () => {
    it('returns 403 when caller is not an OWNER', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/confirm`, {
        method: 'POST',
        body: { membershipId: 'mem-to-confirm' },
      });
      const res = await confirmPost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(403);
    });

    it('returns 200 on happy path when OWNER confirms member', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(confirmCareCircleMember).mockResolvedValue({
        id: 'mem-to-confirm',
        status: MembershipStatus.ACTIVE,
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/confirm`, {
        method: 'POST',
        body: { membershipId: 'mem-to-confirm' },
      });
      const res = await confirmPost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe(MembershipStatus.ACTIVE);
    });
  });

  describe('3. Care Circle Remove Member (DELETE /api/profiles/[id]/care-circle/[memberId])', () => {
    it('returns 204 on successfully removing member', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(revokeCareCircleMembership).mockResolvedValue({ id: 'mem-to-remove' } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/care-circle/mem-to-remove`, {
        method: 'DELETE',
      });
      const res = await memberDelete(req, {
        params: Promise.resolve({ id: profileId, memberId: 'mem-to-remove' }),
      });
      expect(res.status).toBe(204);
    });
  });

  describe('4. Medication Update & Soft Delete (/api/profiles/[id]/medications/[medId])', () => {
    const medId = 'med-456';

    it('PATCH returns 403 when caller lacks manage_medications', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);

      const req = createMockRequest(`/api/profiles/${profileId}/medications/${medId}`, {
        method: 'PATCH',
        body: { stockCount: 20 },
      });
      const res = await medPatch(req, { params: Promise.resolve({ id: profileId, medId }) });
      expect(res.status).toBe(403);
    });

    it('PATCH returns 200 on happy path update', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(updateMedication).mockResolvedValue({
        id: medId,
        stockCount: 25,
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/medications/${medId}`, {
        method: 'PATCH',
        body: { stockCount: 25 },
      });
      const res = await medPatch(req, { params: Promise.resolve({ id: profileId, medId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.stockCount).toBe(25);
    });

    it('DELETE returns 204 on happy path soft-delete', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(deleteMedication).mockResolvedValue({
        id: medId,
        isActive: false,
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/medications/${medId}`, {
        method: 'DELETE',
      });
      const res = await medDelete(req, { params: Promise.resolve({ id: profileId, medId }) });
      expect(res.status).toBe(204);
    });
  });

  describe('5. Appointments (POST & GET /api/profiles/[id]/appointments)', () => {
    it('POST returns 400 when missing required title or scheduledAt', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);

      const req = createMockRequest(`/api/profiles/${profileId}/appointments`, {
        method: 'POST',
        body: { doctorName: 'Dr. Rao' }, // missing title and scheduledAt
      });
      const res = await apptPost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(400);
    });

    it('POST returns 201 on valid appointment creation', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(createAppointment).mockResolvedValue({
        id: 'apt-1',
        title: 'Cardiology Checkup',
        doctorName: 'Dr. Rao',
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/appointments`, {
        method: 'POST',
        body: {
          title: 'Cardiology Checkup',
          doctorName: 'Dr. Rao',
          scheduledAt: '2026-12-01T10:00:00Z',
        },
      });
      const res = await apptPost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.id).toBe('apt-1');
    });

    it('GET returns 200 with appointment list', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      vi.mocked(getAppointments).mockResolvedValue([
        { id: 'apt-1', title: 'Cardiology Checkup' } as any,
      ]);

      const req = createMockRequest(`/api/profiles/${profileId}/appointments`);
      const res = await apptGet(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
    });
  });

  describe('6. Care Notes (POST & GET /api/profiles/[id]/care-notes)', () => {
    it('POST returns 400 when body is empty', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);

      const req = createMockRequest(`/api/profiles/${profileId}/care-notes`, {
        method: 'POST',
        body: { body: '' },
      });
      const res = await notePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(400);
    });

    it('POST returns 201 on valid care note creation', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(createCareNote).mockResolvedValue({
        id: 'note-1',
        body: 'Blood pressure was 120/80 today.',
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/care-notes`, {
        method: 'POST',
        body: { body: 'Blood pressure was 120/80 today.', isPrivate: false },
      });
      const res = await notePost(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.id).toBe('note-1');
    });

    it('GET returns 200 with care notes', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      vi.mocked(getCareNotes).mockResolvedValue([
        { id: 'note-1', body: 'Blood pressure was 120/80 today.' } as any,
      ]);

      const req = createMockRequest(`/api/profiles/${profileId}/care-notes`);
      const res = await noteGet(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
    });
  });

  describe('7. Doses List (GET /api/profiles/[id]/doses)', () => {
    it('GET returns 200 with dose events in requested range', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      vi.mocked(getProfileDoses).mockResolvedValue([
        { id: 'dose-1', status: 'PENDING', scheduledAt: new Date() } as any,
      ]);

      const req = createMockRequest(`/api/profiles/${profileId}/doses?startDate=2026-11-20&endDate=2026-11-25`);
      const res = await doseGet(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
    });
  });

  describe('8. Dose Correction (POST /api/profiles/[id]/doses/[doseId]/correction)', () => {
    const doseId = 'dose-789';

    it('POST returns 400 when reason is missing', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);

      const req = createMockRequest(`/api/profiles/${profileId}/doses/${doseId}/correction`, {
        method: 'POST',
        body: { targetStatus: 'TAKEN' }, // missing reason
      });
      const res = await correctionPost(req, { params: Promise.resolve({ id: profileId, doseId }) });
      expect(res.status).toBe(400);
    });

    it('POST returns 200 on valid dose correction with reason', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(ownerUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(ownerMembership as any);
      vi.mocked(recordDoseAction).mockResolvedValue({
        id: doseId,
        status: 'TAKEN',
      } as any);

      const req = createMockRequest(`/api/profiles/${profileId}/doses/${doseId}/correction`, {
        method: 'POST',
        body: { targetStatus: 'TAKEN', reason: 'Kamala took the medication with breakfast, marked late.' },
      });
      const res = await correctionPost(req, { params: Promise.resolve({ id: profileId, doseId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('TAKEN');
    });
  });

  describe('9. Activity Feed (GET /api/profiles/[id]/activity)', () => {
    it('GET returns 200 with aggregated activity feed', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(familyUser as any);
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(familyMembership as any);
      vi.mocked(getActivityFeed).mockResolvedValue([
        { id: 'act-1', type: 'DOSE_ACTION', title: 'Metformin marked TAKEN' } as any,
      ]);

      const req = createMockRequest(`/api/profiles/${profileId}/activity`);
      const res = await activityGet(req, { params: Promise.resolve({ id: profileId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
    });
  });
});

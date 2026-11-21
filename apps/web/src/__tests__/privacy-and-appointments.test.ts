import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAppointments, getAppointmentPrepSummary } from '../services/appointment-service';
import { getCareNotes, getActivityFeed } from '../services/care-notes-service';
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
    appointment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    medication: {
      findMany: vi.fn(),
    },
    doseEvent: {
      findMany: vi.fn(),
    },
    doseEventAction: {
      findMany: vi.fn(),
    },
    careNote: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  return {
    prisma: mockPrisma,
    Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY' },
    MembershipStatus: { ACTIVE: 'ACTIVE' },
    AppointmentStatus: { SCHEDULED: 'SCHEDULED', COMPLETED: 'COMPLETED' },
  };
});

describe('Phase 5: Privacy, Appointments & Care Notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strictly hides private appointments when queried by a caregiver without view_private_items', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-caregiver' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-cg',
      profileId: 'prof-1',
      userId: 'user-caregiver',
      role: 'CAREGIVER',
      status: 'ACTIVE',
      scopes: { view_appointments: true, view_private_items: false },
    });

    (prisma.appointment.findMany as any).mockResolvedValue([
      { id: 'apt-public', title: 'Eye Checkup', isPrivate: false },
    ]);

    const result = await getAppointments('prof-1', 'user-caregiver');

    // Query must filter out private items at the database query level
    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        profileId: 'prof-1',
        isPrivate: false,
      },
      orderBy: { startsAt: 'asc' },
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('apt-public');
  });

  it('allows OWNER to see all appointments including private ones', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-owner' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-owner',
      profileId: 'prof-1',
      userId: 'user-owner',
      role: 'OWNER',
      status: 'ACTIVE',
      scopes: {},
    });

    (prisma.appointment.findMany as any).mockResolvedValue([
      { id: 'apt-public', title: 'Eye Checkup', isPrivate: false },
      { id: 'apt-private', title: 'Psychiatrist Consultation', isPrivate: true },
    ]);

    const result = await getAppointments('prof-1', 'user-owner');

    // OWNER query has no isPrivate filter
    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: { profileId: 'prof-1' },
      orderBy: { startsAt: 'asc' },
    });
    expect(result.length).toBe(2);
  });

  it('hides private care notes from non-permitted members in getCareNotes and activity feed', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-family' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-fam',
      profileId: 'prof-1',
      userId: 'user-family',
      role: 'FAMILY',
      status: 'ACTIVE',
      scopes: { view_notes: true, view_private_items: false },
    });

    (prisma.careNote.findMany as any).mockResolvedValue([
      { id: 'note-1', body: 'Had good breakfast', isPrivate: false, createdAt: new Date() },
    ]);
    (prisma.doseEventAction.findMany as any).mockResolvedValue([]);

    const notes = await getCareNotes('prof-1', 'user-family');
    expect(prisma.careNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: 'prof-1',
          isPrivate: false,
        }),
      })
    );
    expect(notes.length).toBe(1);

    const feed = await getActivityFeed('prof-1', 'user-family');
    expect(feed.some((f) => f.isPrivate)).toBe(false);
  });

  it('generates deterministic appointment prep summary with medicines, missed doses and questions', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-owner' });
    (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'prof-1' });
    (prisma.membership.findUnique as any).mockResolvedValue({
      id: 'mem-owner',
      profileId: 'prof-1',
      userId: 'user-owner',
      role: 'OWNER',
      status: 'ACTIVE',
      scopes: { view_appointments: true },
    });

    (prisma.appointment.findUnique as any).mockResolvedValue({
      id: 'apt-1',
      profileId: 'prof-1',
      title: 'Cardiology Review',
      doctorName: 'Dr. Kulkarni',
      questionsToAsk: '1. Reduce dosage?\n2. Knee swelling?',
      isPrivate: false,
    });

    (prisma.medication.findMany as any).mockResolvedValue([
      { name: 'Metformin', strength: '500mg', instructions: 'With food' },
    ]);
    (prisma.doseEvent.findMany as any).mockResolvedValue([
      { id: '1', scheduledAt: new Date(), status: 'TAKEN' },
      { id: '2', scheduledAt: new Date(), status: 'MISSED' },
    ]);
    (prisma.careNote.findMany as any).mockResolvedValue([]);

    const summary = await getAppointmentPrepSummary('prof-1', 'apt-1', 'user-owner');

    expect(summary.activeMedications.length).toBe(1);
    expect(summary.recentMissedDosesCount).toBe(1);
    expect(summary.adherencePercentage).toBe(50);
    expect(summary.questionsToAsk).toEqual(['1. Reduce dosage?', '2. Knee swelling?']);
  });
});

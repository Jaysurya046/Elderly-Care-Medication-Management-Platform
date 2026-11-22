import { prisma, Appointment, AppointmentStatus, Role } from '@elder-care/db';
import { requireProfileAccess } from '../lib/auth-guard';
import { recordAuditLog } from '../lib/audit';
import { calculateAdherence, DoseRecord } from '@elder-care/core';

export interface CreateAppointmentInput {
  title: string;
  doctorName: string;
  specialty?: string;
  clinicName?: string;
  address?: string;
  startsAt: Date | string;
  travelMinutes?: number;
  isPrivate?: boolean;
  notes?: string;
  questionsToAsk?: string;
  reminderOffsetsMinutes?: number[];
}

export async function createAppointment(
  profileId: string,
  input: CreateAppointmentInput,
  actorUserId?: string
): Promise<Appointment> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'manage_appointments',
    userIdOverride: actorUserId,
  });

  const startsAt = typeof input.startsAt === 'string' ? new Date(input.startsAt) : input.startsAt;

  const appointment = await prisma.appointment.create({
    data: {
      profileId,
      title: input.title.trim(),
      doctorName: input.doctorName.trim(),
      specialty: input.specialty?.trim() || null,
      clinicName: input.clinicName?.trim() || null,
      address: input.address?.trim() || null,
      startsAt,
      travelMinutes: input.travelMinutes ?? 0,
      status: AppointmentStatus.SCHEDULED,
      isPrivate: input.isPrivate ?? false,
      notes: input.notes?.trim() || null,
      questionsToAsk: input.questionsToAsk?.trim() || null,
      reminderOffsetsMinutes: input.reminderOffsetsMinutes || [10080, 1440, 120],
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'APPOINTMENT:CREATE',
    entityType: 'Appointment',
    entityId: appointment.id,
    metadata: { isPrivate: appointment.isPrivate, startsAt: startsAt.toISOString() },
  });

  return appointment;
}

export async function getAppointments(
  profileId: string,
  actorUserId?: string
): Promise<Appointment[]> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_appointments',
    userIdOverride: actorUserId,
  });

  const scopes = (membership.scopes || {}) as Record<string, boolean>;
  const canViewPrivate = membership.role === Role.OWNER || Boolean(scopes.view_private_items);

  // If user lacks view_private_items, strictly exclude private items from SQL query
  const appointments = await prisma.appointment.findMany({
    where: {
      profileId,
      ...(canViewPrivate ? {} : { isPrivate: false }),
    },
    orderBy: { startsAt: 'asc' },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'HEALTH_DATA:READ',
    entityType: 'Appointment',
    entityId: profileId,
    metadata: { count: appointments.length },
  });

  return appointments;
}

export interface AppointmentPrepView {
  appointment: Appointment;
  activeMedications: Array<{ name: string; strength: string; instructions: string | null }>;
  recentMissedDosesCount: number;
  adherencePercentage: number;
  openCareNotes: Array<{ id: string; body: string; createdAt: Date }>;
  questionsToAsk: string[];
}

export async function getAppointmentPrepSummary(
  profileId: string,
  appointmentId: string,
  actorUserId?: string
): Promise<AppointmentPrepView> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_appointments',
    userIdOverride: actorUserId,
  });

  const scopes = (membership.scopes || {}) as Record<string, boolean>;
  const canViewPrivate = membership.role === Role.OWNER || Boolean(scopes.view_private_items);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment || appointment.profileId !== profileId) {
    throw new Error('Appointment not found.');
  }

  if (appointment.isPrivate && !canViewPrivate) {
    throw new Error('You do not have permission to view this private appointment.');
  }

  // 1. Current active medications
  const medications = await prisma.medication.findMany({
    where: { profileId, isActive: true },
    select: { name: true, strength: true, instructions: true },
  });

  // 2. Recent dose history (past 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentDoses = await prisma.doseEvent.findMany({
    where: {
      profileId,
      scheduledAt: { gte: fourteenDaysAgo },
    },
    select: { id: true, scheduledAt: true, status: true, note: true },
  });

  const adherence = calculateAdherence(recentDoses as DoseRecord[]);
  const recentMissedDosesCount = adherence.missedCount;

  // 3. Open care notes (respecting privacy)
  const careNotes = await prisma.careNote.findMany({
    where: {
      profileId,
      ...(canViewPrivate ? {} : { isPrivate: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, body: true, createdAt: true },
  });

  // 4. Questions to ask
  const rawQuestions = appointment.questionsToAsk || '';
  const questionsToAsk = rawQuestions
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  return {
    appointment,
    activeMedications: medications,
    recentMissedDosesCount,
    adherencePercentage: adherence.percentage,
    openCareNotes: careNotes,
    questionsToAsk,
  };
}

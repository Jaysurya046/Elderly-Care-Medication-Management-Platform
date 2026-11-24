import { prisma, Medication, Schedule, DoseEvent, MedicationCriticality, DoseStatus, Role } from '@elder-care/db';
import {
  transitionDose,
  generateRolling14DaySlots,
  decrementStock,
  classifyTimeOfDayBlock,
  GeneratedDoseSlot,
} from '@elder-care/core';
import { requireProfileAccess, ConflictError, NotFoundError, ForbiddenError } from '../lib/auth-guard';
import { recordAuditLog } from '../lib/audit';

export interface CreateMedicationInput {
  name: string;
  genericName?: string;
  strength: string;
  form: string;
  instructions?: string;
  criticality?: MedicationCriticality;
  prescribedBy?: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  stockCount: number;
  refillThreshold?: number;
  // Schedule parameters:
  rrule?: string; // default "FREQ=DAILY;INTERVAL=1"
  timesOfDay: string[]; // e.g. ["08:00", "20:00"]
  graceMinutes?: number;
  snoozeMinutes?: number;
  escalateToCaregivers?: boolean;
}

export async function createMedication(
  profileId: string,
  input: CreateMedicationInput,
  actorUserId?: string
): Promise<{ medication: Medication; schedule: Schedule }> {
  const { membership, profile } = await requireProfileAccess(profileId, {
    scope: 'manage_medications',
    userIdOverride: actorUserId,
  });

  const criticality = input.criticality || MedicationCriticality.STANDARD;
  const escalateDefault = criticality === MedicationCriticality.CRITICAL;

  const startDate = typeof input.startDate === 'string' ? new Date(input.startDate) : input.startDate;
  const endDate = input.endDate
    ? typeof input.endDate === 'string'
      ? new Date(input.endDate)
      : input.endDate
    : null;

  // 1. Create Medication
  const medication = await prisma.medication.create({
    data: {
      profileId,
      name: input.name.trim(),
      genericName: input.genericName?.trim() || null,
      strength: input.strength.trim(),
      form: input.form.trim(),
      instructions: input.instructions?.trim() || null,
      criticality,
      prescribedBy: input.prescribedBy?.trim() || null,
      startDate,
      endDate,
      stockCount: Math.max(0, input.stockCount),
      refillThreshold: input.refillThreshold ?? 5,
      isActive: true,
    },
  });

  // 2. Create Schedule
  const schedule = await prisma.schedule.create({
    data: {
      medicationId: medication.id,
      rrule: input.rrule || 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: input.timesOfDay,
      startsOn: startDate,
      endsOn: endDate,
      graceMinutes: input.graceMinutes ?? 60,
      snoozeMinutes: input.snoozeMinutes ?? 15,
      escalateToCaregivers: input.escalateToCaregivers ?? escalateDefault,
    },
  });

  // 3. Generate initial rolling 14 days of dose events
  await generateDoseEventsForSchedule(schedule.id, profile.timezone);

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'MEDICATION:CREATE',
    entityType: 'Medication',
    entityId: medication.id,
    metadata: { criticality, timesOfDay: input.timesOfDay },
  });

  return { medication, schedule };
}

/**
 * Idempotently generates dose events for a schedule for the next 14 days.
 */
export async function generateDoseEventsForSchedule(
  scheduleId: string,
  timezone: string,
  referenceDate: Date = new Date()
): Promise<number> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { medication: true },
  });

  if (!schedule || !schedule.medication.isActive) {
    return 0;
  }

  const times = (schedule.timesOfDay as string[]) || [];

  const slots = generateRolling14DaySlots(
    {
      id: schedule.id,
      medicationId: schedule.medicationId,
      rrule: schedule.rrule,
      timesOfDay: times,
      startsOn: schedule.startsOn,
      endsOn: schedule.endsOn,
      timezone,
    },
    referenceDate
  );

  let insertedCount = 0;
  for (const slot of slots) {
    // Unique on (scheduleId, scheduledAt) prevents duplicates
    const created = await prisma.doseEvent
      .create({
        data: {
          scheduleId: schedule.id,
          profileId: schedule.medication.profileId,
          scheduledAt: slot.scheduledAtUTC,
          status: DoseStatus.PENDING,
          snoozeCount: 0,
          stockDecremented: false,
        },
      })
      .then(() => 1)
      .catch(() => 0); // Ignore unique constraint violation

    insertedCount += created;
  }

  return insertedCount;
}

export interface RecordDoseActionInput {
  action: 'TAKE' | 'SNOOZE' | 'SKIP' | 'CORRECTION';
  skipReason?: string;
  note?: string;
  correctionTargetStatus?: 'TAKEN' | 'LATE_TAKEN' | 'SKIPPED' | 'MISSED' | 'PENDING';
}

/**
 * Executes a state transition on a DoseEvent adhering to Section 6.1 concurrency,
 * zero double-decrement, and append-only audit rules.
 */
export async function recordDoseAction(
  doseEventId: string,
  input: RecordDoseActionInput,
  actorUserId?: string,
  expectedProfileId?: string
): Promise<DoseEvent> {
  const doseEvent = await prisma.doseEvent.findUnique({
    where: { id: doseEventId },
    include: {
      schedule: {
        include: { medication: true },
      },
    },
  });

  if (!doseEvent) {
    throw new NotFoundError('Dose event not found.');
  }

  // Dose belongs to profile: verify against expectedProfileId if provided
  if (expectedProfileId && doseEvent.profileId !== expectedProfileId) {
    throw new NotFoundError('Dose event does not belong to specified profile.');
  }

  // Always use the dose's own profileId, never trust caller-supplied profile id
  const profileId = doseEvent.profileId;
  const { membership } = await requireProfileAccess(profileId, {
    userIdOverride: actorUserId,
  });

  // FAMILY must be view-only: TAKE, SNOOZE, SKIP, CORRECTION require manage_medications or OWNER/CAREGIVER
  const isPrivileged = membership.role === Role.OWNER || membership.role === Role.CAREGIVER;
  const membershipScopes = (membership.scopes || {}) as Record<string, boolean>;

  if (membership.role === Role.FAMILY) {
    await recordAuditLog({
      profileId,
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: 'DOSE:ACTION_DENIED',
      entityType: 'DoseEvent',
      entityId: doseEvent.id,
      metadata: { reason: 'FAMILY_ROLE_VIEW_ONLY', action: input.action },
    });
    throw new ForbiddenError('FAMILY role is view-only for medications.');
  }

  if (!isPrivileged && !membershipScopes.manage_medications) {
    await recordAuditLog({
      profileId,
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: 'DOSE:ACTION_DENIED',
      entityType: 'DoseEvent',
      entityId: doseEvent.id,
      metadata: { reason: 'MISSING_MANAGE_MEDICATIONS_SCOPE', action: input.action },
    });
    throw new ForbiddenError('You do not have the required scope (manage_medications).');
  }

  // Run pure domain state transition
  const transitionResult = transitionDose({
    currentStatus: doseEvent.status as any,
    targetAction: input.action,
    snoozeCount: doseEvent.snoozeCount,
    skipReason: input.skipReason,
    correctionTargetStatus: input.correctionTargetStatus as any,
    isPrivilegedRole: isPrivileged,
  });

  if (!transitionResult.allowed) {
    throw new ConflictError(transitionResult.error || 'Transition not allowed.');
  }

  const now = new Date();
  const medicationId = doseEvent.schedule.medicationId;
  const previousStatus = doseEvent.status;
  const shouldDecrement = transitionResult.shouldDecrementStock && !doseEvent.stockDecremented;

  // Execute single transaction with atomic conditional update
  const updatedDoseEvent = await prisma.$transaction(async (tx) => {
    // 1. Atomic dose transition with conditional updateMany
    const updateWhere: any = {
      id: doseEventId,
      status: previousStatus,
    };
    if (shouldDecrement) {
      updateWhere.stockDecremented = false;
    }

    const res = await tx.doseEvent.updateMany({
      where: updateWhere,
      data: {
        status: transitionResult.newStatus as any,
        actedAt: now,
        actedByMembershipId: membership.id,
        snoozeCount: transitionResult.newSnoozeCount,
        note: input.note || input.skipReason || doseEvent.note,
        ...(shouldDecrement ? { stockDecremented: true } : {}),
      },
    });

    if (res.count !== 1) {
      const fresh = await tx.doseEvent.findUnique({
        where: { id: doseEventId },
      });
      let actorName = (fresh as any)?.actedByMembership?.user?.name;
      if (!actorName && fresh?.actedByMembershipId) {
        const actingMembership = await tx.membership.findUnique({
          where: { id: fresh.actedByMembershipId },
          include: {
            user: { select: { id: true, name: true } },
          },
        });
        if (actingMembership?.user?.name) {
          actorName = actingMembership.user.name;
        }
      }
      throw new ConflictError(`Already recorded by ${actorName || 'another member'}.`);
    }

    // 2. Atomic stock decrement with a zero floor: never write an absolute value
    if (shouldDecrement) {
      await tx.medication.updateMany({
        where: { id: medicationId, stockCount: { gt: 0 } },
        data: { stockCount: { decrement: 1 } },
      });
    }

    // 3. Record append-only DoseEventAction history
    await tx.doseEventAction.create({
      data: {
        doseEventId: doseEvent.id,
        fromStatus: previousStatus,
        toStatus: transitionResult.newStatus as any,
        membershipId: membership.id,
        reason: input.skipReason || input.note || null,
      },
    });

    const updated = await tx.doseEvent.findUnique({
      where: { id: doseEventId },
    });
    return updated!;
  });

  // Record immutable audit log entry
  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: input.action === 'CORRECTION' ? 'DOSE:CORRECTION' : 'DOSE:ACTION',
    entityType: 'DoseEvent',
    entityId: doseEvent.id,
    metadata: {
      fromStatus: previousStatus,
      toStatus: transitionResult.newStatus,
      action: input.action,
    },
  });

  return updatedDoseEvent;
}

export interface UpdateMedicationInput {
  name?: string;
  genericName?: string | null;
  strength?: string;
  form?: string;
  instructions?: string | null;
  criticality?: MedicationCriticality;
  prescribedBy?: string | null;
  stockCount?: number;
  refillThreshold?: number;
  isActive?: boolean;
}

export async function updateMedication(
  profileId: string,
  medicationId: string,
  input: UpdateMedicationInput,
  actorUserId?: string
): Promise<Medication> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'manage_medications',
    userIdOverride: actorUserId,
  });

  const existing = await prisma.medication.findUnique({
    where: { id: medicationId },
  });

  if (!existing || existing.profileId !== profileId) {
    throw new NotFoundError('Medication not found in this profile.');
  }

  // If stockCount changed, record stock adjustment audit log
  if (input.stockCount !== undefined && input.stockCount !== existing.stockCount) {
    await recordAuditLog({
      profileId,
      actorUserId: membership.userId,
      actorMembershipId: membership.id,
      action: 'MEDICATION:STOCK_ADJUSTMENT',
      entityType: 'Medication',
      entityId: medicationId,
      metadata: {
        previousStock: existing.stockCount,
        newStock: input.stockCount,
        diff: input.stockCount - existing.stockCount,
      },
    });
  }

  const updated = await prisma.medication.update({
    where: { id: medicationId },
    data: {
      name: input.name?.trim(),
      genericName: input.genericName !== undefined ? (input.genericName?.trim() || null) : undefined,
      strength: input.strength?.trim(),
      form: input.form?.trim(),
      instructions: input.instructions !== undefined ? (input.instructions?.trim() || null) : undefined,
      criticality: input.criticality,
      prescribedBy: input.prescribedBy !== undefined ? (input.prescribedBy?.trim() || null) : undefined,
      stockCount: input.stockCount !== undefined ? Math.max(0, input.stockCount) : undefined,
      refillThreshold: input.refillThreshold,
      isActive: input.isActive,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'MEDICATION:UPDATE',
    entityType: 'Medication',
    entityId: medicationId,
    metadata: { updatedFields: Object.keys(input) },
  });

  return updated;
}

export async function deleteMedication(
  profileId: string,
  medicationId: string,
  actorUserId?: string
): Promise<Medication> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'manage_medications',
    userIdOverride: actorUserId,
  });

  const existing = await prisma.medication.findUnique({
    where: { id: medicationId },
  });

  if (!existing || existing.profileId !== profileId) {
    throw new NotFoundError('Medication not found in this profile.');
  }

  const softDeleted = await prisma.medication.update({
    where: { id: medicationId },
    data: { isActive: false },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'MEDICATION:DELETE',
    entityType: 'Medication',
    entityId: medicationId,
    metadata: { softDelete: true },
  });

  return softDeleted;
}

export async function getProfileDoses(
  profileId: string,
  options?: { startDate?: Date; endDate?: Date; status?: DoseStatus },
  actorUserId?: string
): Promise<DoseEvent[]> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_medications',
    userIdOverride: actorUserId,
  });

  const whereClause: any = { profileId };
  if (options?.startDate || options?.endDate) {
    whereClause.scheduledAt = {};
    if (options.startDate) whereClause.scheduledAt.gte = options.startDate;
    if (options.endDate) whereClause.scheduledAt.lte = options.endDate;
  }
  if (options?.status) {
    whereClause.status = options.status;
  }

  const doses = await prisma.doseEvent.findMany({
    where: whereClause,
    include: {
      schedule: {
        include: {
          medication: true,
        },
      },
      actions: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          membership: {
            select: {
              id: true,
              role: true,
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'HEALTH_DATA:READ',
    entityType: 'DoseEvent',
    entityId: profileId,
    metadata: { count: doses.length },
  });

  return doses;
}

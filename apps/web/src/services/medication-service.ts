import { prisma, Medication, Schedule, DoseEvent, MedicationCriticality, DoseStatus, Role } from '@elder-care/db';
import {
  transitionDose,
  generateRolling14DaySlots,
  decrementStock,
  classifyTimeOfDayBlock,
  GeneratedDoseSlot,
} from '@elder-care/core';
import { requireProfileAccess } from '../lib/auth-guard';
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
  actorUserId?: string
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
    throw new Error('Dose event not found.');
  }

  const profileId = doseEvent.profileId;
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_medications',
    userIdOverride: actorUserId,
  });

  const isPrivileged = membership.role === Role.OWNER || membership.role === Role.CAREGIVER;

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
    throw new Error(transitionResult.error || 'Transition not allowed.');
  }

  const now = new Date();
  const medicationId = doseEvent.schedule.medicationId;
  const currentStock = doseEvent.schedule.medication.stockCount;

  // Execute database transaction with conditional update to prevent double-action concurrency
  const updatedDoseEvent = await prisma.$transaction(async (tx) => {
    // 1. Conditional check: ensure status has not changed concurrently by another caregiver
    const freshDose = await tx.doseEvent.findUnique({
      where: { id: doseEventId },
    });

    if (!freshDose) throw new Error('Dose event no longer exists.');

    // If another caregiver already acted on it
    if (
      freshDose.status !== doseEvent.status &&
      input.action !== 'CORRECTION'
    ) {
      throw new Error(`Already recorded by another caregiver (Status: ${freshDose.status}).`);
    }

    // 2. Decrement stock if required and not already decremented
    let finalStockDecremented = freshDose.stockDecremented;
    if (transitionResult.shouldDecrementStock && !freshDose.stockDecremented) {
      const newStock = decrementStock(currentStock, 1);
      await tx.medication.update({
        where: { id: medicationId },
        data: { stockCount: newStock },
      });
      finalStockDecremented = true;
    }

    // 3. Update DoseEvent
    const updated = await tx.doseEvent.update({
      where: { id: doseEventId },
      data: {
        status: transitionResult.newStatus as any,
        snoozeCount: transitionResult.newSnoozeCount,
        actedAt: now,
        actedByMembershipId: membership.id,
        note: input.note || input.skipReason || freshDose.note,
        stockDecremented: finalStockDecremented,
      },
    });

    // 4. Record append-only DoseEventAction history
    await tx.doseEventAction.create({
      data: {
        doseEventId: doseEvent.id,
        fromStatus: doseEvent.status,
        toStatus: transitionResult.newStatus as any,
        membershipId: membership.id,
        reason: input.skipReason || input.note || null,
      },
    });

    return updated;
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
      fromStatus: doseEvent.status,
      toStatus: transitionResult.newStatus,
      action: input.action,
    },
  });

  return updatedDoseEvent;
}

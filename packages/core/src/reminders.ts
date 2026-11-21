import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';

export type ReminderType =
  | 'UPCOMING_DOSE'
  | 'DOSE_DUE_NOW'
  | 'DOSE_MISSED'
  | 'CRITICAL_ESCALATION'
  | 'APPOINTMENT'
  | 'LOW_STOCK';

export interface QuietHoursConfig {
  startHour: number; // 22 (10:00 PM)
  startMinute: number; // 0
  endHour: number; // 6 (06:30 AM)
  endMinute: number; // 30
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  startHour: 22,
  startMinute: 0,
  endHour: 6,
  endMinute: 30,
};

/**
 * Checks whether a given UTC time falls within the profile's quiet hours in local time.
 */
export function isWithinQuietHours(
  utcDate: Date,
  timezone: string = 'Asia/Kolkata',
  quietHours: QuietHoursConfig = DEFAULT_QUIET_HOURS
): boolean {
  const localDate = toZonedTime(utcDate, timezone);
  const hour = localDate.getHours();
  const minute = localDate.getMinutes();
  const totalMinutes = hour * 60 + minute;

  const quietStartMinutes = quietHours.startHour * 60 + quietHours.startMinute; // 22:00 = 1320
  const quietEndMinutes = quietHours.endHour * 60 + quietHours.endMinute; // 06:30 = 390

  // Quiet hours cross midnight (e.g. 22:00 to 06:30)
  if (quietStartMinutes > quietEndMinutes) {
    return totalMinutes >= quietStartMinutes || totalMinutes < quietEndMinutes;
  }
  return totalMinutes >= quietStartMinutes && totalMinutes < quietEndMinutes;
}

/**
 * Calculates the next alert dispatch instant. If within quiet hours and non-critical,
 * returns the end of quiet hours on the local date. Critical alerts ignore quiet hours.
 */
export function getAdjustedNotificationTime(
  scheduledUtc: Date,
  isCritical: boolean,
  timezone: string = 'Asia/Kolkata',
  quietHours: QuietHoursConfig = DEFAULT_QUIET_HOURS
): { dispatchAtUtc: Date; wasDeferred: boolean } {
  if (isCritical) {
    // Critical doses bypass quiet hours entirely
    return { dispatchAtUtc: scheduledUtc, wasDeferred: false };
  }

  if (!isWithinQuietHours(scheduledUtc, timezone, quietHours)) {
    return { dispatchAtUtc: scheduledUtc, wasDeferred: false };
  }

  // Defer to end of quiet hours (06:30 local time)
  const localDate = toZonedTime(scheduledUtc, timezone);
  const hour = localDate.getHours();

  const deferredLocalDate = new Date(localDate);
  // If local time is in late night (>= 22:00), the morning 06:30 is the next day
  if (hour >= quietHours.startHour) {
    deferredLocalDate.setDate(deferredLocalDate.getDate() + 1);
  }
  deferredLocalDate.setHours(quietHours.endHour, quietHours.endMinute, 0, 0);

  const deferredUtc = fromZonedTime(deferredLocalDate, timezone);
  return { dispatchAtUtc: deferredUtc, wasDeferred: true };
}

/**
 * Generates an idempotent reference key for NotificationLog:
 * referenceKey = hash(profileId, recipientUserId, type, eventId, scheduledInstant)
 */
export function generateNotificationReferenceKey(params: {
  profileId: string;
  recipientUserId: string;
  type: ReminderType;
  entityId: string;
  scheduledAtUtc: Date | string;
}): string {
  const ts = typeof params.scheduledAtUtc === 'string'
    ? params.scheduledAtUtc
    : params.scheduledAtUtc.toISOString();
  return `${params.profileId}_${params.recipientUserId}_${params.type}_${params.entityId}_${ts}`;
}

/**
 * Generates the safe, privacy-compliant email subject and body (Section 1, Principle 5).
 * By default, never names medicines or diagnoses.
 */
export function composeDoseReminderMessage(params: {
  localTimeStr: string;
  count: number;
  emailShowsMedicineNames?: boolean;
  medicineNames?: string[];
}): { subject: string; body: string } {
  const { localTimeStr, count, emailShowsMedicineNames, medicineNames } = params;

  if (emailShowsMedicineNames && medicineNames && medicineNames.length > 0) {
    const list = medicineNames.join(', ');
    return {
      subject: `Medication Reminder: ${localTimeStr}`,
      body: `You have ${count} medicine(s) due at ${localTimeStr}: ${list}. Please log in to confirm.`,
    };
  }

  return {
    subject: `Medication Reminder: ${localTimeStr}`,
    body: `You have medicines due at ${localTimeStr}. Open the app to see them.`,
  };
}

/**
 * Groups multiple dose events occurring at the exact same local time into a single digest batch.
 */
export function groupDosesForDigest<T extends { localTimeStr: string; profileId: string }>(
  doses: T[]
): Map<string, T[]> {
  const digestGroups = new Map<string, T[]>();

  for (const dose of doses) {
    const key = `${dose.profileId}___${dose.localTimeStr}`;
    const existing = digestGroups.get(key) || [];
    existing.push(dose);
    digestGroups.set(key, existing);
  }

  return digestGroups;
}

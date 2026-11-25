import { rrulestr } from 'rrule';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addDays, parseISO, startOfDay, endOfDay } from 'date-fns';

export interface ScheduleInput {
  id: string;
  medicationId: string;
  rrule: string; // e.g. "FREQ=DAILY;INTERVAL=1"
  timesOfDay: string[]; // e.g. ["08:00", "20:00"]
  startsOn: Date | string;
  endsOn?: Date | string | null;
  timezone: string; // e.g. "Asia/Kolkata"
}

export interface GeneratedDoseSlot {
  scheduleId: string;
  scheduledAtUTC: Date;
  localTimeStr: string;
  timeOfDayBlock: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME';
}

/**
 * Classifies a local HH:mm string into one of the 4 Senior Mode timeline blocks:
 * Morning: 05:00 - 11:59
 * Afternoon: 12:00 - 16:59
 * Evening: 17:00 - 20:59
 * Bedtime: 21:00 - 04:59
 */
export function classifyTimeOfDayBlock(
  timeStr: string
): 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME' {
  const [hourStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);

  if (hour >= 5 && hour < 12) return 'MORNING';
  if (hour >= 12 && hour < 17) return 'AFTERNOON';
  if (hour >= 17 && hour < 21) return 'EVENING';
  return 'BEDTIME';
}

function parseLocalDateParts(
  dateInput: Date | string,
  tz: string
): { year: number; month: number; day: number; dateStr: string } {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return { year: y, month: m, day: d, dateStr: dateInput };
  }

  const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
  const zoned = toZonedTime(dateObj, tz);
  const year = zoned.getFullYear();
  const month = zoned.getMonth() + 1;
  const day = zoned.getDate();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, dateStr };
}

/**
 * Expands a schedule across a target window (e.g. next 14 days) in the profile's timezone,
 * correctly handling DST transitions, leap years, and midnight rollovers.
 */
export function expandSchedule(
  schedule: ScheduleInput,
  windowStart: Date,
  windowEnd: Date
): GeneratedDoseSlot[] {
  const slots: GeneratedDoseSlot[] = [];
  const tz = schedule.timezone || 'Asia/Kolkata';

  // Local date components for startsOn and window
  const startParts = parseLocalDateParts(schedule.startsOn, tz);
  const windowStartParts = parseLocalDateParts(windowStart, tz);
  const windowEndParts = parseLocalDateParts(windowEnd, tz);

  const localStartUtc = fromZonedTime(`${startParts.dateStr}T00:00:00`, tz);
  const localEndUtc = schedule.endsOn
    ? fromZonedTime(`${parseLocalDateParts(schedule.endsOn, tz).dateStr}T23:59:59`, tz)
    : null;

  // Parse RRULE
  let rule;
  const rruleDtStart = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day, 12, 0, 0));

  try {
    const ruleString = schedule.rrule.startsWith('RRULE:')
      ? schedule.rrule
      : `RRULE:${schedule.rrule}`;
    rule = rrulestr(ruleString, {
      dtstart: rruleDtStart,
    });
  } catch (err) {
    rule = rrulestr('RRULE:FREQ=DAILY;INTERVAL=1', {
      dtstart: rruleDtStart,
    });
  }

  // Define synthetic UTC bounds for RRULE expansion (add 1 day padding on each side)
  const evalStart = new Date(
    Date.UTC(windowStartParts.year, windowStartParts.month - 1, windowStartParts.day - 1, 0, 0, 0)
  );
  const rruleStart = evalStart < rruleDtStart ? rruleDtStart : evalStart;

  const evalEnd = new Date(
    Date.UTC(windowEndParts.year, windowEndParts.month - 1, windowEndParts.day + 1, 23, 59, 59)
  );

  const occurrences = rule.between(rruleStart, evalEnd, true);

  for (const occurrence of occurrences) {
    const occYear = occurrence.getUTCFullYear();
    const occMonth = String(occurrence.getUTCMonth() + 1).padStart(2, '0');
    const occDay = String(occurrence.getUTCDate()).padStart(2, '0');
    const dateStr = `${occYear}-${occMonth}-${occDay}`;

    for (const timeStr of schedule.timesOfDay) {
      // Direct zoned-to-UTC conversion without host machine timezone pollution
      const utcInstant = fromZonedTime(`${dateStr}T${timeStr}:00`, tz);

      // Check window bounds
      if (utcInstant < windowStart || utcInstant > windowEnd) {
        continue;
      }
      if (utcInstant < localStartUtc) {
        continue;
      }
      if (localEndUtc && utcInstant > localEndUtc) {
        continue;
      }

      slots.push({
        scheduleId: schedule.id,
        scheduledAtUTC: utcInstant,
        localTimeStr: timeStr,
        timeOfDayBlock: classifyTimeOfDayBlock(timeStr),
      });
    }
  }

  // Sort chronologically
  return slots.sort((a, b) => a.scheduledAtUTC.getTime() - b.scheduledAtUTC.getTime());
}

/**
 * Generates rolling slots for the next 14 days starting from reference date.
 */
export function generateRolling14DaySlots(
  schedule: ScheduleInput,
  referenceDate: Date = new Date()
): GeneratedDoseSlot[] {
  const windowStart = startOfDay(referenceDate);
  const windowEnd = endOfDay(addDays(referenceDate, 14));
  return expandSchedule(schedule, windowStart, windowEnd);
}

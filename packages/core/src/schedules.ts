import { rrulestr } from 'rrule';
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addDays, parseISO, startOfDay, endOfDay, setHours, setMinutes, setSeconds } from 'date-fns';

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

  const scheduleStartDate = typeof schedule.startsOn === 'string'
    ? parseISO(schedule.startsOn)
    : schedule.startsOn;

  const scheduleEndDate = schedule.endsOn
    ? typeof schedule.endsOn === 'string'
      ? parseISO(schedule.endsOn)
      : schedule.endsOn
    : null;

  // We operate on calendar dates in the local timezone
  const localWindowStart = toZonedTime(windowStart, tz);
  const localWindowEnd = toZonedTime(windowEnd, tz);

  // Parse RRULE
  let rule;
  try {
    // If rrule doesn't start with RRULE: prefix, rrulestr can handle it
    const ruleString = schedule.rrule.startsWith('RRULE:')
      ? schedule.rrule
      : `RRULE:${schedule.rrule}`;
    rule = rrulestr(ruleString, {
      dtstart: scheduleStartDate,
    });
  } catch (err) {
    // Fallback simple daily if parsing fails
    rule = rrulestr('RRULE:FREQ=DAILY;INTERVAL=1', {
      dtstart: scheduleStartDate,
    });
  }

  // Generate recurrence occurrences between range
  const rangeStart = scheduleStartDate > localWindowStart ? scheduleStartDate : localWindowStart;
  const occurrences = rule.between(startOfDay(rangeStart), endOfDay(localWindowEnd), true);

  for (const occurrence of occurrences) {
    // Format local date YYYY-MM-DD
    const dateStr = format(occurrence, 'yyyy-MM-dd', { timeZone: tz });

    for (const timeStr of schedule.timesOfDay) {
      const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));

      // Construct the local zoned time for this dose
      let localDateTime = toZonedTime(new Date(`${dateStr}T12:00:00Z`), tz);
      localDateTime = setHours(localDateTime, h);
      localDateTime = setMinutes(localDateTime, m);
      localDateTime = setSeconds(localDateTime, 0);

      // Convert back to UTC instant for database storage
      const utcInstant = fromZonedTime(localDateTime, tz);

      // Check bounds
      if (utcInstant < windowStart || utcInstant > windowEnd) {
        continue;
      }
      if (scheduleEndDate && utcInstant > scheduleEndDate) {
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

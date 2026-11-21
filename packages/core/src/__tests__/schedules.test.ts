import { describe, it, expect } from 'vitest';
import {
  expandSchedule,
  classifyTimeOfDayBlock,
  generateRolling14DaySlots,
  GeneratedDoseSlot,
} from '../schedules';

describe('Schedule Engine & Timezone Expansion (packages/core)', () => {
  it('classifies times into Senior Mode timeline blocks', () => {
    expect(classifyTimeOfDayBlock('08:00')).toBe('MORNING');
    expect(classifyTimeOfDayBlock('11:30')).toBe('MORNING');
    expect(classifyTimeOfDayBlock('13:00')).toBe('AFTERNOON');
    expect(classifyTimeOfDayBlock('16:45')).toBe('AFTERNOON');
    expect(classifyTimeOfDayBlock('19:00')).toBe('EVENING');
    expect(classifyTimeOfDayBlock('20:30')).toBe('EVENING');
    expect(classifyTimeOfDayBlock('22:00')).toBe('BEDTIME');
    expect(classifyTimeOfDayBlock('00:30')).toBe('BEDTIME');
  });

  it('correctly expands daily schedule across leap day in Asia/Kolkata', () => {
    // 2028 is a leap year (Feb 29 exists)
    const schedule = {
      id: 'sched-1',
      medicationId: 'med-1',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2028-02-27T00:00:00Z',
      timezone: 'Asia/Kolkata',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2028-02-27T00:00:00Z'),
      new Date('2028-03-02T23:59:59Z')
    );

    // Should include Feb 27, 28, 29, Mar 1, Mar 2 (5 slots)
    expect(slots.length).toBe(5);
    // Asia/Kolkata is UTC+05:30. 08:00 AM IST is 02:30 AM UTC
    const leapDaySlot = slots.find((s: GeneratedDoseSlot) => s.scheduledAtUTC.toISOString().includes('2028-02-29'));
    expect(leapDaySlot).toBeDefined();
    expect(leapDaySlot?.scheduledAtUTC.toISOString()).toBe('2028-02-29T02:30:00.000Z');
  });

  it('handles DST transitions properly in US/Eastern timezone', () => {
    // Spring forward in US/Eastern: March 8, 2026 (clock jumps from 2am to 3am)
    // 8:00 AM local before DST is UTC-5 (13:00 UTC).
    // 8:00 AM local after DST is UTC-4 (12:00 UTC).
    const schedule = {
      id: 'sched-dst',
      medicationId: 'med-dst',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-03-06T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-03-06T00:00:00Z'),
      new Date('2026-03-10T23:59:59Z')
    );

    expect(slots.length).toBeGreaterThan(3);

    const march7 = slots.find((s: GeneratedDoseSlot) => s.scheduledAtUTC.toISOString().startsWith('2026-03-07'));
    const march9 = slots.find((s: GeneratedDoseSlot) => s.scheduledAtUTC.toISOString().startsWith('2026-03-09'));

    // Before DST: 8:00 AM EST = 13:00 UTC
    expect(march7?.scheduledAtUTC.toISOString()).toBe('2026-03-07T13:00:00.000Z');
    // After DST: 8:00 AM EDT = 12:00 UTC
    expect(march9?.scheduledAtUTC.toISOString()).toBe('2026-03-09T12:00:00.000Z');
  });

  it('expands multi-time daily schedule into rolling 14-day window', () => {
    const schedule = {
      id: 'sched-multi',
      medicationId: 'med-multi',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00', '20:00'],
      startsOn: '2026-11-21T00:00:00Z',
      timezone: 'Asia/Kolkata',
    };

    const slots = generateRolling14DaySlots(schedule, new Date('2026-11-21T00:00:00Z'));
    // 14-15 days * 2 times per day = ~28-30 slots
    expect(slots.length).toBeGreaterThanOrEqual(28);
    expect(slots[0].timeOfDayBlock).toBe('MORNING');
    expect(slots[1].timeOfDayBlock).toBe('EVENING');
  });
});

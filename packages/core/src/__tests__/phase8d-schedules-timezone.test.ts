import { describe, it, expect } from 'vitest';
import {
  expandSchedule,
  classifyTimeOfDayBlock,
  GeneratedDoseSlot,
} from '../schedules';

describe('Phase 8d-1: Schedules & Timezone Rigorous Verification', () => {
  it('correctly schedules for America/New_York (EST standard time)', () => {
    const schedule = {
      id: 'sched-ny-est',
      medicationId: 'med-1',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-01-15T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-01-15T00:00:00Z'),
      new Date('2026-01-16T23:59:59Z')
    );

    // 08:00 AM EST is UTC-5 -> 13:00 UTC
    expect(slots.length).toBe(2);
    expect(slots[0].scheduledAtUTC.toISOString()).toBe('2026-01-15T13:00:00.000Z');
    expect(slots[1].scheduledAtUTC.toISOString()).toBe('2026-01-16T13:00:00.000Z');
  });

  it('correctly schedules for America/Los_Angeles (PST UTC-8 and PDT UTC-7)', () => {
    // Winter (PST = UTC-8)
    const scheduleWinter = {
      id: 'sched-la-pst',
      medicationId: 'med-la',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['09:00'],
      startsOn: '2026-01-10T00:00:00Z',
      timezone: 'America/Los_Angeles',
    };
    const slotsWinter = expandSchedule(
      scheduleWinter,
      new Date('2026-01-10T00:00:00Z'),
      new Date('2026-01-10T23:59:59Z')
    );
    // 09:00 AM PST = 17:00 UTC
    expect(slotsWinter.length).toBe(1);
    expect(slotsWinter[0].scheduledAtUTC.toISOString()).toBe('2026-01-10T17:00:00.000Z');

    // Summer (PDT = UTC-7)
    const scheduleSummer = {
      id: 'sched-la-pdt',
      medicationId: 'med-la',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['09:00'],
      startsOn: '2026-07-10T00:00:00Z',
      timezone: 'America/Los_Angeles',
    };
    const slotsSummer = expandSchedule(
      scheduleSummer,
      new Date('2026-07-10T00:00:00Z'),
      new Date('2026-07-10T23:59:59Z')
    );
    // 09:00 AM PDT = 16:00 UTC
    expect(slotsSummer.length).toBe(1);
    expect(slotsSummer[0].scheduledAtUTC.toISOString()).toBe('2026-07-10T16:00:00.000Z');
  });

  it('correctly schedules for Australia/Sydney (Southern Hemisphere inverted DST)', () => {
    // January in Sydney is summer (AEDT = UTC+11)
    const scheduleSummer = {
      id: 'sched-syd-summer',
      medicationId: 'med-syd',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-01-20T00:00:00Z',
      timezone: 'Australia/Sydney',
    };
    const slotsSummer = expandSchedule(
      scheduleSummer,
      new Date('2026-01-20T00:00:00Z'),
      new Date('2026-01-20T23:59:59Z')
    );
    // 08:00 AM AEDT on Jan 20 is 21:00 UTC on Jan 19
    expect(slotsSummer.length).toBe(1);
    expect(slotsSummer[0].scheduledAtUTC.toISOString()).toBe('2026-01-19T21:00:00.000Z');

    // July in Sydney is winter (AEST = UTC+10)
    const scheduleWinter = {
      id: 'sched-syd-winter',
      medicationId: 'med-syd',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-07-20T00:00:00Z',
      timezone: 'Australia/Sydney',
    };
    const slotsWinter = expandSchedule(
      scheduleWinter,
      new Date('2026-07-20T00:00:00Z'),
      new Date('2026-07-20T23:59:59Z')
    );
    // 08:00 AM AEST on July 20 is 22:00 UTC on July 19
    expect(slotsWinter.length).toBe(1);
    expect(slotsWinter[0].scheduledAtUTC.toISOString()).toBe('2026-07-19T22:00:00.000Z');
  });

  it('correctly schedules for Asia/Kolkata (UTC+05:30 non-DST half-hour)', () => {
    const schedule = {
      id: 'sched-ist',
      medicationId: 'med-ist',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:30'],
      startsOn: '2026-05-10T00:00:00Z',
      timezone: 'Asia/Kolkata',
    };
    const slots = expandSchedule(
      schedule,
      new Date('2026-05-10T00:00:00Z'),
      new Date('2026-05-10T23:59:59Z')
    );
    // 08:30 IST is 03:00 UTC
    expect(slots.length).toBe(1);
    expect(slots[0].scheduledAtUTC.toISOString()).toBe('2026-05-10T03:00:00.000Z');
  });

  it('evaluates weekly BYDAY rule west of UTC without day-shift bug', () => {
    // 2026-03-02 is Monday.
    // In America/New_York, 20:00 on Monday March 2 is Tuesday March 3 at 01:00 UTC.
    // The weekly rule BYDAY=MO must schedule on Monday local time, NOT Sunday local time!
    const schedule = {
      id: 'sched-byday-ny',
      medicationId: 'med-byday',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timesOfDay: ['20:00'],
      startsOn: '2026-03-02T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-10T23:59:59Z')
    );

    // Should schedule Monday March 2 at 20:00 EST (Tuesday 2026-03-03 01:00 UTC)
    // and Monday March 9 at 20:00 EDT (Tuesday 2026-03-10 00:00 UTC after DST)
    expect(slots.length).toBe(2);
    expect(slots[0].scheduledAtUTC.toISOString()).toBe('2026-03-03T01:00:00.000Z');
    expect(slots[0].localTimeStr).toBe('20:00');
    expect(slots[1].scheduledAtUTC.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(slots[1].localTimeStr).toBe('20:00');
  });

  it('accurately handles Spring-forward DST in America/New_York', () => {
    // Spring-forward: March 8, 2026 at 02:00 -> jumps to 03:00
    const schedule = {
      id: 'sched-spring',
      medicationId: 'med-dst',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-03-07T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-03-07T00:00:00Z'),
      new Date('2026-03-09T23:59:59Z')
    );

    const march7 = slots.find((s) => s.scheduledAtUTC.toISOString().startsWith('2026-03-07'));
    const march9 = slots.find((s) => s.scheduledAtUTC.toISOString().startsWith('2026-03-09'));

    // Before DST: 08:00 EST = 13:00 UTC
    expect(march7?.scheduledAtUTC.toISOString()).toBe('2026-03-07T13:00:00.000Z');
    // After DST: 08:00 EDT = 12:00 UTC
    expect(march9?.scheduledAtUTC.toISOString()).toBe('2026-03-09T12:00:00.000Z');
  });

  it('accurately handles Fall-back DST in America/New_York', () => {
    // Fall-back: November 1, 2026 at 02:00 -> falls back to 01:00
    const schedule = {
      id: 'sched-fallback',
      medicationId: 'med-fb',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2026-10-31T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-10-31T00:00:00Z'),
      new Date('2026-11-02T23:59:59Z')
    );

    const oct31 = slots.find((s) => s.scheduledAtUTC.toISOString().startsWith('2026-10-31'));
    const nov2 = slots.find((s) => s.scheduledAtUTC.toISOString().startsWith('2026-11-02'));

    // Before fall-back (EDT): 08:00 EDT = 12:00 UTC
    expect(oct31?.scheduledAtUTC.toISOString()).toBe('2026-10-31T12:00:00.000Z');
    // After fall-back (EST): 08:00 EST = 13:00 UTC
    expect(nov2?.scheduledAtUTC.toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('handles midnight rollover (00:00) without landing in previous calendar day', () => {
    const schedule = {
      id: 'sched-midnight',
      medicationId: 'med-mid',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['00:00'],
      startsOn: '2026-04-10T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2026-04-10T00:00:00Z'),
      new Date('2026-04-11T23:59:59Z')
    );

    // Midnight (00:00 EDT) on April 10 is 2026-04-10 04:00:00 UTC
    expect(slots.length).toBe(2);
    expect(slots[0].scheduledAtUTC.toISOString()).toBe('2026-04-10T04:00:00.000Z');
    expect(slots[0].timeOfDayBlock).toBe('BEDTIME');
    expect(slots[1].scheduledAtUTC.toISOString()).toBe('2026-04-11T04:00:00.000Z');
  });

  it('accurately schedules on a leap day (Feb 29, 2028) in America/New_York', () => {
    const schedule = {
      id: 'sched-leap',
      medicationId: 'med-leap',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: '2028-02-28T00:00:00Z',
      timezone: 'America/New_York',
    };

    const slots = expandSchedule(
      schedule,
      new Date('2028-02-28T00:00:00Z'),
      new Date('2028-03-01T23:59:59Z')
    );

    // Feb 28, Feb 29, March 1
    expect(slots.length).toBe(3);
    const leapSlot = slots.find((s) => s.scheduledAtUTC.toISOString().includes('2028-02-29'));
    expect(leapSlot).toBeDefined();
    // 08:00 EST on Feb 29 is 13:00 UTC
    expect(leapSlot?.scheduledAtUTC.toISOString()).toBe('2028-02-29T13:00:00.000Z');
  });
});

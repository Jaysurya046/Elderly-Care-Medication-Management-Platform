import { describe, it, expect } from 'vitest';
import {
  isWithinQuietHours,
  getAdjustedNotificationTime,
  generateNotificationReferenceKey,
  composeDoseReminderMessage,
  groupDosesForDigest,
} from '../reminders';

describe('Reminders, Quiet Hours & Notifications (packages/core)', () => {
  it('identifies quiet hours correctly in local timezone', () => {
    // 23:00 IST is 17:30 UTC. Should be inside quiet hours (22:00 - 06:30)
    const lateNightUtc = new Date('2026-11-21T17:30:00Z');
    expect(isWithinQuietHours(lateNightUtc, 'Asia/Kolkata')).toBe(true);

    // 03:00 IST is 21:30 UTC (prev day). Inside quiet hours.
    const midnightUtc = new Date('2026-11-20T21:30:00Z');
    expect(isWithinQuietHours(midnightUtc, 'Asia/Kolkata')).toBe(true);

    // 10:00 AM IST is 04:30 UTC. Outside quiet hours.
    const morningUtc = new Date('2026-11-21T04:30:00Z');
    expect(isWithinQuietHours(morningUtc, 'Asia/Kolkata')).toBe(false);
  });

  it('bypasses quiet hours for critical medications', () => {
    const lateNightUtc = new Date('2026-11-21T17:30:00Z'); // 23:00 IST
    const result = getAdjustedNotificationTime(lateNightUtc, true, 'Asia/Kolkata');

    expect(result.wasDeferred).toBe(false);
    expect(result.dispatchAtUtc.toISOString()).toBe(lateNightUtc.toISOString());
  });

  it('defers non-critical reminders during quiet hours to 06:30 AM local time', () => {
    const lateNightUtc = new Date('2026-11-21T17:30:00Z'); // 23:00 IST on Nov 21
    const result = getAdjustedNotificationTime(lateNightUtc, false, 'Asia/Kolkata');

    expect(result.wasDeferred).toBe(true);
    // 06:30 AM IST on Nov 22 is 01:00 AM UTC on Nov 22
    expect(result.dispatchAtUtc.toISOString()).toBe('2026-11-22T01:00:00.000Z');
  });

  it('generates consistent and idempotent reference keys', () => {
    const key1 = generateNotificationReferenceKey({
      profileId: 'prof-123',
      recipientUserId: 'user-456',
      type: 'UPCOMING_DOSE',
      entityId: 'dose-789',
      scheduledAtUtc: '2026-11-21T08:00:00.000Z',
    });

    const key2 = generateNotificationReferenceKey({
      profileId: 'prof-123',
      recipientUserId: 'user-456',
      type: 'UPCOMING_DOSE',
      entityId: 'dose-789',
      scheduledAtUtc: new Date('2026-11-21T08:00:00.000Z'),
    });

    expect(key1).toBe(key2);
    expect(key1).toBe('prof-123_user-456_UPCOMING_DOSE_dose-789_2026-11-21T08:00:00.000Z');
  });

  it('composes safe emails by default without medicine names (Section 1, Principle 5)', () => {
    const defaultEmail = composeDoseReminderMessage({
      localTimeStr: '8:00 AM',
      count: 2,
      emailShowsMedicineNames: false,
      medicineNames: ['Metformin', 'Atorvastatin'],
    });

    expect(defaultEmail.body).toBe(
      'You have medicines due at 8:00 AM. Open the app to see them.'
    );
    expect(defaultEmail.body).not.toContain('Metformin');
    expect(defaultEmail.body).not.toContain('Atorvastatin');

    const explicitOptInEmail = composeDoseReminderMessage({
      localTimeStr: '8:00 AM',
      count: 2,
      emailShowsMedicineNames: true,
      medicineNames: ['Metformin 500mg', 'Atorvastatin 20mg'],
    });

    expect(explicitOptInEmail.body).toContain('Metformin 500mg');
    expect(explicitOptInEmail.body).toContain('Atorvastatin 20mg');
  });

  it('groups multiple doses due at the same local time into a single digest batch', () => {
    const doses = [
      { id: '1', profileId: 'p1', localTimeStr: '08:00 AM', med: 'A' },
      { id: '2', profileId: 'p1', localTimeStr: '08:00 AM', med: 'B' },
      { id: '3', profileId: 'p1', localTimeStr: '02:00 PM', med: 'C' },
    ];

    const grouped = groupDosesForDigest(doses);
    expect(grouped.size).toBe(2);
    expect(grouped.get('p1___08:00 AM')?.length).toBe(2);
    expect(grouped.get('p1___02:00 PM')?.length).toBe(1);
  });
});

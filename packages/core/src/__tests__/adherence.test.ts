import { describe, it, expect } from 'vitest';
import {
  calculateAdherence,
  calculateStreak,
  generateDeterministicInsights,
  DoseRecord,
} from '../adherence';

describe('Adherence, Streaks & Deterministic Insights (packages/core)', () => {
  const baseDate = new Date('2026-11-21T10:00:00Z');

  it('calculates adherence according to Section 6.4 formula', () => {
    // 3 taken, 1 late taken, 1 missed, 1 valid skipped
    const doses: DoseRecord[] = [
      { id: '1', scheduledAt: '2026-11-20T08:00:00Z', status: 'TAKEN' },
      { id: '2', scheduledAt: '2026-11-20T12:00:00Z', status: 'TAKEN' },
      { id: '3', scheduledAt: '2026-11-20T20:00:00Z', status: 'TAKEN' },
      { id: '4', scheduledAt: '2026-11-21T08:00:00Z', status: 'LATE_TAKEN' },
      { id: '5', scheduledAt: '2026-11-21T09:00:00Z', status: 'MISSED' },
      {
        id: '6',
        scheduledAt: '2026-11-21T09:30:00Z',
        status: 'SKIPPED',
        skipReason: 'Doctor advised fasting',
      },
    ];

    const result = calculateAdherence(doses, baseDate);
    // Successful: 3 taken + 1 late = 4
    // Eligible: 4 successful + 1 missed = 5 (valid skipped excluded)
    // Percentage: 4/5 = 80%
    expect(result.takenCount).toBe(3);
    expect(result.lateTakenCount).toBe(1);
    expect(result.missedCount).toBe(1);
    expect(result.validSkippedCount).toBe(1);
    expect(result.totalEligibleDoses).toBe(5);
    expect(result.percentage).toBe(80);
    expect(result.formulaDescription).toBe('(3 taken + 1 late) / (5 eligible scheduled doses)');
  });

  it('ignores future pending doses in adherence calculation', () => {
    const doses: DoseRecord[] = [
      { id: '1', scheduledAt: '2026-11-21T08:00:00Z', status: 'TAKEN' },
      { id: '2', scheduledAt: '2026-11-21T22:00:00Z', status: 'PENDING' }, // Future!
    ];

    const result = calculateAdherence(doses, baseDate);
    expect(result.percentage).toBe(100);
    expect(result.totalEligibleDoses).toBe(1);
  });

  it('calculates streaks correctly across consecutive days', () => {
    const daysData = [
      {
        dateStr: '2026-11-21',
        doses: [{ id: '1', scheduledAt: '2026-11-21T08:00:00Z', status: 'TAKEN' as const }],
      },
      {
        dateStr: '2026-11-20',
        doses: [{ id: '2', scheduledAt: '2026-11-20T08:00:00Z', status: 'TAKEN' as const }],
      },
      {
        dateStr: '2026-11-19',
        doses: [{ id: '3', scheduledAt: '2026-11-19T08:00:00Z', status: 'MISSED' as const }],
      },
      {
        dateStr: '2026-11-18',
        doses: [{ id: '4', scheduledAt: '2026-11-18T08:00:00Z', status: 'TAKEN' as const }],
      },
    ];

    const streak = calculateStreak(daysData, '2026-11-21');
    // 21st (taken) and 20th (taken) are consecutive days without MISSED.
    // 19th had MISSED, so streak stops at 2.
    expect(streak).toBe(2);
  });

  it('generates deterministic descriptive insights without medical advice', () => {
    const doses: DoseRecord[] = [
      {
        id: '1',
        scheduledAt: '2026-11-20T20:00:00Z',
        status: 'MISSED',
        timeOfDayBlock: 'EVENING',
      },
      {
        id: '2',
        scheduledAt: '2026-11-21T20:00:00Z',
        status: 'MISSED',
        timeOfDayBlock: 'EVENING',
      },
      { id: '3', scheduledAt: '2026-11-20T08:00:00Z', status: 'LATE_TAKEN' },
      { id: '4', scheduledAt: '2026-11-21T08:00:00Z', status: 'LATE_TAKEN' },
      { id: '5', scheduledAt: '2026-11-19T08:00:00Z', status: 'LATE_TAKEN' },
    ];

    const insights = generateDeterministicInsights(doses);
    expect(insights).toContain('Evening doses were missed 2 times in the recorded period.');
    expect(insights).toContain('Medications were taken past the scheduled time 3 times.');
  });
});

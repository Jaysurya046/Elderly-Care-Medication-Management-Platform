import { describe, it, expect } from 'vitest';
import { transitionDose, MAX_SNOOZE_COUNT } from '../dose-state-machine';

describe('Dose State Machine (packages/core)', () => {
  it('transitions PENDING to TAKEN and flags stock decrement', () => {
    const result = transitionDose({
      currentStatus: 'PENDING',
      targetAction: 'TAKE',
      snoozeCount: 0,
    });

    expect(result.allowed).toBe(true);
    expect(result.newStatus).toBe('TAKEN');
    expect(result.shouldDecrementStock).toBe(true);
  });

  it('allows SNOOZE up to 3 times, increments snoozeCount, and does not decrement stock', () => {
    let snoozeCount = 0;

    // 1st snooze
    let res = transitionDose({
      currentStatus: 'PENDING',
      targetAction: 'SNOOZE',
      snoozeCount,
    });
    expect(res.allowed).toBe(true);
    expect(res.newStatus).toBe('SNOOZED');
    expect(res.newSnoozeCount).toBe(1);
    expect(res.shouldDecrementStock).toBe(false);
    snoozeCount = res.newSnoozeCount;

    // 2nd snooze
    res = transitionDose({
      currentStatus: 'SNOOZED',
      targetAction: 'SNOOZE',
      snoozeCount,
    });
    expect(res.allowed).toBe(true);
    expect(res.newSnoozeCount).toBe(2);
    snoozeCount = res.newSnoozeCount;

    // 3rd snooze
    res = transitionDose({
      currentStatus: 'SNOOZED',
      targetAction: 'SNOOZE',
      snoozeCount,
    });
    expect(res.allowed).toBe(true);
    expect(res.newSnoozeCount).toBe(3);
    snoozeCount = res.newSnoozeCount;

    // 4th snooze must fail
    res = transitionDose({
      currentStatus: 'SNOOZED',
      targetAction: 'SNOOZE',
      snoozeCount,
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain(`at most ${MAX_SNOOZE_COUNT} times`);
  });

  it('allows SNOOZED dose to transition to TAKEN', () => {
    const res = transitionDose({
      currentStatus: 'SNOOZED',
      targetAction: 'TAKE',
      snoozeCount: 2,
    });

    expect(res.allowed).toBe(true);
    expect(res.newStatus).toBe('TAKEN');
    expect(res.shouldDecrementStock).toBe(true);
  });

  it('requires a reason to SKIP a dose from PENDING', () => {
    const failRes = transitionDose({
      currentStatus: 'PENDING',
      targetAction: 'SKIP',
      snoozeCount: 0,
      skipReason: '',
    });
    expect(failRes.allowed).toBe(false);
    expect(failRes.error).toContain('reason is required');

    const successRes = transitionDose({
      currentStatus: 'PENDING',
      targetAction: 'SKIP',
      snoozeCount: 0,
      skipReason: 'Feeling nauseous after breakfast',
    });
    expect(successRes.allowed).toBe(true);
    expect(successRes.newStatus).toBe('SKIPPED');
    expect(successRes.shouldDecrementStock).toBe(false);
  });

  it('transitions PENDING to MISSED when grace period expires', () => {
    const res = transitionDose({
      currentStatus: 'PENDING',
      targetAction: 'AUTO_MISS',
      snoozeCount: 0,
    });
    expect(res.allowed).toBe(true);
    expect(res.newStatus).toBe('MISSED');
    expect(res.shouldDecrementStock).toBe(false);
  });

  it('transitions MISSED to LATE_TAKEN when taken late', () => {
    const res = transitionDose({
      currentStatus: 'MISSED',
      targetAction: 'TAKE',
      snoozeCount: 0,
    });
    expect(res.allowed).toBe(true);
    expect(res.newStatus).toBe('LATE_TAKEN');
    expect(res.shouldDecrementStock).toBe(true);
  });

  it('transitions MISSED to SKIPPED with reason', () => {
    const res = transitionDose({
      currentStatus: 'MISSED',
      targetAction: 'SKIP',
      snoozeCount: 0,
      skipReason: 'Doctor advised omitting missed dose',
    });
    expect(res.allowed).toBe(true);
    expect(res.newStatus).toBe('SKIPPED');
    expect(res.shouldDecrementStock).toBe(false);
  });

  it('blocks re-taking or actions on final states without correction', () => {
    const takenRes = transitionDose({
      currentStatus: 'TAKEN',
      targetAction: 'TAKE',
      snoozeCount: 0,
    });
    expect(takenRes.allowed).toBe(false);
    expect(takenRes.error).toContain('already in final state');

    const skippedRes = transitionDose({
      currentStatus: 'SKIPPED',
      targetAction: 'SKIP',
      snoozeCount: 0,
      skipReason: 'another reason',
    });
    expect(skippedRes.allowed).toBe(false);
  });

  it('supports logged corrections by OWNER/CAREGIVER with accurate stock adjustment', () => {
    // Unprivileged user cannot correct
    const unprivileged = transitionDose({
      currentStatus: 'SKIPPED',
      targetAction: 'CORRECTION',
      snoozeCount: 0,
      correctionTargetStatus: 'TAKEN',
      isPrivilegedRole: false,
    });
    expect(unprivileged.allowed).toBe(false);

    // Privileged correction from SKIPPED to TAKEN should decrement stock
    const privCorrection = transitionDose({
      currentStatus: 'SKIPPED',
      targetAction: 'CORRECTION',
      snoozeCount: 0,
      correctionTargetStatus: 'TAKEN',
      isPrivilegedRole: true,
    });
    expect(privCorrection.allowed).toBe(true);
    expect(privCorrection.newStatus).toBe('TAKEN');
    expect(privCorrection.shouldDecrementStock).toBe(true);

    // Privileged correction from TAKEN to LATE_TAKEN should NOT double decrement
    const noDoubleDec = transitionDose({
      currentStatus: 'TAKEN',
      targetAction: 'CORRECTION',
      snoozeCount: 0,
      correctionTargetStatus: 'LATE_TAKEN',
      isPrivilegedRole: true,
    });
    expect(noDoubleDec.allowed).toBe(true);
    expect(noDoubleDec.shouldDecrementStock).toBe(false);
  });
});

import { DoseStatus } from './dose-state-machine';

export interface DoseRecord {
  id: string;
  scheduledAt: Date | string;
  status: DoseStatus;
  skipReason?: string | null;
  timeOfDayBlock?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME';
}

export interface AdherenceResult {
  takenCount: number;
  lateTakenCount: number;
  missedCount: number;
  validSkippedCount: number;
  totalEligibleDoses: number;
  percentage: number; // 0 to 100
  formulaDescription: string;
}

/**
 * Calculates adherence percentage and breakdown according to Section 6.4:
 * Adherence = (TAKEN + LATE_TAKEN) / (scheduled doses not in the future and not SKIPPED with a valid reason)
 */
export function calculateAdherence(
  doses: DoseRecord[],
  referenceNow: Date = new Date()
): AdherenceResult {
  let takenCount = 0;
  let lateTakenCount = 0;
  let missedCount = 0;
  let validSkippedCount = 0;

  for (const dose of doses) {
    const scheduledTime = new Date(dose.scheduledAt).getTime();
    // Ignore doses scheduled strictly in the future unless already taken
    if (scheduledTime > referenceNow.getTime() && dose.status === 'PENDING') {
      continue;
    }

    if (dose.status === 'TAKEN') {
      takenCount++;
    } else if (dose.status === 'LATE_TAKEN') {
      lateTakenCount++;
    } else if (dose.status === 'MISSED') {
      missedCount++;
    } else if (dose.status === 'SKIPPED' && dose.skipReason && dose.skipReason.trim().length > 0) {
      validSkippedCount++;
    }
  }

  const successfulDoses = takenCount + lateTakenCount;
  // Eligible denominator excludes valid skipped doses and future pending doses
  const totalEligibleDoses = successfulDoses + missedCount;

  const percentage =
    totalEligibleDoses === 0 ? 100 : Math.round((successfulDoses / totalEligibleDoses) * 100);

  return {
    takenCount,
    lateTakenCount,
    missedCount,
    validSkippedCount,
    totalEligibleDoses,
    percentage,
    formulaDescription: `(${takenCount} taken + ${lateTakenCount} late) / (${totalEligibleDoses} eligible scheduled doses)`,
  };
}

/**
 * Calculates current streak: consecutive calendar days backwards from today with 0 MISSED doses.
 */
export function calculateStreak(
  dosesByDay: { dateStr: string; doses: DoseRecord[] }[],
  todayStr: string
): number {
  // Sort days descending (today first, then yesterday, etc.)
  const sortedDays = [...dosesByDay].sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  let streak = 0;
  for (const day of sortedDays) {
    // If future date, ignore
    if (day.dateStr > todayStr) continue;

    const hadMissedDose = day.doses.some((d) => d.status === 'MISSED');
    const hadAnyDose = day.doses.length > 0;

    if (hadMissedDose) {
      break;
    }

    // Only count day in streak if there were doses scheduled or if day was clean
    if (hadAnyDose) {
      const anyTaken = day.doses.some((d) => d.status === 'TAKEN' || d.status === 'LATE_TAKEN');
      if (anyTaken) {
        streak++;
      }
    }
  }

  return streak;
}

/**
 * Deterministic, purely descriptive insights generator (Section 6.4).
 * Never gives medical advice or dosage recommendations.
 */
export function generateDeterministicInsights(doses: DoseRecord[]): string[] {
  const insights: string[] = [];

  const missedByBlock: Record<string, number> = {
    MORNING: 0,
    AFTERNOON: 0,
    EVENING: 0,
    BEDTIME: 0,
  };

  let totalMissed = 0;
  let totalLate = 0;

  for (const dose of doses) {
    if (dose.status === 'MISSED') {
      totalMissed++;
      if (dose.timeOfDayBlock && missedByBlock[dose.timeOfDayBlock] !== undefined) {
        missedByBlock[dose.timeOfDayBlock]++;
      }
    } else if (dose.status === 'LATE_TAKEN') {
      totalLate++;
    }
  }

  // Check specific time blocks with missed doses
  for (const [block, count] of Object.entries(missedByBlock)) {
    if (count >= 2) {
      const blockTitle = block.charAt(0) + block.slice(1).toLowerCase();
      insights.push(`${blockTitle} doses were missed ${count} times in the recorded period.`);
    }
  }

  if (totalLate >= 3) {
    insights.push(`Medications were taken past the scheduled time ${totalLate} times.`);
  }

  if (totalMissed === 0 && doses.length > 0) {
    insights.push('All scheduled doses have been taken or recorded without any missed doses.');
  }

  return insights;
}

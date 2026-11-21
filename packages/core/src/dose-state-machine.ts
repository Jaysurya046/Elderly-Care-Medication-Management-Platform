export type DoseStatus =
  | 'PENDING'
  | 'TAKEN'
  | 'LATE_TAKEN'
  | 'SKIPPED'
  | 'SNOOZED'
  | 'MISSED';

export interface DoseTransitionInput {
  currentStatus: DoseStatus;
  targetAction: 'TAKE' | 'SNOOZE' | 'SKIP' | 'AUTO_MISS' | 'CORRECTION';
  snoozeCount: number;
  skipReason?: string;
  correctionTargetStatus?: 'TAKEN' | 'LATE_TAKEN' | 'SKIPPED' | 'MISSED' | 'PENDING';
  isPrivilegedRole?: boolean; // OWNER or CAREGIVER
}

export interface DoseTransitionResult {
  allowed: boolean;
  newStatus: DoseStatus;
  newSnoozeCount: number;
  shouldDecrementStock: boolean;
  error?: string;
}

export const MAX_SNOOZE_COUNT = 3;

/**
 * Pure state machine transition function for the dose lifecycle.
 */
export function transitionDose(input: DoseTransitionInput): DoseTransitionResult {
  const {
    currentStatus,
    targetAction,
    snoozeCount,
    skipReason,
    correctionTargetStatus,
    isPrivilegedRole,
  } = input;

  // Manual Correction flow (only OWNER or CAREGIVER can correct terminal states)
  if (targetAction === 'CORRECTION') {
    if (!isPrivilegedRole) {
      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: 'Only an OWNER or CAREGIVER may record a dose correction.',
      };
    }
    if (!correctionTargetStatus) {
      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: 'Correction target status is required.',
      };
    }

    const wasStockAlreadyDecremented = currentStatus === 'TAKEN' || currentStatus === 'LATE_TAKEN';
    const willDoseBeTaken =
      correctionTargetStatus === 'TAKEN' || correctionTargetStatus === 'LATE_TAKEN';
    const shouldDecrementStock = !wasStockAlreadyDecremented && willDoseBeTaken;

    return {
      allowed: true,
      newStatus: correctionTargetStatus,
      newSnoozeCount: snoozeCount,
      shouldDecrementStock,
    };
  }

  // Handle standard transitions based on current status
  switch (currentStatus) {
    case 'PENDING':
    case 'SNOOZED': {
      if (targetAction === 'TAKE') {
        return {
          allowed: true,
          newStatus: 'TAKEN',
          newSnoozeCount: snoozeCount,
          shouldDecrementStock: true,
        };
      }

      if (targetAction === 'SNOOZE') {
        if (snoozeCount >= MAX_SNOOZE_COUNT) {
          return {
            allowed: false,
            newStatus: currentStatus,
            newSnoozeCount: snoozeCount,
            shouldDecrementStock: false,
            error: `A dose can be snoozed at most ${MAX_SNOOZE_COUNT} times.`,
          };
        }
        return {
          allowed: true,
          newStatus: 'SNOOZED',
          newSnoozeCount: snoozeCount + 1,
          shouldDecrementStock: false,
        };
      }

      if (targetAction === 'SKIP') {
        if (!skipReason || skipReason.trim().length === 0) {
          return {
            allowed: false,
            newStatus: currentStatus,
            newSnoozeCount: snoozeCount,
            shouldDecrementStock: false,
            error: 'A reason is required to skip a dose.',
          };
        }
        return {
          allowed: true,
          newStatus: 'SKIPPED',
          newSnoozeCount: snoozeCount,
          shouldDecrementStock: false,
        };
      }

      if (targetAction === 'AUTO_MISS') {
        return {
          allowed: true,
          newStatus: 'MISSED',
          newSnoozeCount: snoozeCount,
          shouldDecrementStock: false,
        };
      }

      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: `Invalid action ${targetAction} from status ${currentStatus}.`,
      };
    }

    case 'MISSED': {
      if (targetAction === 'TAKE') {
        // A dose taken after being marked MISSED becomes LATE_TAKEN
        return {
          allowed: true,
          newStatus: 'LATE_TAKEN',
          newSnoozeCount: snoozeCount,
          shouldDecrementStock: true,
        };
      }

      if (targetAction === 'SKIP') {
        if (!skipReason || skipReason.trim().length === 0) {
          return {
            allowed: false,
            newStatus: currentStatus,
            newSnoozeCount: snoozeCount,
            shouldDecrementStock: false,
            error: 'A reason is required to skip a dose.',
          };
        }
        return {
          allowed: true,
          newStatus: 'SKIPPED',
          newSnoozeCount: snoozeCount,
          shouldDecrementStock: false,
        };
      }

      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: `Cannot ${targetAction} a dose that has been marked MISSED. Only TAKE (late) or SKIP are permitted.`,
      };
    }

    case 'TAKEN':
    case 'LATE_TAKEN':
    case 'SKIPPED': {
      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: `Dose is already in final state ${currentStatus}. Use a logged correction to adjust.`,
      };
    }

    default:
      return {
        allowed: false,
        newStatus: currentStatus,
        newSnoozeCount: snoozeCount,
        shouldDecrementStock: false,
        error: `Unknown dose status ${currentStatus}.`,
      };
  }
}

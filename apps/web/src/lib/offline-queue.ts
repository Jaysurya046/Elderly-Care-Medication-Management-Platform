/**
 * Offline Action Queue for Senior Mode & Caregiver Offline Operations
 * Features:
 * - Client Action IDs (UUIDs) for idempotency across network retries
 * - Drop-on-409 Conflict handling (drops stale actions when server state has already progressed)
 * - Safe retry on network disconnects
 */

export interface QueuedOfflineAction {
  clientActionId: string;
  profileId: string;
  doseId: string;
  action: 'TAKE' | 'SNOOZE' | 'SKIP';
  skipReason?: string;
  timestamp: string;
}

export interface SyncResult {
  successful: number;
  droppedOnConflict: number;
  remainingQueue: QueuedOfflineAction[];
}

export async function syncOfflineQueueItems(
  queue: QueuedOfflineAction[],
  fetchFn: typeof fetch = fetch
): Promise<SyncResult> {
  let successful = 0;
  let droppedOnConflict = 0;
  const remainingQueue: QueuedOfflineAction[] = [];

  for (const item of queue) {
    try {
      const res = await fetchFn(
        `/api/profiles/${item.profileId}/doses/${item.doseId}/action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-action-id': item.clientActionId,
          },
          body: JSON.stringify({
            action: item.action,
            skipReason: item.skipReason,
            clientActionId: item.clientActionId,
          }),
        }
      );

      if (res.ok) {
        successful++;
      } else if (res.status === 409) {
        // Drop-on-409: Another actor or auto-miss has already moved this dose to a terminal state
        droppedOnConflict++;
      } else {
        // Other HTTP errors (e.g. 500, 503) retain in queue for retry
        remainingQueue.push(item);
      }
    } catch {
      // Network disconnect / offline fetch failure -> retain for next reconnection
      remainingQueue.push(item);
    }
  }

  return {
    successful,
    droppedOnConflict,
    remainingQueue,
  };
}

export function saveOfflineQueue(queue: QueuedOfflineAction[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('eldercare_offline_queue', JSON.stringify(queue));
  }
}

export function loadOfflineQueue(): QueuedOfflineAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('eldercare_offline_queue');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

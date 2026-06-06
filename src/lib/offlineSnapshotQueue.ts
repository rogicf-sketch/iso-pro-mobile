import AsyncStorage from '@react-native-async-storage/async-storage';
import { commitDefaultSnapshotWrite, type SnapshotWritePlan, type UpsertDefaultSnapshotResult } from './snapshot';

export type SnapshotWriteOutcome = UpsertDefaultSnapshotResult & {
  queued?: boolean;
};

const QUEUE_KEY = 'iso_pro_offline_snapshot_queue_v1';

type QueuedSnapshotWrite = {
  id: string;
  enqueuedAt: string;
  prepareTag: string;
  plan: SnapshotWritePlan;
};

async function readQueue(): Promise<QueuedSnapshotWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedSnapshotWrite[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedSnapshotWrite[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueOfflineSnapshotWrite(
  plan: SnapshotWritePlan,
  prepareTag: string,
): Promise<void> {
  const items = await readQueue();
  items.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enqueuedAt: new Date().toISOString(),
    prepareTag,
    plan,
  });
  await writeQueue(items);
}

export type FlushOfflineQueueResult = {
  flushed: number;
  remaining: number;
  hadErrors: boolean;
};

export async function flushOfflineSnapshotQueue(): Promise<FlushOfflineQueueResult> {
  const items = await readQueue();
  if (!items.length) return { flushed: 0, remaining: 0, hadErrors: false };

  const remaining: QueuedSnapshotWrite[] = [];
  let flushed = 0;
  let hadErrors = false;

  for (const item of items) {
    const result = await commitDefaultSnapshotWrite(async () => item.plan, { maxAttempts: 5 });
    if (result.error) {
      hadErrors = true;
      remaining.push(item);
      continue;
    }
    flushed += 1;
  }

  await writeQueue(remaining);
  return { flushed, remaining: remaining.length, hadErrors };
}

export async function getOfflineSnapshotQueueSize(): Promise<number> {
  return (await readQueue()).length;
}

/** Gravação com fila offline quando Supabase falha por rede. */
export async function commitDefaultSnapshotWriteResilient(
  prepare: () => Promise<SnapshotWritePlan>,
  options?: { maxAttempts?: number; offlineTag?: string },
): Promise<SnapshotWriteOutcome> {
  const result = await commitDefaultSnapshotWrite(prepare, options);
  if (!result.error) return result;

  const offline =
    /network|fetch|timeout|failed to fetch|sem ligacao|offline/i.test(result.error) ||
    result.error.includes('Supabase não configurado');

  if (offline) {
    try {
      const plan = await prepare();
      await enqueueOfflineSnapshotWrite(plan, options?.offlineTag ?? 'snapshot-write');
      return {
        error: null,
        conflict: false,
        updatedAt: new Date().toISOString(),
        queued: true,
      };
    } catch {
      return result;
    }
  }

  return result;
}

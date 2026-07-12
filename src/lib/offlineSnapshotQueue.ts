import AsyncStorage from '@react-native-async-storage/async-storage';

import { mergeSnapshotForOfflineReplay } from './offlineSnapshotMerge.utils';
import { captureOperationalEvent } from './errorReporting';
import { SNAPSHOT_MOBILE_OFFLINE_MERGE_READ_KEYS } from './snapshotSliceKeys';
import {
  buildSnapshotPatchFromNext,
  commitDefaultSnapshotPatchWrite,
  commitDefaultSnapshotWrite,
  fetchSnapshotSlicesForWrite,
  type SnapshotPatchPlan,
  type SnapshotWritePlan,
  type UpsertDefaultSnapshotResult,
} from './snapshot';

export type SnapshotWriteOutcome = UpsertDefaultSnapshotResult & {
  queued?: boolean;
};

const QUEUE_KEY = 'iso_pro_offline_snapshot_queue_v1';

type QueuedSnapshotWrite = {
  id: string;
  enqueuedAt: string;
  prepareTag: string;
  plan: SnapshotWritePlan;
  /** Chaves a fundir por id no flush (ex.: inventarios). */
  mergeKeys?: string[];
};

/** Chaves de array do merge offline que o RPC funde por `id`. */
const OFFLINE_FLUSH_MERGE_KEYS = ['inventarios', 'recebimentos', 'documentos'] as const;

/**
 * Só regrava chaves presentes na fila (evita LWW de documentos/materiais no flush de inventário).
 * `materiais` fica de fora: saldo é absoluto e o merge offline já não o sobrescreve.
 */
function patchKeysFromQueuedPayload(queued: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const key of SNAPSHOT_MOBILE_OFFLINE_MERGE_READ_KEYS) {
    if (key === 'materiais') continue;
    if (key in queued && queued[key] != null) {
      keys.push(key);
    }
  }
  keys.push('dataAtualizacao');
  return keys;
}

function mergeKeysForQueuedPatch(queued: Record<string, unknown>, stored?: string[]): string[] {
  if (stored?.length) return [...stored];
  return OFFLINE_FLUSH_MERGE_KEYS.filter((k) => k in queued && queued[k] != null);
}

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
  options?: { mergeKeys?: readonly string[] },
): Promise<void> {
  const items = await readQueue();
  items.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enqueuedAt: new Date().toISOString(),
    prepareTag,
    plan,
    mergeKeys: options?.mergeKeys?.length ? [...options.mergeKeys] : undefined,
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
    const result = await commitDefaultSnapshotPatchWrite(async () => {
      const { payload: fresh, updatedAt, error } = await fetchSnapshotSlicesForWrite(
        SNAPSHOT_MOBILE_OFFLINE_MERGE_READ_KEYS,
      );
      if (error) {
        throw new Error(error);
      }
      if (!fresh) {
        throw new Error('Snapshot indisponível. Verifique a ligação e tente novamente.');
      }
      const queued = item.plan.nextPayload as Record<string, unknown>;
      const merged = mergeSnapshotForOfflineReplay(fresh, item.plan.nextPayload);
      const patchKeys = patchKeysFromQueuedPayload(queued);
      const patchWithoutMerge = buildSnapshotPatchFromNext(merged, patchKeys);
      if (merged.dataAtualizacao) {
        patchWithoutMerge.dataAtualizacao = merged.dataAtualizacao;
      }
      const mergeKeys = mergeKeysForQueuedPatch(queued, item.mergeKeys);
      const patch: Record<string, unknown> = { ...patchWithoutMerge };
      // Delta nas chaves com merge: só linhas da fila (RPC funde por id).
      for (const mk of mergeKeys) {
        if (mk in queued && Array.isArray(queued[mk])) {
          patch[mk] = queued[mk];
        }
      }
      return {
        patch,
        baselineUpdatedAt: updatedAt,
        mergeKeys: mergeKeys.length ? mergeKeys : undefined,
        patchWithoutMerge,
      };
    }, { maxAttempts: 3 });

    if (result.error) {
      hadErrors = true;
      remaining.push(item);
      continue;
    }

    flushed += 1;
  }

  await writeQueue(remaining);
  if (flushed > 0 || hadErrors) {
    captureOperationalEvent(
      'offline_flush',
      { flushed, remaining: remaining.length, hadErrors },
      hadErrors ? 'warning' : 'info',
    );
  }
  return { flushed, remaining: remaining.length, hadErrors };
}

export async function getOfflineSnapshotQueueSize(): Promise<number> {
  return (await readQueue()).length;
}

function isOfflineNetworkError(message: string): boolean {
  return /network|fetch|timeout|failed to fetch|typeerror|sem ligacao|offline/i.test(message);
}

async function commitWithOfflineQueueFallback(
  prepare: () => Promise<SnapshotWritePlan>,
  commit: (
    capturingPrepare: () => Promise<SnapshotWritePlan>,
    options?: { maxAttempts?: number },
  ) => Promise<UpsertDefaultSnapshotResult>,
  options?: { maxAttempts?: number; offlineTag?: string },
): Promise<SnapshotWriteOutcome> {
  let capturedPlan: SnapshotWritePlan | null = null;
  const capturingPrepare = async (): Promise<SnapshotWritePlan> => {
    const plan = await prepare();
    capturedPlan = plan;
    return plan;
  };

  const result = await commit(capturingPrepare, options);
  if (!result.error) return result;

  if (result.error.includes('Supabase não configurado')) {
    return result;
  }

  if (!isOfflineNetworkError(result.error)) {
    return result;
  }

  try {
    const plan = capturedPlan ?? (await prepare());
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

/** Gravação completa com fila offline quando Supabase falha por rede. */
export async function commitDefaultSnapshotWriteResilient(
  prepare: () => Promise<SnapshotWritePlan>,
  options?: { maxAttempts?: number; offlineTag?: string },
): Promise<SnapshotWriteOutcome> {
  return commitWithOfflineQueueFallback(prepare, commitDefaultSnapshotWrite, options);
}

/**
 * Gravação parcial (patch) com fila offline quando Supabase falha por rede.
 * Enfileira o patch já capturado — sem re-fetch (P1: offline sem rede na prepare).
 */
export async function commitDefaultSnapshotPatchWriteResilient(
  prepare: () => Promise<SnapshotPatchPlan>,
  options?: { maxAttempts?: number; offlineTag?: string },
): Promise<SnapshotWriteOutcome> {
  let capturedPatchPlan: SnapshotPatchPlan | null = null;
  const capturingPrepare = async (): Promise<SnapshotPatchPlan> => {
    const plan = await prepare();
    capturedPatchPlan = plan;
    return plan;
  };

  const result = await commitDefaultSnapshotPatchWrite(capturingPrepare, options);
  if (!result.error) return result;

  if (result.error.includes('Supabase não configurado')) {
    return result;
  }

  if (!isOfflineNetworkError(result.error)) {
    return result;
  }

  try {
    const patchPlan = capturedPatchPlan ?? (await prepare());
    const patchPayload = {
      ...(patchPlan.patch as Record<string, unknown>),
      dataAtualizacao:
        patchPlan.patch.dataAtualizacao ?? new Date().toISOString(),
    };
    await enqueueOfflineSnapshotWrite(
      {
        nextPayload: patchPayload as SnapshotWritePlan['nextPayload'],
        baselineUpdatedAt: patchPlan.baselineUpdatedAt,
      },
      options?.offlineTag ?? 'snapshot-patch',
      { mergeKeys: patchPlan.mergeKeys },
    );
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

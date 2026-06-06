import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitDefaultSnapshotWrite } from './snapshot';
import {
  commitDefaultSnapshotWriteResilient,
  enqueueOfflineSnapshotWrite,
  flushOfflineSnapshotQueue,
  getOfflineSnapshotQueueSize,
} from './offlineSnapshotQueue';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock('./snapshot', () => ({
  commitDefaultSnapshotWrite: vi.fn(),
}));

describe('offlineSnapshotQueue', () => {
  beforeEach(() => {
    storage.clear();
    vi.mocked(commitDefaultSnapshotWrite).mockReset();
  });

  it('enfileira e reporta tamanho da fila', async () => {
    await enqueueOfflineSnapshotWrite(
      { nextPayload: { dataAtualizacao: 'x' }, baselineUpdatedAt: null },
      'test-tag',
    );
    expect(await getOfflineSnapshotQueueSize()).toBe(1);
  });

  it('commitDefaultSnapshotWriteResilient devolve queued em falha de rede', async () => {
    vi.mocked(commitDefaultSnapshotWrite).mockResolvedValue({
      error: 'Failed to fetch',
      conflict: false,
      updatedAt: null,
    });

    const result = await commitDefaultSnapshotWriteResilient(async () => ({
      nextPayload: { dataAtualizacao: 'y' },
      baselineUpdatedAt: '2020-01-01',
    }));

    expect(result.error).toBeNull();
    expect(result.queued).toBe(true);
    expect(await getOfflineSnapshotQueueSize()).toBe(1);
  });

  it('flushOfflineSnapshotQueue remove itens sincronizados', async () => {
    await enqueueOfflineSnapshotWrite(
      { nextPayload: { dataAtualizacao: 'z' }, baselineUpdatedAt: null },
      'flush-test',
    );
    vi.mocked(commitDefaultSnapshotWrite).mockResolvedValue({
      error: null,
      conflict: false,
      updatedAt: '2026-01-01',
    });

    const flush = await flushOfflineSnapshotQueue();
    expect(flush.flushed).toBe(1);
    expect(flush.remaining).toBe(0);
    expect(flush.hadErrors).toBe(false);
    expect(await getOfflineSnapshotQueueSize()).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitDefaultSnapshotPatchWrite, commitDefaultSnapshotWrite, fetchSnapshotSlicesForWrite } from './snapshot';
import {
  commitDefaultSnapshotPatchWriteResilient,
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

vi.mock('./errorReporting', () => ({
  captureOperationalEvent: vi.fn(),
}));

vi.mock('./snapshot', () => ({
  buildSnapshotPatchFromNext: vi.fn((next: Record<string, unknown>, keys: readonly string[]) => {
    const patch: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in next) patch[key] = next[key];
    }
    return patch;
  }),
  commitDefaultSnapshotPatchWrite: vi.fn(),
  commitDefaultSnapshotWrite: vi.fn(),
  fetchSnapshotSlicesForWrite: vi.fn(),
}));

describe('offlineSnapshotQueue', () => {
  beforeEach(() => {
    storage.clear();
    vi.mocked(commitDefaultSnapshotWrite).mockReset();
    vi.mocked(commitDefaultSnapshotPatchWrite).mockReset();
    vi.mocked(fetchSnapshotSlicesForWrite).mockReset();
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

  it('commitDefaultSnapshotPatchWriteResilient enfileira sem re-fetch', async () => {
    vi.mocked(commitDefaultSnapshotPatchWrite).mockResolvedValue({
      error: 'Network request failed',
      conflict: false,
      updatedAt: null,
    });

    const result = await commitDefaultSnapshotPatchWriteResilient(async () => ({
      patch: {
        recebimentos: [{ id: 'r1', statusConferencia: 'pendente' }],
        dataAtualizacao: 'local',
      },
      baselineUpdatedAt: '2020-01-01',
    }));

    expect(result.error).toBeNull();
    expect(result.queued).toBe(true);
    expect(fetchSnapshotSlicesForWrite).not.toHaveBeenCalled();
    expect(await getOfflineSnapshotQueueSize()).toBe(1);
  });

  it('nao enfileira quando Supabase nao esta configurado', async () => {
    vi.mocked(commitDefaultSnapshotWrite).mockResolvedValue({
      error: 'Supabase não configurado.',
      conflict: false,
      updatedAt: null,
    });

    const result = await commitDefaultSnapshotWriteResilient(async () => ({
      nextPayload: { dataAtualizacao: 'y' },
      baselineUpdatedAt: null,
    }));

    expect(result.error).toContain('Supabase não configurado');
    expect(result.queued).toBeUndefined();
    expect(await getOfflineSnapshotQueueSize()).toBe(0);
  });

  it('flushOfflineSnapshotQueue re-aplica sobre snapshot fresco', async () => {
    await enqueueOfflineSnapshotWrite(
      {
        nextPayload: {
          dataAtualizacao: 'queued',
          atendimentoHistorico: [{ id: 99, loteNumero: 'ATD-X', codigo: 'M1', quantidade: 2 }],
        },
        baselineUpdatedAt: 'old-baseline',
      },
      'flush-test',
    );

    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { dataAtualizacao: 'fresh', atendimentoHistorico: [] },
      updatedAt: 'fresh-ts',
      error: null,
    });

    vi.mocked(commitDefaultSnapshotPatchWrite).mockImplementation(async (prepare) => {
      const plan = await prepare();
      expect(plan.baselineUpdatedAt).toBe('fresh-ts');
      expect(plan.patch.atendimentoHistorico).toHaveLength(1);
      expect(plan.patch.documentos).toBeUndefined();
      expect(plan.patch.materiais).toBeUndefined();
      return { error: null, conflict: false, updatedAt: '2026-01-01' };
    });

    const flush = await flushOfflineSnapshotQueue();
    expect(flush.flushed).toBe(1);
    expect(flush.remaining).toBe(0);
    expect(await getOfflineSnapshotQueueSize()).toBe(0);
  });

  it('flush inventarios envia delta com mergeKeys e preserva lista no fallback', async () => {
    await enqueueOfflineSnapshotWrite(
      {
        nextPayload: {
          dataAtualizacao: 'queued',
          inventarios: [{ id: 'inv-1', status: 'aberto', itens: [{ id: 'li-1', quantidadeContada: 9 }] }],
        },
        baselineUpdatedAt: 'old',
      },
      'inv-flush',
      { mergeKeys: ['inventarios'] },
    );

    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: {
        dataAtualizacao: 'fresh',
        inventarios: [
          { id: 'inv-1', status: 'aberto', itens: [{ id: 'li-1', quantidadeContada: 1 }] },
          { id: 'inv-2', status: 'aberto', itens: [{ id: 'li-2', quantidadeContada: 2 }] },
        ],
      },
      updatedAt: 'fresh-ts',
      error: null,
    });

    vi.mocked(commitDefaultSnapshotPatchWrite).mockImplementation(async (prepare) => {
      const plan = await prepare();
      expect(plan.mergeKeys).toEqual(['inventarios']);
      expect(plan.patch.inventarios).toHaveLength(1);
      expect(plan.patch.inventarios?.[0]).toMatchObject({ id: 'inv-1', itens: [{ quantidadeContada: 9 }] });
      expect(plan.patchWithoutMerge?.inventarios).toHaveLength(2);
      expect(plan.patchWithoutMerge?.inventarios?.[0]).toMatchObject({
        id: 'inv-1',
        itens: [{ quantidadeContada: 9 }],
      });
      expect(plan.patchWithoutMerge?.inventarios?.[1]).toMatchObject({ id: 'inv-2' });
      return { error: null, conflict: false, updatedAt: '2026-01-01' };
    });

    const flush = await flushOfflineSnapshotQueue();
    expect(flush.flushed).toBe(1);
    expect(flush.remaining).toBe(0);
  });

  it('flushOfflineSnapshotQueue mantem item com erro', async () => {
    await enqueueOfflineSnapshotWrite(
      { nextPayload: { dataAtualizacao: 'z' }, baselineUpdatedAt: null },
      'err-test',
    );
    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { dataAtualizacao: 'fresh' },
      updatedAt: 't',
      error: null,
    });
    vi.mocked(commitDefaultSnapshotPatchWrite).mockResolvedValue({
      error: 'Conflito',
      conflict: true,
      updatedAt: null,
    });

    const flush = await flushOfflineSnapshotQueue();
    expect(flush.flushed).toBe(0);
    expect(flush.remaining).toBe(1);
    expect(flush.hadErrors).toBe(true);
  });
});

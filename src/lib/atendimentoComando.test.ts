import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  buildAtendimentoIdempotencyKey,
  enqueueAtendimentoComando,
  flushAtendimentoComandoQueue,
  getAtendimentoComandoQueueSize,
  persistirAtendimentoOptimistic,
  setAtendimentoCloudBaselineCursor,
  syncAtendimentoComando,
} from './atendimentoComando';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock('./isoProSnapshot', () => {
  class IsoProSnapshotConflictError extends Error {
    readonly name = 'IsoProSnapshotConflictError';
  }
  return {
    IsoProSnapshotConflictError,
    isIsoProSnapshotConflictError: (err: unknown): err is IsoProSnapshotConflictError =>
      err instanceof IsoProSnapshotConflictError,
    SNAPSHOT_CONFLICT_MESSAGE:
      'Outro posto ou o PC alterou este material. Toque em «Carregar dados da nuvem» e tente novamente.',
    submitAtendimentoComandoToCloud: vi.fn(),
  };
});

vi.mock('./snapshot', () => ({
  fetchSnapshotSlicesForWrite: vi.fn(),
}));

vi.mock('./mobileSyncHealth', () => ({
  reportMobileSyncHealthToCloud: vi.fn(),
}));

import { IsoProSnapshotConflictError, submitAtendimentoComandoToCloud } from './isoProSnapshot';
import { fetchSnapshotSlicesForWrite } from './snapshot';

const MERGE_KEYS = ['documentos', 'atendimentoHistorico', 'atendimentoLotes'] as const;

describe('buildAtendimentoIdempotencyKey', () => {
  it('gera chave estavel por lote, documento e quantidade', () => {
    const key = buildAtendimentoIdempotencyKey({
      loteId: 11,
      loteNumero: 'ATD-001',
      documentoId: 'doc-1',
      codigoMaterial: 'M1',
      quantidade: 2,
    });
    expect(key).toBe('at-11-ATD-001-doc-1-M1-2');
  });
});

describe('atendimentoComando queue', () => {
  beforeEach(() => {
    storage.clear();
    vi.mocked(submitAtendimentoComandoToCloud).mockReset();
    vi.mocked(fetchSnapshotSlicesForWrite).mockReset();
  });

  it('enfileira comando em falha de rede', async () => {
    vi.mocked(submitAtendimentoComandoToCloud).mockRejectedValue(new Error('Network request failed'));

    const result = await syncAtendimentoComando({
      patch: { documentos: [{ id: 'd1' }] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'at-1-ATD-1-doc-na-M1-1',
    });

    expect(result.error).toBeNull();
    expect(result.queued).toBe(true);
    expect(await getAtendimentoComandoQueueSize()).toBe(1);
  });

  it('nao duplica idempotency key na fila', async () => {
    await enqueueAtendimentoComando({
      patch: { documentos: [] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: 'a',
      idempotencyKey: 'same-key',
    });
    await enqueueAtendimentoComando({
      patch: { documentos: [] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: 'b',
      idempotencyKey: 'same-key',
    });
    expect(await getAtendimentoComandoQueueSize()).toBe(1);
  });

  it('flushAtendimentoComandoQueue envia fila com baseline fresco', async () => {
    await enqueueAtendimentoComando({
      patch: { atendimentoHistorico: [{ id: 2 }] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: 'old',
      idempotencyKey: 'at-flush',
    });

    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { documentos: [] },
      updatedAt: 'fresh-ts',
      error: null,
    });
    vi.mocked(submitAtendimentoComandoToCloud).mockResolvedValue({
      ok: true,
      updatedAt: '2026-07-05T12:00:00.000Z',
      usedCommandRpc: true,
    });

    const flush = await flushAtendimentoComandoQueue();
    expect(flush.flushed).toBe(1);
    expect(flush.remaining).toBe(0);
    expect(await getAtendimentoComandoQueueSize()).toBe(0);
    expect(submitAtendimentoComandoToCloud).toHaveBeenCalledWith(
      { atendimentoHistorico: [{ id: 2 }] },
      'fresh-ts',
      'at-flush',
    );
  });

  it('enfileira quando RPC de comando nao existe (sem fallback de patch)', async () => {
    vi.mocked(submitAtendimentoComandoToCloud).mockResolvedValue({ ok: false, missing: true });

    const result = await syncAtendimentoComando({
      patch: { atendimentoHistorico: [{ id: 3 }] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: 'baseline',
      idempotencyKey: 'at-enqueue-missing-rpc',
    });

    expect(result.error).toBeNull();
    expect(result.queued).toBe(true);
    expect(await getAtendimentoComandoQueueSize()).toBe(1);
  });

  it('enfileira quando comando falha por rede', async () => {
    vi.mocked(submitAtendimentoComandoToCloud).mockRejectedValue(new Error('TypeError: Network request failed'));

    const result = await syncAtendimentoComando({
      patch: { atendimentoHistorico: [{ id: 4 }] },
      mergeKeys: MERGE_KEYS,
      baselineUpdatedAt: 'baseline',
      idempotencyKey: 'at-net',
    });

    expect(result.error).toBeNull();
    expect(result.queued).toBe(true);
    expect(await getAtendimentoComandoQueueSize()).toBe(1);
  });
});

describe('persistirAtendimentoOptimistic', () => {
  beforeEach(() => {
    storage.clear();
    setAtendimentoCloudBaselineCursor(null);
    vi.mocked(submitAtendimentoComandoToCloud).mockReset();
    vi.mocked(fetchSnapshotSlicesForWrite).mockReset();
  });

  it('calcula patch delta minimo antes de enviar comando', async () => {
    vi.mocked(submitAtendimentoComandoToCloud).mockResolvedValue({
      ok: true,
      updatedAt: '2026-07-05T12:00:00.000Z',
      usedCommandRpc: true,
    });

    const antes: IsoSnapshotPayload = {
      documentos: [{ id: 'd1', itens: [{ codigo: 'M1', quantidade: 5, quantidadeAtendida: 0 }] }],
      atendimentoHistorico: [],
      atendimentoLotes: [],
    };
    const depois: IsoSnapshotPayload = {
      ...antes,
      documentos: [{ id: 'd1', itens: [{ codigo: 'M1', quantidade: 5, quantidadeAtendida: 1 }] }],
      atendimentoHistorico: [{ id: 1, loteNumero: 'ATD-1', codigo: 'M1', quantidade: 1 }],
      atendimentoLotes: [{ id: 10, numero: 'ATD-1' }],
    };

    const result = await persistirAtendimentoOptimistic({
      payloadAtual: antes,
      payloadNext: depois,
      baselineUpdatedAt: 'baseline',
      idempotencyKey: 'at-10-ATD-1-d1-M1-1',
    });

    expect(result.error).toBeNull();
    expect(submitAtendimentoComandoToCloud).toHaveBeenCalledWith(
      expect.objectContaining({
        documentos: expect.arrayContaining([expect.objectContaining({ id: 'd1' })]),
        atendimentoHistorico: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
      }),
      'baseline',
      'at-10-ATD-1-d1-M1-1',
    );
  });

  it('rebaseia e reenvia apos conflito de snapshot', async () => {
    vi.mocked(submitAtendimentoComandoToCloud)
      .mockRejectedValueOnce(new IsoProSnapshotConflictError())
      .mockResolvedValueOnce({
        ok: true,
        updatedAt: '2026-07-06T22:00:00.000Z',
        usedCommandRpc: true,
      });
    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { atendimentoHistorico: [], atendimentoLotes: [], documentos: [] },
      updatedAt: '2026-07-06T21:59:00.000Z',
      error: null,
    });

    const antes: IsoSnapshotPayload = {
      documentos: [{ id: 'd1', itens: [{ codigo: 'M1', quantidade: 5, quantidadeAtendida: 0 }] }],
      atendimentoHistorico: [],
      atendimentoLotes: [],
    };
    const depois: IsoSnapshotPayload = {
      ...antes,
      documentos: [{ id: 'd1', itens: [{ codigo: 'M1', quantidade: 5, quantidadeAtendida: 1 }] }],
      atendimentoHistorico: [{ id: 9, loteNumero: 'ATD-9', codigo: 'M1', quantidade: 1 }],
      atendimentoLotes: [{ id: 10, numero: 'ATD-9' }],
    };

    const result = await persistirAtendimentoOptimistic({
      payloadAtual: antes,
      payloadNext: depois,
      baselineUpdatedAt: '2026-07-06T21:00:00.000Z',
      idempotencyKey: 'at-retry',
    });

    expect(result.error).toBeNull();
    expect(result.updatedAt).toBe('2026-07-06T22:00:00.000Z');
    expect(submitAtendimentoComandoToCloud).toHaveBeenCalledTimes(2);
  });

  it('aceita delta vazio como ja sincronizado (idempotente)', async () => {
    const payload: IsoSnapshotPayload = {
      documentos: [],
      atendimentoHistorico: [],
      atendimentoLotes: [],
    };
    const result = await persistirAtendimentoOptimistic({
      payloadAtual: payload,
      payloadNext: payload,
      baselineUpdatedAt: '2026-07-06T21:00:00.000Z',
      idempotencyKey: 'at-empty',
    });
    expect(result.error).toBeNull();
    expect(result.updatedAt).toBe('2026-07-06T21:00:00.000Z');
    expect(submitAtendimentoComandoToCloud).not.toHaveBeenCalled();
  });
});

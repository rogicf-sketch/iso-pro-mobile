import { describe, expect, it, vi } from 'vitest';
import type { DocumentoPlanejamento } from 'iso-pro-shared';
import {
  mergeDocumentosPlanejamentoNoPayload,
  prefetchDocumentosParaAtendimento,
} from './prefetchDocumentosAtendimento';

vi.mock('./isoProSnapshot', () => ({
  listDocumentosPlanejamentoResumoFromCloud: vi.fn(),
}));

vi.mock('./snapshot', () => ({
  fetchSnapshotSlices: vi.fn(),
}));

import { listDocumentosPlanejamentoResumoFromCloud } from './isoProSnapshot';
import { fetchSnapshotSlices } from './snapshot';

describe('mergeDocumentosPlanejamentoNoPayload', () => {
  it('prefere documento com mais itens ao fundir', () => {
    const base: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [{ id: 'i1', codigo: 'M1', quantidade: 1 }] },
    ];
    const extra: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [] },
      { id: 'd2', numero: 'AQ-2', revisao: 'A', itens: [] },
    ];
    const merged = mergeDocumentosPlanejamentoNoPayload(base, extra);
    expect(merged).toHaveLength(2);
    expect(merged.find((d) => d.id === 'd1')?.itens).toHaveLength(1);
  });

  it('devolve a mesma referência quando nada muda (evita loop de re-render no Atendimento)', () => {
    const base: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [{ id: 'i1', codigo: 'M1', quantidade: 1 }] },
      { id: 'd2', numero: 'AQ-2', revisao: 'A', itens: [{ id: 'i2', codigo: 'M2', quantidade: 2 }] },
    ];
    // Mesmo conteúdo vindo da nuvem outra vez (objetos novos, mesma completude).
    const extra: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [{ id: 'i1', codigo: 'M1', quantidade: 1 }] },
    ];
    expect(mergeDocumentosPlanejamentoNoPayload(base, extra)).toBe(base);
    expect(mergeDocumentosPlanejamentoNoPayload(base, [])).toBe(base);
  });

  it('devolve nova lista quando a nuvem traz documento novo ou mais completo', () => {
    const base: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [] },
    ];
    const comItens: DocumentoPlanejamento[] = [
      { id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [{ id: 'i1', codigo: 'M1', quantidade: 1 }] },
    ];
    const out1 = mergeDocumentosPlanejamentoNoPayload(base, comItens);
    expect(out1).not.toBe(base);
    expect(out1[0]?.itens).toHaveLength(1);

    const out2 = mergeDocumentosPlanejamentoNoPayload(base, [
      { id: 'd9', numero: 'AQ-9', revisao: 'A', itens: [] },
    ]);
    expect(out2).not.toBe(base);
    expect(out2).toHaveLength(2);
  });
});

describe('prefetchDocumentosParaAtendimento', () => {
  it('usa RPC resumo leve quando disponivel', async () => {
    vi.mocked(listDocumentosPlanejamentoResumoFromCloud).mockResolvedValue({
      documentos: [{ id: 'd1', numero: 'AQ-1', revisao: 'A', itens: [] }],
      updatedAt: '2026-07-05T21:00:00.000Z',
      missing: false,
    });

    const merged: DocumentoPlanejamento[] = [];
    const result = await prefetchDocumentosParaAtendimento((docs) => merged.push(...docs));

    expect(result).toEqual({ count: 1, source: 'resumo' });
    expect(fetchSnapshotSlices).not.toHaveBeenCalled();
    expect(merged).toHaveLength(1);
  });

  it('cai na fatia documentos quando RPC resumo nao existe', async () => {
    vi.mocked(listDocumentosPlanejamentoResumoFromCloud).mockResolvedValue({
      documentos: [],
      updatedAt: null,
      missing: true,
    });
    vi.mocked(fetchSnapshotSlices).mockResolvedValue({
      payload: {
        documentos: [{ id: 'd9', numero: 'SPD-1', revisao: 'B', itens: [] }],
      },
      updatedAt: '2026-07-05T21:00:00.000Z',
      error: null,
    });

    const merged: DocumentoPlanejamento[] = [];
    const result = await prefetchDocumentosParaAtendimento((docs) => merged.push(...docs));

    expect(result.source).toBe('full');
    expect(merged[0]?.numero).toBe('SPD-1');
  });
});

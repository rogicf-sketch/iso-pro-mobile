import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

import { buildAtendimentoSnapshotPatchDelta } from './atendimentoSnapshotPatch';
import { mergeSnapshotRowsById } from './snapshotPatchMerge';

function payloadBase(): IsoSnapshotPayload {
  return {
    documentos: [
      {
        id: 'doc-1',
        numero: 'PL-1',
        itens: [{ id: 'i1', codigo: 'M1', quantidade: 10, quantidadeAtendida: 0 }],
      },
      {
        id: 'doc-2',
        numero: 'PL-2',
        itens: [{ id: 'i2', codigo: 'M2', quantidade: 5, quantidadeAtendida: 1 }],
      },
    ],
    atendimentoHistorico: [{ id: 1, loteNumero: 'ATD-OLD' }],
    atendimentoLotes: [{ id: 10, numero: 'ATD-OLD' }],
    configuracoesSistema: { sequenciaAtendimento: 5 },
  };
}

describe('buildAtendimentoSnapshotPatchDelta', () => {
  it('envia só documento alterado e linhas novas de histórico/lote', () => {
    const baseline = payloadBase();
    const next: IsoSnapshotPayload = {
      ...baseline,
      documentos: [
        {
          id: 'doc-1',
          numero: 'PL-1',
          itens: [{ id: 'i1', codigo: 'M1', quantidade: 10, quantidadeAtendida: 2 }],
        },
        baseline.documentos![1]!,
      ],
      atendimentoHistorico: [
        ...(baseline.atendimentoHistorico ?? []),
        { id: 2, loteNumero: 'ATD-NEW', codigo: 'M1', quantidade: 2 },
      ],
      atendimentoLotes: [
        ...(baseline.atendimentoLotes ?? []),
        { id: 11, numero: 'ATD-NEW' },
      ],
      configuracoesSistema: { sequenciaAtendimento: 6 },
      dataAtualizacao: '2026-07-05T12:00:00.000Z',
    };

    const { patch, mergeKeys, patchWithoutMerge, comandoPatch } = buildAtendimentoSnapshotPatchDelta(baseline, next);
    expect(mergeKeys).toEqual(['documentos', 'atendimentoHistorico', 'atendimentoLotes']);
    expect(comandoPatch.documentos).toEqual(patch.documentos);
    expect(patch.documentos).toHaveLength(1);
    expect((patch.documentos as { id: string }[])[0]?.id).toBe('doc-1');
    expect(patch.atendimentoHistorico).toHaveLength(1);
    expect((patch.atendimentoHistorico as { id: number }[])[0]?.id).toBe(2);
    expect(patch.atendimentoLotes).toHaveLength(1);
    expect(patch.configuracoesSistema).toEqual({ sequenciaAtendimento: 6 });
    expect(patchWithoutMerge?.documentos).toHaveLength(2);
    expect(patchWithoutMerge?.atendimentoHistorico).toHaveLength(2);
  });

  it('detecta linhas novas por id mesmo se o array nao cresceu linearmente', () => {
    const baseline: IsoSnapshotPayload = {
      documentos: [],
      atendimentoHistorico: [
        { id: 1, loteNumero: 'ATD-A' },
        { id: 3, loteNumero: 'ATD-C' },
      ],
      atendimentoLotes: [{ id: 10, numero: 'ATD-A' }],
    };
    const next: IsoSnapshotPayload = {
      ...baseline,
      atendimentoHistorico: [
        { id: 1, loteNumero: 'ATD-A' },
        { id: 2, loteNumero: 'ATD-B' },
        { id: 3, loteNumero: 'ATD-C' },
      ],
      atendimentoLotes: [
        { id: 10, numero: 'ATD-A' },
        { id: 11, numero: 'ATD-B' },
      ],
    };
    const { patch } = buildAtendimentoSnapshotPatchDelta(baseline, next);
    expect((patch.atendimentoHistorico as { id: number }[]).map((h) => h.id)).toEqual([2]);
    expect((patch.atendimentoLotes as { id: number }[]).map((l) => l.id)).toEqual([11]);
  });
});

describe('mergeSnapshotRowsById', () => {
  it('substitui por id e mantém os restantes', () => {
    const merged = mergeSnapshotRowsById(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 1 },
      ],
      [{ id: 'b', v: 2 }],
    );
    expect(merged).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ]);
  });
});

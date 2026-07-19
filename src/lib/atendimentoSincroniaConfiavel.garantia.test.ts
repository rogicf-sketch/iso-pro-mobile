import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

vi.mock('./atendimentoComando', () => ({
  flushAtendimentoComandoQueue: vi.fn(async () => ({
    flushed: 0,
    remaining: 0,
    hadErrors: false,
    lastUpdatedAt: null,
  })),
  getAtendimentoComandoQueueSize: vi.fn(async () => 0),
  setAtendimentoCloudBaselineCursor: vi.fn(),
}));

vi.mock('./snapshot', () => ({
  fetchSnapshotSlices: vi.fn(),
}));

vi.mock('./atendimentoReconciliacao', () => ({
  reconciliarSessaoAtendimentoNaNuvem: vi.fn(),
  resumoConfirmacaoSessaoNuvem: vi.fn(),
}));

import { fetchSnapshotSlices } from './snapshot';
import { reconciliarSessaoAtendimentoNaNuvem } from './atendimentoReconciliacao';
import { garantirAtendimentoSincronizadoNaNuvem } from './atendimentoSincroniaConfiavel';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';

const LOTE = { loteId: 77, loteNumero: 'ATD-20260719-00077' };
const linhas: LinhaSessaoAtendimento[] = [
  {
    tipo: 'codigo_barras',
    loteNumero: LOTE.loteNumero,
    material: { codigo: 'M1', descricao: 'Material 1', unidade: 'PC' },
    atendidoTotal: 1,
  },
  {
    tipo: 'codigo_barras',
    loteNumero: LOTE.loteNumero,
    material: { codigo: 'M2', descricao: 'Material 2', unidade: 'PC' },
    atendidoTotal: 1,
  },
];

function historico(qtd: number) {
  return Array.from({ length: qtd }, (_, i) => ({
    id: i + 1,
    loteId: LOTE.loteId,
    loteNumero: LOTE.loteNumero,
    codigo: `M${i + 1}`,
    quantidade: 1,
  }));
}

describe('garantirAtendimentoSincronizadoNaNuvem — finalização rápida', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirma com uma única leitura leve quando todos os itens já chegaram', async () => {
    vi.mocked(fetchSnapshotSlices).mockResolvedValue({
      payload: {
        atendimentoHistorico: historico(2),
        atendimentoLotes: [{ id: LOTE.loteId, numero: LOTE.loteNumero }],
      } as IsoSnapshotPayload,
      updatedAt: '2026-07-19T13:30:00.000Z',
      error: null,
    });

    const result = await garantirAtendimentoSincronizadoNaNuvem({
      payloadLocal: { atendimentoHistorico: historico(2), documentos: [] } as IsoSnapshotPayload,
      loteRef: LOTE,
      linhasSessao: linhas,
    });

    expect(result.ok).toBe(true);
    expect(fetchSnapshotSlices).toHaveBeenCalledTimes(1);
    expect(fetchSnapshotSlices).toHaveBeenCalledWith(
      ['atendimentoHistorico', 'atendimentoLotes'],
      { bypassCache: true },
    );
    expect(reconciliarSessaoAtendimentoNaNuvem).not.toHaveBeenCalled();
  });

  it('só aciona reparação pesada quando a leitura autoritativa ainda está incompleta', async () => {
    vi.mocked(fetchSnapshotSlices).mockResolvedValue({
      payload: { atendimentoHistorico: historico(1), atendimentoLotes: [] } as IsoSnapshotPayload,
      updatedAt: '2026-07-19T13:30:00.000Z',
      error: null,
    });
    vi.mocked(reconciliarSessaoAtendimentoNaNuvem).mockResolvedValue({
      ok: true,
      itensSessao: 2,
      itensNuvem: 2,
      tentativas: 1,
      payloadHistorico: { atendimentoHistorico: historico(2) } as IsoSnapshotPayload,
      updatedAt: '2026-07-19T13:30:01.000Z',
    });

    const result = await garantirAtendimentoSincronizadoNaNuvem({
      payloadLocal: { atendimentoHistorico: historico(2), documentos: [] } as IsoSnapshotPayload,
      loteRef: LOTE,
      linhasSessao: linhas,
    });

    expect(result.ok).toBe(true);
    expect(fetchSnapshotSlices).toHaveBeenCalledTimes(1);
    expect(reconciliarSessaoAtendimentoNaNuvem).toHaveBeenCalledTimes(1);
  });
});

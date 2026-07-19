import { describe, expect, it, vi } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

vi.mock('./atendimentoComando', () => ({
  flushAtendimentoComandoQueue: vi.fn(async () => ({
    flushed: 0,
    remaining: 0,
    hadErrors: false,
    lastUpdatedAt: null,
  })),
  getAtendimentoComandoQueueSize: vi.fn(async () => 0),
  persistirAtendimentoOptimistic: vi.fn(),
  waitForAtendimentoSyncIdle: vi.fn(async () => undefined),
}));

vi.mock('./snapshot', () => ({
  fetchSnapshotSlices: vi.fn(),
}));

import { persistirAtendimentoOptimistic } from './atendimentoComando';
import { fetchSnapshotSlices } from './snapshot';
import {
  reconciliarSessaoAtendimentoNaNuvem,
  resumoConfirmacaoSessaoNuvem,
} from './atendimentoReconciliacao';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';

const LOTE = { loteId: 100, loteNumero: 'ATD-20260706-00074' };

describe('resumoConfirmacaoSessaoNuvem', () => {
  it('indica itens em falta na nuvem', () => {
    const payload = {
      atendimentoHistorico: Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        loteId: LOTE.loteId,
        loteNumero: LOTE.loteNumero,
      })),
    } as IsoSnapshotPayload;
    const sessao: LinhaSessaoAtendimento[] = Array.from({ length: 10 }, () => ({
      tipo: 'codigo_barras',
      loteNumero: LOTE.loteNumero,
      material: { codigo: 'M', descricao: 'X', unidade: 'PÇ' },
      atendidoTotal: 1,
    }));
    const r = resumoConfirmacaoSessaoNuvem(payload, sessao, LOTE);
    expect(r?.itensSessao).toBe(10);
    expect(r?.itensNuvem).toBe(4);
    expect(r?.emDia).toBe(false);
    expect(r?.faltam).toBe(6);
  });
});

describe('reconciliarSessaoAtendimentoNaNuvem', () => {
  it('reenvia delta até nuvem alcançar a sessão', async () => {
    const localHistorico = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      loteId: LOTE.loteId,
      loteNumero: LOTE.loteNumero,
      codigo: `M${i}`,
      quantidade: 1,
    }));
    const payloadLocal = {
      atendimentoHistorico: localHistorico,
      atendimentoLotes: [{ id: 10, numero: LOTE.loteNumero }],
      documentos: [],
    } as IsoSnapshotPayload;
    const sessao: LinhaSessaoAtendimento[] = Array.from({ length: 10 }, () => ({
      tipo: 'codigo_barras',
      loteNumero: LOTE.loteNumero,
      material: { codigo: 'M', descricao: 'X', unidade: 'PÇ' },
      atendidoTotal: 1,
    }));

    vi.mocked(fetchSnapshotSlices)
      .mockResolvedValueOnce({
        payload: {
          atendimentoHistorico: localHistorico.slice(0, 4),
          atendimentoLotes: [{ id: 10, numero: LOTE.loteNumero }],
        },
        updatedAt: '2026-07-06T22:00:00.000Z',
        error: null,
      })
      .mockResolvedValueOnce({
        payload: { atendimentoHistorico: localHistorico },
        updatedAt: '2026-07-06T22:00:01.000Z',
        error: null,
      });

    vi.mocked(persistirAtendimentoOptimistic).mockResolvedValue({
      error: null,
      conflict: false,
      updatedAt: '2026-07-06T22:00:01.000Z',
      queued: false,
    });

    const r = await reconciliarSessaoAtendimentoNaNuvem({
      payloadLocal,
      loteRef: LOTE,
      linhasSessao: sessao,
    });

    expect(r.ok).toBe(true);
    expect(r.itensNuvem).toBe(10);
    expect(persistirAtendimentoOptimistic).toHaveBeenCalled();
  });
});

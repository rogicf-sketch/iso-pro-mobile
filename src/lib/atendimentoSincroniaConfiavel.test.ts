import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  contarHistoricoLote,
  contarItensOperacaoRecibo,
  validarReciboSessaoContraHistorico,
} from './atendimentoReciboValidacao';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';

const LOTE = { loteId: 100, loteNumero: 'ATD-20260705-00078' };

describe('contarHistoricoLote', () => {
  it('conta linhas do mesmo protocolo no historico', () => {
    const payload = {
      atendimentoHistorico: [
        { id: 1, loteId: 100, loteNumero: LOTE.loteNumero, codigo: 'A' },
        { id: 2, loteId: 100, loteNumero: LOTE.loteNumero, codigo: 'B' },
        { id: 3, loteId: 99, loteNumero: 'ATD-OUTRO', codigo: 'C' },
      ],
    } as IsoSnapshotPayload;
    expect(contarHistoricoLote(payload, LOTE)).toBe(2);
  });
});

describe('validarReciboSessaoContraHistorico', () => {
  const sessao5: LinhaSessaoAtendimento[] = Array.from({ length: 5 }, (_, i) => ({
    tipo: 'codigo_barras',
    loteNumero: LOTE.loteNumero,
    material: { codigo: `M${i}`, descricao: `Item ${i}`, unidade: 'PÇ' },
    atendidoTotal: 1,
  }));

  it('bloqueia recibo quando nuvem tem menos itens que a sessao', () => {
    const payload = {
      atendimentoHistorico: Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        loteId: LOTE.loteId,
        loteNumero: LOTE.loteNumero,
        codigo: `M${i}`,
        quantidade: 1,
      })),
    } as IsoSnapshotPayload;
    expect(contarItensOperacaoRecibo(sessao5)).toBe(5);
    const r = validarReciboSessaoContraHistorico(payload, sessao5, LOTE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.itensSessao).toBe(5);
      expect(r.itensNuvem).toBe(4);
      expect(r.motivo).toContain('Faltam 1 item');
    }
  });

  it('permite recibo quando nuvem tem todos os itens da sessao', () => {
    const payload = {
      atendimentoHistorico: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        loteId: LOTE.loteId,
        loteNumero: LOTE.loteNumero,
        codigo: `M${i}`,
        quantidade: 1,
        descricao: `Item ${i}`,
        unidade: 'PÇ',
      })),
    } as IsoSnapshotPayload;
    const r = validarReciboSessaoContraHistorico(payload, sessao5, LOTE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itensNuvem).toBe(5);
      expect(r.linhasRecibo.length).toBeGreaterThan(0);
    }
  });

  it('bloqueia quando protocolo da sessao esta em falta', () => {
    const r = validarReciboSessaoContraHistorico({} as IsoSnapshotPayload, sessao5, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('Protocolo');
  });
});

import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  linhasReciboSessaoComFallbackHistorico,
  type LinhaSessaoAtendimento,
} from './registrarAtendimento';

export function contarItensOperacaoRecibo(linhas: LinhaSessaoAtendimento[]): number {
  return linhas.reduce((acc, l) => acc + (l.tipo === 'documento' ? l.itens.length : 1), 0);
}

export function contarHistoricoLote(
  payload: IsoSnapshotPayload,
  lote: { loteId: number; loteNumero: string },
): number {
  const num = String(lote.loteNumero ?? '').trim();
  return ((payload.atendimentoHistorico ?? []) as Record<string, unknown>[]).filter(
    (h) => h.loteId === lote.loteId && String(h.loteNumero ?? '').trim() === num,
  ).length;
}

export type ValidacaoReciboAtendimento =
  | { ok: true; linhasRecibo: LinhaSessaoAtendimento[]; itensNuvem: number }
  | { ok: false; motivo: string; itensNuvem: number; itensSessao: number };

/** Só emite recibo se o histórico na nuvem tiver pelo menos tantos itens quanto a sessão. */
export function validarReciboSessaoContraHistorico(
  payload: IsoSnapshotPayload,
  linhasSessao: LinhaSessaoAtendimento[],
  loteRef: { loteId: number; loteNumero: string } | null,
): ValidacaoReciboAtendimento {
  if (!loteRef?.loteNumero || typeof loteRef.loteId !== 'number') {
    return { ok: false, motivo: 'Protocolo da sessão em falta.', itensNuvem: 0, itensSessao: 0 };
  }
  const itensSessao = contarItensOperacaoRecibo(
    linhasSessao.filter((l) => String(l.loteNumero ?? '').trim() === String(loteRef.loteNumero).trim()),
  );
  const itensNuvem = contarHistoricoLote(payload, loteRef);
  const linhasRecibo = linhasReciboSessaoComFallbackHistorico(payload, linhasSessao, loteRef);

  if (itensNuvem === 0) {
    return {
      ok: false,
      motivo: 'Nenhum item deste protocolo chegou à nuvem ainda.',
      itensNuvem,
      itensSessao,
    };
  }
  if (itensNuvem < itensSessao) {
    return {
      ok: false,
      motivo: `Faltam ${itensSessao - itensNuvem} item(ns) na nuvem (${itensNuvem} de ${itensSessao} registados nesta sessão).`,
      itensNuvem,
      itensSessao,
    };
  }
  return { ok: true, linhasRecibo, itensNuvem };
}

import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  flushAtendimentoComandoQueue,
  getAtendimentoComandoQueueSize,
  persistirAtendimentoOptimistic,
  waitForAtendimentoSyncIdle,
} from './atendimentoComando';
import { mergeAtendimentoPayloadPreservandoLocal } from './mergeAtendimentoPayloadLocal';
import {
  contarHistoricoLote,
  contarItensOperacaoRecibo,
} from './atendimentoReciboValidacao';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';
import { fetchSnapshotSlices } from './snapshot';

const RECONCILE_MAX_ROUNDS = 8;

export type ReconciliacaoAtendimentoResult = {
  ok: boolean;
  itensSessao: number;
  itensNuvem: number;
  tentativas: number;
  error?: string;
};

export type ResumoConfirmacaoSessaoNuvem = {
  itensSessao: number;
  itensNuvem: number;
  emDia: boolean;
  faltam: number;
};

export function resumoConfirmacaoSessaoNuvem(
  payload: IsoSnapshotPayload | null,
  linhasSessao: LinhaSessaoAtendimento[],
  loteRef: { loteId: number; loteNumero: string } | null,
): ResumoConfirmacaoSessaoNuvem | null {
  if (!payload || !loteRef?.loteNumero) return null;
  const linhasLote = linhasSessao.filter(
    (l) => String(l.loteNumero ?? '').trim() === String(loteRef.loteNumero).trim(),
  );
  const itensSessao = contarItensOperacaoRecibo(linhasLote);
  const itensNuvem = contarHistoricoLote(payload, loteRef);
  return {
    itensSessao,
    itensNuvem,
    emDia: itensNuvem >= itensSessao,
    faltam: Math.max(0, itensSessao - itensNuvem),
  };
}

function montarPayloadNuvemAtual(
  payloadLocal: IsoSnapshotPayload,
  slice: Partial<IsoSnapshotPayload> | null,
): IsoSnapshotPayload {
  return {
    ...payloadLocal,
    ...(slice ?? {}),
    documentos: slice?.documentos ?? payloadLocal.documentos,
    atendimentoHistorico: slice?.atendimentoHistorico ?? payloadLocal.atendimentoHistorico,
    atendimentoLotes: slice?.atendimentoLotes ?? payloadLocal.atendimentoLotes,
    configuracoesSistema: slice?.configuracoesSistema ?? payloadLocal.configuracoesSistema,
  };
}

/**
 * Reenvia automaticamente itens da sessão que ainda não chegaram ao histórico na nuvem.
 * Padrão outbox enterprise: retoma de onde parou sem apagar a sessão local.
 */
export async function reconciliarSessaoAtendimentoNaNuvem(input: {
  payloadLocal: IsoSnapshotPayload;
  loteRef: { loteId: number; loteNumero: string };
  linhasSessao: LinhaSessaoAtendimento[];
}): Promise<ReconciliacaoAtendimentoResult> {
  const itensSessao = contarItensOperacaoRecibo(
    input.linhasSessao.filter(
      (l) => String(l.loteNumero ?? '').trim() === String(input.loteRef.loteNumero).trim(),
    ),
  );

  if (itensSessao === 0) {
    return { ok: true, itensSessao: 0, itensNuvem: 0, tentativas: 0 };
  }

  let lastItensNuvem = 0;
  let lastError: string | undefined;

  for (let round = 0; round < RECONCILE_MAX_ROUNDS; round++) {
    await waitForAtendimentoSyncIdle();
    const flush = await flushAtendimentoComandoQueue();
    await waitForAtendimentoSyncIdle();

    const pending = await getAtendimentoComandoQueueSize();
    if (pending > 0 || flush.remaining > 0) {
      lastError = `${Math.max(pending, flush.remaining)} baixa(s) ainda na fila offline.`;
      continue;
    }
    if (flush.hadErrors) {
      lastError = 'Falha ao enviar fila offline. Verifique a ligação.';
      continue;
    }

    const { payload: slice, updatedAt, error } = await fetchSnapshotSlices(
      ['atendimentoHistorico', 'atendimentoLotes', 'documentos', 'configuracoesSistema'],
      { bypassCache: true },
    );
    if (error || !updatedAt) {
      return {
        ok: false,
        itensSessao,
        itensNuvem: lastItensNuvem,
        tentativas: round + 1,
        error: error ?? 'Não foi possível ler a nuvem.',
      };
    }

    const cloudPayload = montarPayloadNuvemAtual(input.payloadLocal, slice ?? null);
    lastItensNuvem = contarHistoricoLote(cloudPayload, input.loteRef);

    if (lastItensNuvem >= itensSessao) {
      return {
        ok: true,
        itensSessao,
        itensNuvem: lastItensNuvem,
        tentativas: round + 1,
      };
    }

    const payloadAlvo = mergeAtendimentoPayloadPreservandoLocal(cloudPayload, input.payloadLocal);
    const idempotencyKey = `reconcile-${input.loteRef.loteNumero}-n${lastItensNuvem}-r${round}`;

    const result = await persistirAtendimentoOptimistic({
      payloadAtual: cloudPayload,
      payloadNext: payloadAlvo,
      baselineUpdatedAt: updatedAt,
      idempotencyKey,
    });

    if (result.queued) {
      lastError = 'Baixas enfileiradas offline — aguarde ligação.';
      continue;
    }

    if (result.error) {
      lastError = result.error;
      if (result.conflict) continue;
      return {
        ok: false,
        itensSessao,
        itensNuvem: lastItensNuvem,
        tentativas: round + 1,
        error: result.error,
      };
    }

    await waitForAtendimentoSyncIdle();
  }

  return {
    ok: false,
    itensSessao,
    itensNuvem: lastItensNuvem,
    tentativas: RECONCILE_MAX_ROUNDS,
    error:
      lastError ??
      `Ainda faltam ${Math.max(0, itensSessao - lastItensNuvem)} item(ns) na nuvem após reconciliação automática.`,
  };
}

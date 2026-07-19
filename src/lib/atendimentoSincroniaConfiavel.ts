import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  flushAtendimentoComandoQueue,
  getAtendimentoComandoQueueSize,
  setAtendimentoCloudBaselineCursor,
  waitForAtendimentoSyncIdle,
} from './atendimentoComando';
export {
  contarHistoricoLote,
  contarItensOperacaoRecibo,
  validarReciboSessaoContraHistorico,
  type ValidacaoReciboAtendimento,
} from './atendimentoReciboValidacao';
export {
  reconciliarSessaoAtendimentoNaNuvem,
  resumoConfirmacaoSessaoNuvem,
  type ReconciliacaoAtendimentoResult,
  type ResumoConfirmacaoSessaoNuvem,
} from './atendimentoReconciliacao';
import { fetchSnapshotSlices } from './snapshot';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';
import { mergeAtendimentoPayloadPreservandoLocal } from './mergeAtendimentoPayloadLocal';
import { reconciliarSessaoAtendimentoNaNuvem } from './atendimentoReconciliacao';
import { contarHistoricoLote, contarItensOperacaoRecibo } from './atendimentoReciboValidacao';

export type GarantiaSyncAtendimentoResult =
  | {
      ok: true;
      updatedAt: string | null;
      payloadHistorico: IsoSnapshotPayload | null;
      itensSessao: number;
      itensNuvem: number;
    }
  | { ok: false; error: string; pendingQueue: number; itensSessao?: number; itensNuvem?: number };

export type GarantirAtendimentoSyncInput = {
  payloadLocal: IsoSnapshotPayload | null;
  loteRef?: { loteId: number; loteNumero: string } | null;
  linhasSessao?: LinhaSessaoAtendimento[];
};

/** Espera sync, reconcilia itens em falta e recarrega histórico da nuvem antes do recibo. */
export async function garantirAtendimentoSincronizadoNaNuvem(
  input: GarantirAtendimentoSyncInput | IsoSnapshotPayload | null,
): Promise<GarantiaSyncAtendimentoResult> {
  const opts: GarantirAtendimentoSyncInput =
    input != null && typeof input === 'object' && 'payloadLocal' in input
      ? (input as GarantirAtendimentoSyncInput)
      : { payloadLocal: input as IsoSnapshotPayload | null };

  const payloadLocal = opts.payloadLocal;
  if (!payloadLocal) {
    return { ok: false, error: 'Carregue os dados da nuvem primeiro.', pendingQueue: 0 };
  }

  await waitForAtendimentoSyncIdle();
  const flush = await flushAtendimentoComandoQueue();
  await waitForAtendimentoSyncIdle();

  let pending = await getAtendimentoComandoQueueSize();
  if (pending > 0 || flush.remaining > 0) {
    return {
      ok: false,
      error: `${Math.max(pending, flush.remaining)} baixa(s) ainda não foram enviadas. Verifique a ligação e tente de novo.`,
      pendingQueue: Math.max(pending, flush.remaining),
    };
  }
  if (flush.hadErrors) {
    return {
      ok: false,
      error: 'Falha ao sincronizar baixas com a nuvem. Recarregue os dados e tente de novo.',
      pendingQueue: 0,
    };
  }

  if (opts.loteRef?.loteNumero && opts.linhasSessao?.length) {
    const reconcile = await reconciliarSessaoAtendimentoNaNuvem({
      payloadLocal,
      loteRef: opts.loteRef,
      linhasSessao: opts.linhasSessao,
    });
    if (!reconcile.ok) {
      return {
        ok: false,
        error: reconcile.error ?? 'Reconciliação automática não concluiu.',
        pendingQueue: 0,
        itensSessao: reconcile.itensSessao,
        itensNuvem: reconcile.itensNuvem,
      };
    }
  }

  const { payload: slice, updatedAt, error } = await fetchSnapshotSlices(
    ['atendimentoHistorico', 'atendimentoLotes', 'documentos'],
    { bypassCache: true },
  );
  if (error) {
    return {
      ok: false,
      error: `Não foi possível confirmar na nuvem: ${error}`,
      pendingQueue: 0,
    };
  }

  const merged = mergeAtendimentoPayloadPreservandoLocal(
    {
      ...payloadLocal,
      ...(slice ?? {}),
    },
    payloadLocal,
  );

  if (updatedAt) {
    setAtendimentoCloudBaselineCursor(updatedAt);
  }

  pending = await getAtendimentoComandoQueueSize();

  const itensSessao =
    opts.loteRef && opts.linhasSessao?.length
      ? contarItensOperacaoRecibo(
          opts.linhasSessao.filter(
            (l) => String(l.loteNumero ?? '').trim() === String(opts.loteRef!.loteNumero).trim(),
          ),
        )
      : 0;
  const itensNuvem = opts.loteRef ? contarHistoricoLote(merged, opts.loteRef) : 0;

  return {
    ok: true,
    updatedAt: updatedAt ?? flush.lastUpdatedAt,
    payloadHistorico: merged,
    itensSessao,
    itensNuvem,
  };
}

/** Atualiza cursor de baseline após leitura da nuvem (usar após carregarNuvem). */
export function atualizarBaselineAtendimentoAposLeituraNuvem(updatedAt: string | null): void {
  setAtendimentoCloudBaselineCursor(updatedAt);
}

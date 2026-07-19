import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  flushAtendimentoComandoQueue,
  getAtendimentoComandoQueueSize,
  setAtendimentoCloudBaselineCursor,
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

/**
 * Espera o sync e confirma o histórico antes do recibo.
 *
 * Caminho normal: uma leitura leve (histórico + lotes). Só baixa `documentos` e
 * executa a reconciliação pesada quando a nuvem realmente ainda não tem todos
 * os itens. Isso evita transferir ~7 MB várias vezes ao finalizar pelo scan.
 */
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

  // O flush usa a mesma fila exclusiva das gravações optimistas; esperar o flush
  // já espera também os syncs em background iniciados antes da finalização.
  const flush = await flushAtendimentoComandoQueue();

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

  const loteValido = Boolean(opts.loteRef?.loteNumero && opts.linhasSessao?.length);
  const itensSessao = loteValido
    ? contarItensOperacaoRecibo(
        opts.linhasSessao!.filter(
          (l) => String(l.loteNumero ?? '').trim() === String(opts.loteRef!.loteNumero).trim(),
        ),
      )
    : 0;

  // Confirma primeiro com a menor fatia possível. Histórico e lotes bastam
  // para provar que todas as baixas chegaram e para montar o recibo.
  const leituraLeve = await fetchSnapshotSlices(
    ['atendimentoHistorico', 'atendimentoLotes'],
    { bypassCache: true },
  );
  if (leituraLeve.error) {
    return {
      ok: false,
      error: `Não foi possível confirmar na nuvem: ${leituraLeve.error}`,
      pendingQueue: 0,
    };
  }

  const cloudLeve = {
    ...payloadLocal,
    ...(leituraLeve.payload ?? {}),
  };
  // A contagem deve usar a fatia autoritativa da nuvem antes de preservar os
  // registos optimistas locais; caso contrário um item ainda não enviado
  // poderia ser contado como já confirmado.
  let itensNuvem = opts.loteRef ? contarHistoricoLote(cloudLeve, opts.loteRef) : 0;
  let merged = mergeAtendimentoPayloadPreservandoLocal(cloudLeve, payloadLocal);
  let updatedAt = leituraLeve.updatedAt ?? flush.lastUpdatedAt;

  // Fallback de reparação: apenas quando a leitura leve prova que falta algo.
  if (loteValido && itensNuvem < itensSessao) {
    const reconcile = await reconciliarSessaoAtendimentoNaNuvem({
      payloadLocal,
      loteRef: opts.loteRef!,
      linhasSessao: opts.linhasSessao!,
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
    if (reconcile.payloadHistorico) {
      merged = mergeAtendimentoPayloadPreservandoLocal(reconcile.payloadHistorico, payloadLocal);
    }
    updatedAt = reconcile.updatedAt ?? updatedAt;
    itensNuvem = reconcile.itensNuvem;
  }

  if (updatedAt) {
    setAtendimentoCloudBaselineCursor(updatedAt);
  }

  pending = await getAtendimentoComandoQueueSize();

  return {
    ok: true,
    updatedAt,
    payloadHistorico: merged,
    itensSessao,
    itensNuvem,
  };
}

/** Atualiza cursor de baseline após leitura da nuvem (usar após carregarNuvem). */
export function atualizarBaselineAtendimentoAposLeituraNuvem(updatedAt: string | null): void {
  setAtendimentoCloudBaselineCursor(updatedAt);
}

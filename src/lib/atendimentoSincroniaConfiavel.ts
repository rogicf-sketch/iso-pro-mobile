import type { IsoSnapshotPayload } from 'iso-pro-shared';

import {
  flushAtendimentoComandoQueue,
  getAtendimentoComandoQueueSize,
  setAtendimentoCloudBaselineCursor,
  waitForAtendimentoSyncIdle,
} from './atendimentoComando';
import { fetchSnapshotSlices } from './snapshot';
import type { LinhaSessaoAtendimento } from './registrarAtendimento';
import { mergeAtendimentoPayloadPreservandoLocal } from './mergeAtendimentoPayloadLocal';
import { contarHistoricoLote, contarItensOperacaoRecibo } from './atendimentoReciboValidacao';

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

const SYNC_IDLE_TIMEOUT_MS = 15_000;
const FLUSH_TIMEOUT_MS = 15_000;
const LEITURA_CONFIRM_TIMEOUT_MS = 10_000;
const CONFIRMACAO_LEVE_MAX_TENTATIVAS = 3;
const CONFIRMACAO_LEVE_INTERVALO_MS = 800;

type TimeoutResult<T> = { ok: true; value: T } | { ok: false };

async function comTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value): TimeoutResult<T> => ({ ok: true, value })),
      new Promise<TimeoutResult<T>>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Caminho normal: aguarda a gravação já iniciada pelo scan e confirma com uma
 * leitura leve (histórico + lotes). Nunca baixa `documentos[]` ao finalizar.
 * Toda espera tem limite: rede lenta não pode prender o overlay por minutos.
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

  // O scan inicia a gravação em background. Aguarda esse envio antes de consultar
  // o histórico, mas não deixa uma chamada HTTP presa bloquear a tela por minutos.
  const idle = await comTimeout(waitForAtendimentoSyncIdle(), SYNC_IDLE_TIMEOUT_MS);
  if (!idle.ok) {
    return {
      ok: false,
      error:
        'A baixa ainda está a ser enviada. A ligação está mais lenta que o normal; aguarde alguns segundos e toque em Finalizar novamente.',
      pendingQueue: await getAtendimentoComandoQueueSize(),
    };
  }

  let pending = await getAtendimentoComandoQueueSize();
  let lastUpdatedAt: string | null = null;
  if (pending > 0) {
    const flushResult = await comTimeout(flushAtendimentoComandoQueue(), FLUSH_TIMEOUT_MS);
    if (!flushResult.ok) {
      return {
        ok: false,
        error:
          'A fila de baixas continua a sincronizar. Aguarde alguns segundos e toque em Finalizar novamente; a sessão foi preservada.',
        pendingQueue: pending,
      };
    }
    const flush = flushResult.value;
    pending = await getAtendimentoComandoQueueSize();
    if (pending > 0 || flush.remaining > 0 || flush.hadErrors) {
      return {
        ok: false,
        error: `${Math.max(pending, flush.remaining)} baixa(s) ainda não foram confirmadas. Verifique a ligação e tente novamente.`,
        pendingQueue: Math.max(pending, flush.remaining),
      };
    }
    lastUpdatedAt = flush.lastUpdatedAt;
  }

  const loteValido = Boolean(opts.loteRef?.loteNumero && opts.linhasSessao?.length);
  const itensSessao = loteValido
    ? contarItensOperacaoRecibo(
        opts.linhasSessao!.filter(
          (l) => String(l.loteNumero ?? '').trim() === String(opts.loteRef!.loteNumero).trim(),
        ),
      )
    : 0;

  // A projeção do histórico pode levar instantes para ficar visível. Faz somente
  // leituras leves; o caminho antigo baixava ~7 MB de documentos até 8 vezes.
  let itensNuvem = 0;
  let merged: IsoSnapshotPayload | null = null;
  let updatedAt = lastUpdatedAt;
  let ultimoErro: string | null = null;
  for (let tentativa = 0; tentativa < CONFIRMACAO_LEVE_MAX_TENTATIVAS; tentativa++) {
    if (tentativa > 0) await esperar(CONFIRMACAO_LEVE_INTERVALO_MS);
    const leituraResult = await comTimeout(
      fetchSnapshotSlices(['atendimentoHistorico', 'atendimentoLotes'], { bypassCache: true }),
      LEITURA_CONFIRM_TIMEOUT_MS,
    );
    if (!leituraResult.ok) {
      ultimoErro = 'A leitura de confirmação excedeu 10 segundos.';
      break;
    }
    const leitura = leituraResult.value;
    if (leitura.error) {
      ultimoErro = leitura.error;
      break;
    }
    // Conta somente a resposta autoritativa. Não mistura o histórico otimista
    // local antes da prova, pois isso exibia “confirmado” cedo demais.
    const cloudAutoritativo = (leitura.payload ?? {}) as IsoSnapshotPayload;
    itensNuvem = opts.loteRef ? contarHistoricoLote(cloudAutoritativo, opts.loteRef) : 0;
    merged = mergeAtendimentoPayloadPreservandoLocal(
      { ...payloadLocal, ...cloudAutoritativo },
      payloadLocal,
    );
    updatedAt = leitura.updatedAt ?? updatedAt;
    if (!loteValido || itensNuvem >= itensSessao) break;
  }

  if (ultimoErro) {
    return {
      ok: false,
      error: `Não foi possível confirmar na nuvem: ${ultimoErro}`,
      pendingQueue: 0,
      itensSessao,
      itensNuvem,
    };
  }
  if (loteValido && itensNuvem < itensSessao) {
    return {
      ok: false,
      error: `A nuvem confirmou ${itensNuvem} de ${itensSessao} item(ns). Aguarde alguns segundos e toque em Finalizar novamente.`,
      pendingQueue: 0,
      itensSessao,
      itensNuvem,
    };
  }

  if (updatedAt) {
    setAtendimentoCloudBaselineCursor(updatedAt);
  }

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

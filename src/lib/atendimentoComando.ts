import AsyncStorage from '@react-native-async-storage/async-storage';



import type { IsoSnapshotPayload } from 'iso-pro-shared';



import {

  buildAtendimentoSnapshotPatchDelta,

  SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS,

} from './atendimentoSnapshotPatch';

import {

  isIsoProSnapshotConflictError,

  SNAPSHOT_CONFLICT_MESSAGE,

  submitAtendimentoComandoToCloud,

} from './isoProSnapshot';

import { fetchSnapshotSlicesForWrite } from './snapshot';

import { SNAPSHOT_MOBILE_ATENDIMENTO_PATCH_KEYS } from './snapshotSliceKeys';

import { reportMobileSyncHealthToCloud } from './mobileSyncHealth';



export type AtendimentoSyncOutcome = {

  error: string | null;

  conflict: boolean;

  updatedAt: string | null;

  queued: boolean;

};



export const ATENDIMENTO_CONFLICT_FINAL_MESSAGE =

  'Conflito após várias tentativas. Outro posto alterou este material — toque em «Carregar dados da nuvem» e aguarde a sincronização.';



const QUEUE_KEY = 'iso_pro_atendimento_comandos_v1';

const ATENDIMENTO_WRITE_KEYS = [...SNAPSHOT_MOBILE_ATENDIMENTO_PATCH_KEYS, 'configuracoesSistema'] as const;

const CONFLICT_RETRY_MAX = 6;



type QueuedAtendimentoComando = {

  id: string;

  idempotencyKey: string;

  baselineUpdatedAt: string;

  patch: Record<string, unknown>;

  mergeKeys: string[];

  patchWithoutMerge?: Record<string, unknown>;

  enqueuedAt: string;

};



/** Baseline da nuvem avançada após cada gravação bem-sucedida (dentro da fila exclusiva). */

let atendimentoCloudBaselineCursor: string | null = null;



export function setAtendimentoCloudBaselineCursor(at: string | null): void {

  atendimentoCloudBaselineCursor = at;

}



export function getAtendimentoCloudBaselineCursor(): string | null {

  return atendimentoCloudBaselineCursor;

}



async function readQueue(): Promise<QueuedAtendimentoComando[]> {

  try {

    const raw = await AsyncStorage.getItem(QUEUE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return (parsed as QueuedAtendimentoComando[]).map((item) => ({

      ...item,

      mergeKeys: item.mergeKeys?.length ? item.mergeKeys : [...SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS],

    }));

  } catch {

    return [];

  }

}



async function writeQueue(items: QueuedAtendimentoComando[]): Promise<void> {

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));

}



export function buildAtendimentoIdempotencyKey(parts: {

  loteId: number;

  loteNumero: string;

  documentoId?: string | number | null;

  codigoMaterial?: string;

  quantidade?: number;

}): string {

  const doc = parts.documentoId != null ? String(parts.documentoId) : 'na';

  const cod = (parts.codigoMaterial ?? 'na').trim().slice(0, 40);

  const q = Number.isFinite(parts.quantidade) ? String(parts.quantidade) : '0';

  return `at-${parts.loteId}-${parts.loteNumero}-${doc}-${cod}-${q}`;

}



function isOfflineNetworkError(message: string): boolean {

  return /network|fetch|timeout|failed to fetch|sem ligacao|offline|typeerror/i.test(message);

}



function isConflictOutcome(message: string | null, conflict: boolean): boolean {

  if (conflict) return true;

  return message != null && /conflito|conflict|alterado por outra|snapshot foi alterado|outro posto/i.test(message);

}



function deltaAtendimentoTemConteudo(patch: Record<string, unknown>): boolean {

  for (const k of ['documentos', 'atendimentoHistorico', 'atendimentoLotes', 'atendimentos', 'atendimentoEstornoLog'] as const) {

    const v = patch[k];

    if (Array.isArray(v) && v.length > 0) return true;

  }

  const cfg = patch.configuracoesSistema as Record<string, unknown> | undefined;

  if (cfg && 'sequenciaAtendimento' in cfg) return true;

  return false;

}



async function fetchCloudBaselineParaAtendimento(): Promise<{

  baseline: string | null;

  payload: IsoSnapshotPayload | null;

  error: string | null;

}> {

  const { payload, updatedAt, error } = await fetchSnapshotSlicesForWrite([...ATENDIMENTO_WRITE_KEYS]);

  return {

    baseline: updatedAt,

    payload: payload as IsoSnapshotPayload | null,

    error,

  };

}



function mesclarPayloadBaselineNuvem(

  local: IsoSnapshotPayload,

  nuvem: IsoSnapshotPayload | null,

): IsoSnapshotPayload {

  if (!nuvem) return local;

  return {

    ...local,

    documentos: nuvem.documentos ?? local.documentos,

    atendimentoHistorico: nuvem.atendimentoHistorico ?? local.atendimentoHistorico,

    atendimentoLotes: nuvem.atendimentoLotes ?? local.atendimentoLotes,

    configuracoesSistema: nuvem.configuracoesSistema ?? local.configuracoesSistema,

    dataAtualizacao: nuvem.dataAtualizacao ?? local.dataAtualizacao,

  };

}



async function enqueueAndReport(input: {

  patch: Record<string, unknown>;

  mergeKeys: readonly string[];

  patchWithoutMerge?: Record<string, unknown>;

  baselineUpdatedAt: string;

  idempotencyKey: string;

}): Promise<AtendimentoSyncOutcome> {

  await enqueueAtendimentoComando(input);

  void reportMobileSyncHealthToCloud({ force: true });

  return {

    error: null,

    conflict: false,

    updatedAt: new Date().toISOString(),

    queued: true,

  };

}



export async function getAtendimentoComandoQueueSize(): Promise<number> {

  return (await readQueue()).length;

}



export async function enqueueAtendimentoComando(input: {

  patch: Record<string, unknown>;

  mergeKeys: readonly string[];

  patchWithoutMerge?: Record<string, unknown>;

  baselineUpdatedAt: string;

  idempotencyKey: string;

}): Promise<void> {

  const items = await readQueue();

  if (items.some((x) => x.idempotencyKey === input.idempotencyKey)) return;

  items.push({

    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,

    idempotencyKey: input.idempotencyKey,

    baselineUpdatedAt: input.baselineUpdatedAt,

    patch: input.patch,

    mergeKeys: [...input.mergeKeys],

    patchWithoutMerge: input.patchWithoutMerge,

    enqueuedAt: new Date().toISOString(),

  });

  await writeQueue(items);

}



/** Gravacao optimista: patch minimo + comando idempotente (nao bloqueia UI). */

let syncAtendimentoTail: Promise<unknown> = Promise.resolve();



function runExclusiveAtendimentoSync<T>(fn: () => Promise<T>): Promise<T> {

  const resultPromise = syncAtendimentoTail.then(fn, fn);

  syncAtendimentoTail = resultPromise.then(

    () => undefined,

    () => undefined,

  );

  return resultPromise;

}



/** Aguarda todas as gravações de atendimento em fila terminarem. */

export function waitForAtendimentoSyncIdle(): Promise<void> {

  return syncAtendimentoTail.then(() => undefined);

}



/**

 * Caminho único de escrita: comando idempotente na nuvem ou fila offline.

 * Sem fallback para patch_snapshot / registrar_atendimento_mobile.

 */

export async function syncAtendimentoComando(input: {

  patch: Record<string, unknown>;

  mergeKeys: readonly string[];

  patchWithoutMerge?: Record<string, unknown>;

  baselineUpdatedAt: string;

  idempotencyKey: string;

}): Promise<AtendimentoSyncOutcome> {

  try {

    const result = await submitAtendimentoComandoToCloud(

      input.patch,

      input.baselineUpdatedAt,

      input.idempotencyKey,

    );

    if (result.ok) {

      void reportMobileSyncHealthToCloud();

      return {

        error: null,

        conflict: false,

        updatedAt: result.updatedAt,

        queued: false,

      };

    }



    if (result.missing) {

      return enqueueAndReport(input);

    }



    return {

      error: 'Comando de atendimento indisponível na nuvem.',

      conflict: false,

      updatedAt: null,

      queued: false,

    };

  } catch (err) {

    if (isIsoProSnapshotConflictError(err)) {

      return {

        error: SNAPSHOT_CONFLICT_MESSAGE,

        conflict: true,

        updatedAt: null,

        queued: false,

      };

    }

    const message = err instanceof Error ? err.message : 'Falha ao sincronizar atendimento.';

    if (isOfflineNetworkError(message)) {

      return enqueueAndReport(input);

    }

    return { error: message, conflict: false, updatedAt: null, queued: false };

  }

}



export async function persistirAtendimentoOptimistic(input: {

  payloadAtual: IsoSnapshotPayload;

  payloadNext: IsoSnapshotPayload;

  baselineUpdatedAt: string | null;

  idempotencyKey: string;

}): Promise<AtendimentoSyncOutcome> {

  return runExclusiveAtendimentoSync(async () => {

    const baselineInicial = input.baselineUpdatedAt ?? atendimentoCloudBaselineCursor;

    if (!baselineInicial) {

      return {

        error: 'Carregue a nuvem antes de registar.',

        conflict: false,

        updatedAt: null,

        queued: false,

      };

    }



    let payloadBaseline = input.payloadAtual;

    let lastConflictError: string | null = null;



    for (let attempt = 0; attempt < CONFLICT_RETRY_MAX; attempt++) {

      let baseline =

        attempt === 0 ? (atendimentoCloudBaselineCursor ?? baselineInicial) : null;



      if (attempt > 0 || !baseline) {

        const fresh = await fetchCloudBaselineParaAtendimento();

        if (fresh.error || !fresh.baseline) {

          return {

            error: fresh.error ?? 'Não foi possível confirmar a nuvem.',

            conflict: false,

            updatedAt: null,

            queued: false,

          };

        }

        baseline = fresh.baseline;

        payloadBaseline = mesclarPayloadBaselineNuvem(payloadBaseline, fresh.payload);

      }



      const delta = buildAtendimentoSnapshotPatchDelta(payloadBaseline, input.payloadNext);

      if (!deltaAtendimentoTemConteudo(delta.patch)) {

        atendimentoCloudBaselineCursor = baseline;

        return {

          error: null,

          conflict: false,

          updatedAt: baseline,

          queued: false,

        };

      }



      const result = await syncAtendimentoComando({

        patch: delta.comandoPatch,

        mergeKeys: delta.mergeKeys,

        patchWithoutMerge: delta.patchWithoutMerge,

        baselineUpdatedAt: baseline,

        idempotencyKey: input.idempotencyKey,

      });



      if (!result.error && !result.conflict && !result.queued) {

        const nextBaseline = result.updatedAt ?? baseline;

        atendimentoCloudBaselineCursor = nextBaseline;

        return { ...result, updatedAt: nextBaseline };

      }



      if (result.queued) {

        return result;

      }



      if (isConflictOutcome(result.error, result.conflict)) {

        lastConflictError = result.error;

        atendimentoCloudBaselineCursor = null;

        continue;

      }



      return result;

    }



    return {

      error: lastConflictError ?? ATENDIMENTO_CONFLICT_FINAL_MESSAGE,

      conflict: true,

      updatedAt: null,

      queued: false,

    };

  });

}



export type FlushAtendimentoComandoResult = {

  flushed: number;

  remaining: number;

  hadErrors: boolean;

  lastUpdatedAt: string | null;

};



export async function flushAtendimentoComandoQueue(): Promise<FlushAtendimentoComandoResult> {

  return runExclusiveAtendimentoSync(async () => {

    const items = await readQueue();

    if (!items.length) {

      return { flushed: 0, remaining: 0, hadErrors: false, lastUpdatedAt: null };

    }



    const remaining: QueuedAtendimentoComando[] = [];

    let flushed = 0;

    let hadErrors = false;

    let lastUpdatedAt: string | null = null;



    for (const item of items) {

      let enviado = false;

      for (let attempt = 0; attempt < CONFLICT_RETRY_MAX; attempt++) {

        const fresh = await fetchCloudBaselineParaAtendimento();

        if (fresh.error) {

          hadErrors = true;

          break;

        }

        const baseline = fresh.baseline ?? item.baselineUpdatedAt;

        const result = await syncAtendimentoComando({

          patch: item.patch,

          mergeKeys: item.mergeKeys,

          patchWithoutMerge: item.patchWithoutMerge,

          baselineUpdatedAt: baseline,

          idempotencyKey: item.idempotencyKey,

        });

        if (result.error || result.conflict || result.queued) {

          if (isConflictOutcome(result.error, result.conflict) && attempt < CONFLICT_RETRY_MAX - 1) {

            continue;

          }

          hadErrors = true;

          break;

        }

        flushed += 1;

        enviado = true;

        if (result.updatedAt) {

          lastUpdatedAt = result.updatedAt;

          atendimentoCloudBaselineCursor = result.updatedAt;

        }

        break;

      }

      if (!enviado) {

        remaining.push(item);

      }

    }



    await writeQueue(remaining);

    void reportMobileSyncHealthToCloud({ force: true });

    return { flushed, remaining: remaining.length, hadErrors, lastUpdatedAt };

  });

}


import {
  parseIsoSnapshotPayloadFromUnknown,
  type DocumentoPlanejamento,
  type IsoSnapshotPayload,
} from 'iso-pro-shared';
import { SUPABASE_URL } from './config';
import {
  commitIsoProSnapshotPatch,
  invalidateIsoProSnapshotCache,
  isIsoProSnapshotConflictError,
  listDocumentosPendenciaMaterialFromCloud,
  readDocumentoPlanejamentoFromCloud,
  readIsoProSnapshotSlicesForWrite,
  readIsoProSnapshotSlicesWithUpdatedAt,
  readIsoProSnapshotStats,
  type IsoProSnapshotPatchPlan,
} from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';
import { formatOperadorNetworkError } from './formatOperadorNetworkError';
import { captureOperationalEvent } from './errorReporting';
import { garantirIdsDocumentosPlanejamento } from './registrarAtendimento';

const SNAPSHOT_ID = 'default';

/** Alinhado ao desktop (`isoProSnapshot.ts`) — outra sessão alterou `iso_pro_snapshot.updated_at`. */
export const SNAPSHOT_CONFLICT_MESSAGE =
  'Snapshot foi alterado por outra sessão ou instalação. Recarregue os dados e tente novamente.';

export type UpsertDefaultSnapshotResult = {
  error: string | null;
  conflict: boolean;
  updatedAt: string | null;
};

export type SnapshotPatchPlan = IsoProSnapshotPatchPlan;

export type SnapshotSliceFetchResult = {
  payload: IsoSnapshotPayload | null;
  updatedAt: string | null;
  error: string | null;
};

/** Extrai chaves alteradas para patch parcial na nuvem. */
export function buildSnapshotPatchFromNext(
  next: IsoSnapshotPayload,
  keys: readonly string[],
): Record<string, unknown> {
  const rec = next as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in rec) {
      patch[key] = rec[key];
    }
  }
  return patch;
}

/** Leitura parcial (RPC `iso_pro_read_snapshot_slices` ou select jsonb). */
export async function fetchSnapshotSlices(
  keys: readonly string[],
  options?: { bypassCache?: boolean },
): Promise<SnapshotSliceFetchResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      payload: null,
      updatedAt: null,
      error: 'Supabase não configurado (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).',
    };
  }
  try {
    const { slices, updatedAt } = await readIsoProSnapshotSlicesWithUpdatedAt<Record<string, unknown>>(keys, options);
    const { payload, error } = guardAndEnrichSnapshotFromRemote(slices);
    return { payload, updatedAt, error };
  } catch (err) {
    return {
      payload: null,
      updatedAt: null,
      error: formatOperadorNetworkError(err, { contexto: 'carregar' }),
    };
  }
}

/** Leitura fresca de fatias + baseline (para gravacao com patch). */
export async function fetchSnapshotSlicesForWrite(keys: readonly string[]): Promise<SnapshotSliceFetchResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      payload: null,
      updatedAt: null,
      error: 'Supabase não configurado (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).',
    };
  }
  try {
    const { slices, baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite(keys);
    const { payload, error } = guardAndEnrichSnapshotFromRemote(slices);
    return { payload, updatedAt: baselineUpdatedAt, error };
  } catch (err) {
    return {
      payload: null,
      updatedAt: null,
      error: formatOperadorNetworkError(err, { contexto: 'carregar' }),
    };
  }
}

/**
 * Grava patch parcial com retry (RPC `iso_pro_patch_snapshot` + fallback gravacao completa).
 */
export async function commitDefaultSnapshotPatchWrite(
  prepare: () => Promise<SnapshotPatchPlan>,
  options?: { maxAttempts?: number },
): Promise<UpsertDefaultSnapshotResult> {
  try {
    await commitIsoProSnapshotPatch(prepare, options);
    return { error: null, conflict: false, updatedAt: new Date().toISOString() };
  } catch (err) {
    if (isIsoProSnapshotConflictError(err)) {
      captureOperationalEvent('snapshot_conflict', { source: 'patch' }, 'warning');
      return { error: SNAPSHOT_CONFLICT_MESSAGE, conflict: true, updatedAt: null };
    }
    const message = err instanceof Error ? err.message : 'Falha ao gravar patch do snapshot.';
    return { error: message, conflict: false, updatedAt: null };
  }
}

export { invalidateIsoProSnapshotCache };

export {
  listDocumentosPendenciaMaterialFromCloud,
  listDocumentosPlanejamentoResumoFromCloud,
  readDocumentoPlanejamentoFromCloud,
  reservarNumeroAtendimentoFromCloud,
  searchDocumentosPlanejamentoFromCloud,
} from './isoProSnapshot';

export type SnapshotWritePlan = {
  nextPayload: IsoSnapshotPayload;
  baselineUpdatedAt: string | null;
};

function parseDocumentosArray(value: unknown): DocumentoPlanejamento[] | undefined {
  if (value == null) return undefined;
  let v: unknown = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(v)) return undefined;
  return v as DocumentoPlanejamento[];
}

function tryParseRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value) as unknown;
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** Garante `numero` pesquisável mesmo se o JSON vier só com `codigo` / variantes. */
function normalizeDocumentoPlanejamento(doc: DocumentoPlanejamento): DocumentoPlanejamento {
  const dc = doc as unknown as Record<string, unknown>;
  const numero =
    String(doc.numero ?? dc.numeroDesenho ?? dc.numero_desenho ?? dc.codigo ?? dc.nDesenho ?? '').trim() || undefined;
  if (numero === undefined) return doc;
  return { ...doc, numero };
}

/**
 * Alguns backups ou integrações podem guardar desenhos em `Documentos`, `planejamento.documentos`, `desenhos`, etc.
 * Usamos a primeira lista não vazia; senão a primeira array válida (mesmo vazia).
 */
function coalesceDocumentosPlanejamento(raw: Record<string, unknown>): DocumentoPlanejamento[] {
  const pj = raw.planejamento as Record<string, unknown> | string | undefined;
  const pjObj = typeof pj === 'string' ? tryParseRecord(pj) : (pj as Record<string, unknown> | undefined);
  const sources: unknown[] = [
    raw.documentos,
    raw.Documentos,
    raw.desenhos,
    raw.Desenhos,
    raw.listaDocumentos,
    raw.listaDesenhos,
    pjObj?.documentos,
    pjObj?.Documentos,
    pjObj?.desenhos,
    typeof raw.planejamento === 'object' && raw.planejamento !== null
      ? (raw.planejamento as Record<string, unknown>).documentos
      : undefined,
    typeof raw.planejamento === 'object' && raw.planejamento !== null
      ? (raw.planejamento as Record<string, unknown>).Documentos
      : undefined,
  ];
  for (const s of sources) {
    const arr = parseDocumentosArray(s);
    if (arr && arr.length > 0) return arr.map(normalizeDocumentoPlanejamento);
  }
  for (const s of sources) {
    const arr = parseDocumentosArray(s);
    if (arr) return arr.map(normalizeDocumentoPlanejamento);
  }
  return [];
}

/** Garante `documentos` como array (evita payload legado ou serializado de forma estranha). */
function enrichSnapshotPayload(raw: IsoSnapshotPayload): IsoSnapshotPayload {
  const rec = raw as Record<string, unknown>;
  const documentos = coalesceDocumentosPlanejamento(rec);
  const merged: IsoSnapshotPayload = {
    ...(raw as IsoSnapshotPayload),
    documentos,
  };
  /** Ids estáveis em desenho/linha: o ecrã de atendimento usa o mesmo critério que a gravação na nuvem. */
  garantirIdsDocumentosPlanejamento(merged);
  return merged;
}

/**
 * Validação Zod + saneamento (anti poluição de protótipo) antes de enriquecer documentos/ids.
 */
function guardAndEnrichSnapshotFromRemote(raw: unknown): {
  payload: IsoSnapshotPayload | null;
  error: string | null;
} {
  if (raw === null || raw === undefined) {
    return { payload: null, error: null };
  }
  const parsed = parseIsoSnapshotPayloadFromUnknown(raw);
  if (!parsed.ok) {
    return { payload: null, error: parsed.error };
  }
  return { payload: enrichSnapshotPayload(parsed.data), error: null };
}

export function getSupabaseHostHint(): string {
  const u = SUPABASE_URL.trim();
  if (!u) return '—';
  try {
    return new URL(u).host;
  } catch {
    return 'URL inválida';
  }
}

export type SnapshotDiagnostics = {
  error: string | null;
  host: string;
  updatedAt: string | null;
  rowFound: boolean;
  documentos: number;
  materiais: number;
  recebimentos: number;
  colaboradores: number;
  payloadKeys: string[];
  primeiroNumeroDocumento: string | null;
};

/** Leitura única para ecrã de diagnóstico (Início) — fatias leves + stats opcionais. */
export async function fetchSnapshotDiagnostics(): Promise<SnapshotDiagnostics> {
  const host = getSupabaseHostHint();
  const supabase = getSupabase();
  if (!supabase) {
    return {
      error: 'Supabase não configurado.',
      host,
      updatedAt: null,
      rowFound: false,
      documentos: 0,
      materiais: 0,
      recebimentos: 0,
      colaboradores: 0,
      payloadKeys: [],
      primeiroNumeroDocumento: null,
    };
  }

  try {
    const stats = await readIsoProSnapshotStats().catch(() => null);
    const { payload, updatedAt, error } = await fetchSnapshotSlices([
      'documentos',
      'materiais',
      'recebimentos',
      'colaboradores',
    ]);

    if (error) {
      return {
        error,
        host,
        updatedAt: stats?.updatedAt ?? updatedAt,
        rowFound: false,
        documentos: 0,
        materiais: 0,
        recebimentos: 0,
        colaboradores: 0,
        payloadKeys: [],
        primeiroNumeroDocumento: null,
      };
    }

    const docs = payload?.documentos ?? [];
    const mats = payload?.materiais ?? [];
    const recs = payload?.recebimentos ?? [];
    const cols = payload?.colaboradores ?? [];
    const primeiro = docs[0] ? String((docs[0] as DocumentoPlanejamento).numero ?? '') : null;

    return {
      error: null,
      host,
      updatedAt: stats?.updatedAt ?? updatedAt,
      rowFound: Boolean(payload),
      documentos: docs.length,
      materiais: mats.length,
      recebimentos: recs.length,
      colaboradores: cols.length,
      payloadKeys: payload ? ['documentos', 'materiais', 'recebimentos', 'colaboradores'] : [],
      primeiroNumeroDocumento: primeiro || null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao ler diagnóstico do snapshot.';
    return {
      error: message,
      host,
      updatedAt: null,
      rowFound: false,
      documentos: 0,
      materiais: 0,
      recebimentos: 0,
      colaboradores: 0,
      payloadKeys: [],
      primeiroNumeroDocumento: null,
    };
  }
}

export async function fetchDefaultSnapshot(): Promise<{
  payload: IsoSnapshotPayload | null;
  updatedAt: string | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { payload: null, updatedAt: null, error: 'Supabase não configurado (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).' };
  }
  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload,updated_at')
    .eq('id', 'default')
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();

  if (error) {
    return { payload: null, updatedAt: null, error: error.message };
  }
  const { payload, error: snapshotParseError } = guardAndEnrichSnapshotFromRemote(data?.payload ?? null);
  return { payload, updatedAt: data?.updated_at ?? null, error: snapshotParseError };
}

/**
 * Grava o snapshot com controlo de versão (`updated_at`), igual ao desktop.
 * `baselineUpdatedAt` deve ser o valor lido em `fetchDefaultSnapshot` antes de editar localmente.
 */
export async function upsertDefaultSnapshot(
  payload: IsoSnapshotPayload,
  baselineUpdatedAt: string | null,
): Promise<UpsertDefaultSnapshotResult> {
  const checked = parseIsoSnapshotPayloadFromUnknown(payload);
  if (!checked.ok) {
    return { error: checked.error, conflict: false, updatedAt: null };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'Supabase não configurado.', conflict: false, updatedAt: null };
  }

  const nextUpdatedAt = new Date().toISOString();

  if (baselineUpdatedAt === null) {
    const { error } = await supabase.from('iso_pro_snapshot').upsert(
      {
        id: SNAPSHOT_ID,
        tenant_id: getActiveTenantId(),
        payload: checked.data,
        updated_at: nextUpdatedAt,
      },
      { onConflict: 'id,tenant_id' },
    );
    if (error) {
      return { error: error.message, conflict: false, updatedAt: null };
    }
    invalidateIsoProSnapshotCache();
    return { error: null, conflict: false, updatedAt: nextUpdatedAt };
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .update({
      payload: checked.data,
      updated_at: nextUpdatedAt,
    })
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .eq('updated_at', baselineUpdatedAt)
    .select('id');

  if (error) {
    return { error: error.message, conflict: false, updatedAt: null };
  }
  if (!data?.length) {
    return { error: SNAPSHOT_CONFLICT_MESSAGE, conflict: true, updatedAt: null };
  }
  invalidateIsoProSnapshotCache();
  return { error: null, conflict: false, updatedAt: nextUpdatedAt };
}

/**
 * Releitura + gravação com retry quando outra sessão (PC/web) alterou o snapshot no meio do fluxo.
 */
export async function commitDefaultSnapshotWrite(
  prepare: () => Promise<SnapshotWritePlan>,
  options?: { maxAttempts?: number },
): Promise<UpsertDefaultSnapshotResult> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let last: UpsertDefaultSnapshotResult = {
    error: SNAPSHOT_CONFLICT_MESSAGE,
    conflict: true,
    updatedAt: null,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let plan: SnapshotWritePlan;
    try {
      plan = await prepare();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao preparar gravação do snapshot.';
      return { error: message, conflict: false, updatedAt: null };
    }

    const result = await upsertDefaultSnapshot(plan.nextPayload, plan.baselineUpdatedAt);
    last = result;
    if (!result.conflict) {
      return result;
    }
  }

  captureOperationalEvent('snapshot_conflict', { attempts: maxAttempts }, 'warning');
  return last;
}

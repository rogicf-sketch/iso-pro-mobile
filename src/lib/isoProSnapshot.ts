import { parseIsoSnapshotPayloadFromUnknown, type IsoSnapshotPayload } from 'iso-pro-shared';
import { flushEscalaOutboxBestEffort } from './escalaOutbox';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';

export type SnapshotSliceKey = string;

type IsoSnapshotPayloadRecord = IsoSnapshotPayload & Record<string, unknown>;

const SNAPSHOT_ID = 'default';
const SNAPSHOT_SLICE_CACHE_TTL_MS = 5000;

let cachedSliceKey: string | null = null;
let cachedSlicePayload: Record<string, unknown> | null = null;
let cachedSliceUpdatedAt: string | null = null;
let cachedSliceAt = 0;

export function invalidateIsoProSnapshotCache() {
  cachedSliceKey = null;
  cachedSlicePayload = null;
  cachedSliceUpdatedAt = null;
  cachedSliceAt = 0;
}

function sliceCacheKey(keys: readonly string[]): string {
  return [...keys].sort().join('\0');
}

function snapshotCopy<T extends Record<string, unknown>>(payload: Record<string, unknown>): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

function isRpcMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

function isSnapshotConflictRpcError(error: { message?: string } | null): boolean {
  return String(error?.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT');
}

function extractSlicesFromRpcRow(raw: Record<string, unknown>): {
  slices: Record<string, unknown>;
  updatedAt: string | null;
} {
  const updatedAt = raw._updatedAt != null ? String(raw._updatedAt) : null;
  const slices: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    slices[key] = value;
  }
  return { slices, updatedAt };
}

async function readSnapshotSlicesFromRpc(
  keys: readonly string[],
): Promise<{ slices: Record<string, unknown>; updatedAt: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: getActiveTenantId(),
    p_keys: [...keys],
  });
  if (error) {
    if (isRpcMissingError(error)) return null;
    throw new Error(error.message);
  }
  if (!data || typeof data !== 'object') {
    return { slices: {}, updatedAt: null };
  }
  return extractSlicesFromRpcRow(data as Record<string, unknown>);
}

async function readSnapshotSlicesFromSelect(
  keys: readonly string[],
): Promise<{ slices: Record<string, unknown>; updatedAt: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  const selectCols = keys.map((k) => `payload->${k}`).join(', ');
  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select(`${selectCols}, updated_at`)
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const slices: Record<string, unknown> = {};
  const row = (data ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    if (key in row) {
      slices[key] = row[key];
    }
  }
  const updatedAt = row.updated_at != null ? String(row.updated_at) : null;
  return { slices, updatedAt };
}

async function readSnapshotSlicesUncached(
  keys: readonly string[],
): Promise<{ slices: Record<string, unknown>; updatedAt: string | null }> {
  const fromRpc = await readSnapshotSlicesFromRpc(keys);
  return fromRpc ?? (await readSnapshotSlicesFromSelect(keys));
}

export async function readIsoProSnapshotSlicesWithUpdatedAt<
  T extends Record<string, unknown> = Record<string, unknown>,
>(keys: readonly SnapshotSliceKey[], options?: { bypassCache?: boolean }): Promise<{ slices: T; updatedAt: string | null }> {
  const cacheKey = sliceCacheKey(keys);
  const now = Date.now();
  if (
    !options?.bypassCache &&
    cachedSliceKey === cacheKey &&
    cachedSlicePayload &&
    now - cachedSliceAt <= SNAPSHOT_SLICE_CACHE_TTL_MS
  ) {
    return {
      slices: snapshotCopy<T>(cachedSlicePayload),
      updatedAt: cachedSliceUpdatedAt,
    };
  }

  const { slices, updatedAt } = await readSnapshotSlicesUncached(keys);
  cachedSliceKey = cacheKey;
  cachedSlicePayload = slices;
  cachedSliceUpdatedAt = updatedAt;
  cachedSliceAt = now;
  return { slices: snapshotCopy<T>(slices as Record<string, unknown>), updatedAt };
}

export type IsoProSnapshotSliceWriteBaseline = {
  slices: Record<string, unknown>;
  baselineUpdatedAt: string | null;
};

export async function readIsoProSnapshotSlicesForWrite(
  keys: readonly SnapshotSliceKey[],
): Promise<IsoProSnapshotSliceWriteBaseline> {
  const { slices, updatedAt } = await readSnapshotSlicesUncached(keys);
  return { slices: snapshotCopy(slices), baselineUpdatedAt: updatedAt };
}

export type IsoProSnapshotStats = {
  payloadBytes: number;
  updatedAt: string | null;
};

export async function readIsoProSnapshotStats(): Promise<IsoProSnapshotStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('iso_pro_snapshot_stats', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) return null;
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return null;
  return {
    payloadBytes: Number(row.payloadBytes ?? 0),
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : null,
  };
}

/** Converte `null` → omitido em campos de documentos (evita falha Zod em sync/atendimento). */
function sanitizeDocumentosNullFields(payload: Record<string, unknown>): Record<string, unknown> {
  const docs = payload.documentos;
  if (!Array.isArray(docs)) return payload;
  return {
    ...payload,
    documentos: docs.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      const d = { ...(raw as Record<string, unknown>) };
      for (const key of Object.keys(d)) {
        if (d[key] === null) delete d[key];
      }
      if (Array.isArray(d.itens)) {
        d.itens = d.itens.map((it) => {
          if (!it || typeof it !== 'object' || Array.isArray(it)) return it;
          const row = { ...(it as Record<string, unknown>) };
          for (const key of Object.keys(row)) {
            if (row[key] === null) delete row[key];
          }
          return row;
        });
      }
      return d;
    }),
  };
}

function assertPayloadSafeForWrite(payload: Record<string, unknown>): IsoSnapshotPayloadRecord {
  const parsed = parseIsoSnapshotPayloadFromUnknown(sanitizeDocumentosNullFields(payload));
  if (!parsed.ok) {
    throw new Error(`Snapshot invalido para gravacao: ${parsed.error}`);
  }
  return parsed.data as IsoSnapshotPayloadRecord;
}

export const SNAPSHOT_CONFLICT_MESSAGE =
  'Outro posto ou o PC alterou este material. Toque em «Carregar dados da nuvem» e tente novamente.';

export class IsoProSnapshotConflictError extends Error {
  readonly code = 'ISO_PRO_SNAPSHOT_CONFLICT' as const;

  constructor(message: string = SNAPSHOT_CONFLICT_MESSAGE) {
    super(message);
    this.name = 'IsoProSnapshotConflictError';
  }
}

export function isIsoProSnapshotConflictError(error: unknown): error is IsoProSnapshotConflictError {
  return error instanceof IsoProSnapshotConflictError;
}

export type IsoProSnapshotPatchPlan = {
  patch: Record<string, unknown>;
  baselineUpdatedAt: string | null;
  /** Chaves cujo valor é array e deve ser fundido por `id` no servidor (patch delta). */
  mergeKeys?: readonly string[];
  /** Patch completo (substitui chaves) se o RPC ainda não suportar `p_merge_keys`. */
  patchWithoutMerge?: Record<string, unknown>;
};

function isRpcMergeKeysUnsupported(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? '').toLowerCase();
  return (
    msg.includes('p_merge_keys') ||
    (msg.includes('function') && msg.includes('iso_pro_patch_snapshot') && msg.includes('does not exist'))
  );
}

function isAtendimentoDeltaPatch(mergeKeys?: readonly string[]): boolean {
  if (!mergeKeys?.length) return false;
  const set = new Set(mergeKeys);
  return set.has('documentos') && set.has('atendimentoHistorico') && set.has('atendimentoLotes');
}

function extractAtendimentoMobileRpcArgs(patch: Record<string, unknown>): Record<string, unknown> {
  const cfg = patch.configuracoesSistema as Record<string, unknown> | undefined;
  const seq = cfg?.sequenciaAtendimento;
  const args: Record<string, unknown> = {
    p_tenant_id: getActiveTenantId(),
  };
  if (patch.documentos != null) args.p_documentos = patch.documentos;
  if (patch.atendimentoHistorico != null) args.p_historico_novas = patch.atendimentoHistorico;
  if (patch.atendimentoLotes != null) args.p_lotes_novos = patch.atendimentoLotes;
  if (patch.atendimentos != null) args.p_atendimentos = patch.atendimentos;
  if (patch.atendimentoEstornoLog != null) args.p_estorno_log_novas = patch.atendimentoEstornoLog;
  if (typeof seq === 'number' && Number.isFinite(seq)) args.p_sequencia_atendimento = seq;
  return args;
}

async function upsertAtendimentoMobileRpc(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string | null,
): Promise<{ ok: boolean; missing: boolean }> {
  const supabase = getSupabase();
  if (!supabase || baselineUpdatedAt === null) return { ok: false, missing: false };
  const safePatch = assertPayloadSafeForWrite(patch);
  const rpcArgs = {
    ...extractAtendimentoMobileRpcArgs(safePatch as Record<string, unknown>),
    p_baseline: baselineUpdatedAt,
  };
  const { error } = await supabase.rpc('iso_pro_registrar_atendimento_mobile', rpcArgs);
  if (error) {
    if (isRpcMissingError(error)) return { ok: false, missing: true };
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }
  invalidateIsoProSnapshotCache();
  return { ok: true, missing: false };
}

async function upsertIsoProSnapshotPatchRpc(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string | null,
  mergeKeys?: readonly string[],
  patchWithoutMerge?: Record<string, unknown>,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const safePatch = assertPayloadSafeForWrite(patch);
  const atendimentoDelta = isAtendimentoDeltaPatch(mergeKeys);

  if (atendimentoDelta) {
    const mobile = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
    if (mobile.ok) return true;
  }

  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: getActiveTenantId(),
    p_baseline: baselineUpdatedAt,
    p_patch: safePatch,
  };
  if (mergeKeys?.length) {
    rpcArgs.p_merge_keys = [...mergeKeys];
  }
  let { error } = await supabase.rpc('iso_pro_patch_snapshot', rpcArgs);

  if (error && atendimentoDelta) {
    const mobileRetry = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
    if (mobileRetry.ok) return true;
  }

  if (error && mergeKeys?.length && patchWithoutMerge && isRpcMergeKeysUnsupported(error)) {
    if (atendimentoDelta) {
      const mobileFallback = await upsertAtendimentoMobileRpc(
        safePatch as Record<string, unknown>,
        baselineUpdatedAt,
      );
      if (mobileFallback.ok) return true;
    }
    const safeFallback = assertPayloadSafeForWrite(patchWithoutMerge);
    ({ error } = await supabase.rpc('iso_pro_patch_snapshot', {
      p_tenant_id: getActiveTenantId(),
      p_baseline: baselineUpdatedAt,
      p_patch: safeFallback,
    }));
  }
  if (error) {
    if (isRpcMissingError(error)) return false;
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }
  invalidateIsoProSnapshotCache();
  return true;
}

async function upsertIsoProSnapshotPayloadFull(
  nextPayload: Record<string, unknown>,
  baselineUpdatedAt: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const safePayload = assertPayloadSafeForWrite(nextPayload);
  const nextUpdatedAt = new Date().toISOString();

  if (baselineUpdatedAt === null) {
    const { error } = await supabase.from('iso_pro_snapshot').upsert(
      {
        id: SNAPSHOT_ID,
        tenant_id: getActiveTenantId(),
        payload: safePayload,
        updated_at: nextUpdatedAt,
      },
      { onConflict: 'id,tenant_id' },
    );
    if (error) {
      throw new Error(error.message);
    }
    invalidateIsoProSnapshotCache();
    return;
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .update({
      payload: safePayload,
      updated_at: nextUpdatedAt,
    })
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .eq('updated_at', baselineUpdatedAt)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.length) {
    throw new IsoProSnapshotConflictError();
  }

  invalidateIsoProSnapshotCache();
}

export async function readIsoProSnapshotPayloadForWrite<T extends Record<string, unknown>>(): Promise<{
  payload: T;
  baselineUpdatedAt: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const raw = ((data?.payload ?? {}) as Record<string, unknown>) ?? {};
  const parsed = parseIsoSnapshotPayloadFromUnknown(raw);
  const payload = parsed.ok ? (parsed.data as Record<string, unknown>) : {};
  const baselineUpdatedAt = data?.updated_at != null ? String(data.updated_at) : null;
  return { payload: snapshotCopy<T>(payload), baselineUpdatedAt };
}

export async function commitIsoProSnapshotPatch(
  prepare: () => Promise<IsoProSnapshotPatchPlan>,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { patch, baselineUpdatedAt, mergeKeys, patchWithoutMerge } = await prepare();
    try {
      const patched = await upsertIsoProSnapshotPatchRpc(
        patch,
        baselineUpdatedAt,
        mergeKeys,
        patchWithoutMerge,
      );
      if (patched) {
        void flushEscalaOutboxBestEffort().catch(() => undefined);
        return;
      }

      const { payload: currentPayload } = await readIsoProSnapshotPayloadForWrite<Record<string, unknown>>();
      await upsertIsoProSnapshotPayloadFull({ ...currentPayload, ...patch }, baselineUpdatedAt);
      void flushEscalaOutboxBestEffort().catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        invalidateIsoProSnapshotCache();
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export type SubmitAtendimentoComandoResult =
  | { ok: true; updatedAt: string; usedCommandRpc: boolean }
  | { ok: false; missing: true };

/** Comando idempotente (arquitetura definitiva) — payload minimo KB. */
export async function submitAtendimentoComandoToCloud(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string,
  idempotencyKey: string,
): Promise<SubmitAtendimentoComandoResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, missing: true };
  const safePatch = assertPayloadSafeForWrite(patch);
  const args = extractAtendimentoMobileRpcArgs(safePatch as Record<string, unknown>);

  const commandArgs = {
    ...args,
    p_idempotency_key: idempotencyKey,
    p_baseline: baselineUpdatedAt,
  };
  let { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', commandArgs);
  if (!error && data != null) {
    invalidateIsoProSnapshotCache();
    return { ok: true, updatedAt: String(data), usedCommandRpc: true };
  }
  if (error && !isRpcMissingError(error)) {
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }

  return { ok: false, missing: true };
}

export async function reservarNumeroAtendimentoFromCloud(
  baselineUpdatedAt: string,
): Promise<
  | { ok: true; numero: string; sequencia: number; updatedAt: string }
  | { ok: false; missing: boolean }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, missing: true };
  const { data, error } = await supabase.rpc('iso_pro_reservar_numero_atendimento', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: baselineUpdatedAt,
  });
  if (error) {
    if (isRpcMissingError(error)) return { ok: false, missing: true };
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const numero = row.numero != null ? String(row.numero) : '';
  const sequencia = Number(row.sequencia);
  const updatedAt = row._updatedAt != null ? String(row._updatedAt) : baselineUpdatedAt;
  if (!numero || !Number.isFinite(sequencia)) {
    return { ok: false, missing: true };
  }
  invalidateIsoProSnapshotCache();
  return { ok: true, numero, sequencia, updatedAt };
}

export async function readDocumentoPlanejamentoFromCloud(input: {
  documentoId?: string | number | null;
  numero?: string | null;
  revisao?: string | null;
}): Promise<{ documento: Record<string, unknown> | null; updatedAt: string | null; missing: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { documento: null, updatedAt: null, missing: true };
  const { data, error } = await supabase.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: getActiveTenantId(),
    p_documento_id: input.documentoId != null ? String(input.documentoId) : null,
    p_numero: input.numero ?? null,
    p_revisao: input.revisao ?? null,
  });
  if (error) {
    if (isRpcMissingError(error)) return { documento: null, updatedAt: null, missing: true };
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const doc = row.documento;
  const updatedAt = row._updatedAt != null ? String(row._updatedAt) : null;
  return {
    documento: doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : null,
    updatedAt,
    missing: false,
  };
}

export async function searchDocumentosPlanejamentoFromCloud(
  texto: string,
  limit = 50,
): Promise<{ documentos: Record<string, unknown>[]; updatedAt: string | null; missing: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { documentos: [], updatedAt: null, missing: true };
  const q = texto.trim();
  if (!q) return { documentos: [], updatedAt: null, missing: false };
  const { data, error } = await supabase.rpc('iso_pro_search_documentos_planejamento', {
    p_tenant_id: getActiveTenantId(),
    p_texto: q,
    p_limit: limit,
  });
  if (error) {
    if (isRpcMissingError(error)) return { documentos: [], updatedAt: null, missing: true };
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const docs = row.documentos;
  const list = Array.isArray(docs) ? (docs as Record<string, unknown>[]) : [];
  return {
    documentos: list,
    updatedAt: row._updatedAt != null ? String(row._updatedAt) : null,
    missing: false,
  };
}

export async function listDocumentosPlanejamentoResumoFromCloud(): Promise<{
  documentos: Record<string, unknown>[];
  updatedAt: string | null;
  missing: boolean;
}> {
  const supabase = getSupabase();
  if (!supabase) return { documentos: [], updatedAt: null, missing: true };
  const { data, error } = await supabase.rpc('iso_pro_list_documentos_planejamento_resumo', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) return { documentos: [], updatedAt: null, missing: true };
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const docs = row.documentos;
  const list = Array.isArray(docs) ? (docs as Record<string, unknown>[]) : [];
  return {
    documentos: list,
    updatedAt: row._updatedAt != null ? String(row._updatedAt) : null,
    missing: false,
  };
}

export async function listDocumentosPendenciaMaterialFromCloud(codigo: string): Promise<{
  documentos: Record<string, unknown>[];
  updatedAt: string | null;
  missing: boolean;
}> {
  const supabase = getSupabase();
  if (!supabase) return { documentos: [], updatedAt: null, missing: true };
  const { data, error } = await supabase.rpc('iso_pro_list_documentos_pendencia_material', {
    p_tenant_id: getActiveTenantId(),
    p_codigo: codigo.trim(),
  });
  if (error) {
    if (isRpcMissingError(error)) return { documentos: [], updatedAt: null, missing: true };
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const docs = row.documentos;
  const list = Array.isArray(docs) ? (docs as Record<string, unknown>[]) : [];
  return {
    documentos: list,
    updatedAt: row._updatedAt != null ? String(row._updatedAt) : null,
    missing: false,
  };
}

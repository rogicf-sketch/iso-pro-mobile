import {
  parseIsoSnapshotPayloadFromUnknown,
  type DocumentoPlanejamento,
  type IsoSnapshotPayload,
} from 'iso-pro-shared';
import { SUPABASE_URL } from './config';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';
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

/** Leitura única para ecrã de diagnóstico (Início). */
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
  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload,updated_at')
    .eq('id', 'default')
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();

  if (error) {
    return {
      error: error.message,
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

  if (!data?.payload || typeof data.payload !== 'object') {
    return {
      error: null,
      host,
      updatedAt: data?.updated_at ?? null,
      rowFound: Boolean(data),
      documentos: 0,
      materiais: 0,
      recebimentos: 0,
      colaboradores: 0,
      payloadKeys: [],
      primeiroNumeroDocumento: null,
    };
  }

  const { payload, error: parseError } = guardAndEnrichSnapshotFromRemote(data.payload);
  if (parseError) {
    return {
      error: parseError,
      host,
      updatedAt: data.updated_at ?? null,
      rowFound: true,
      documentos: 0,
      materiais: 0,
      recebimentos: 0,
      colaboradores: 0,
      payloadKeys: Object.keys(data.payload as object).slice(0, 24),
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
    updatedAt: data.updated_at ?? null,
    rowFound: true,
    documentos: docs.length,
    materiais: mats.length,
    recebimentos: recs.length,
    colaboradores: cols.length,
    payloadKeys: Object.keys(data.payload as object).slice(0, 24),
    primeiroNumeroDocumento: primeiro || null,
  };
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

  return last;
}

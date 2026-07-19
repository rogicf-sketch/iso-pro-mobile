/**
 * Leituras paginadas na nuvem (tabelas de escala) — evita baixar snapshot inteiro
 * com dezenas de milhares de documentos/recebimentos.
 */
import { clearIsoProJwtSession, isIsoProJwtSessionActive } from './isoProJwtSession';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';

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

function isTenantForbiddenError(error: { message?: string } | null): boolean {
  const msg = String(error?.message ?? '');
  return /ISO_PRO_TENANT_FORBIDDEN|ISO_PRO_TENANT_INVALID/i.test(msg);
}

export type DocumentoListaEscala = {
  id: string;
  numero?: string;
  revisao?: string;
  descricao?: string;
  responsavel?: string;
  data?: string;
  status?: string;
  totalItens?: number;
  quantidadePlanejada?: number;
  quantidadeAtendida?: number;
  itens?: unknown[];
};

export type RecebimentoListaEscala = {
  id: string;
  fornecedor?: string;
  dataRecebimento?: string;
  notaFiscal?: string;
  romaneio?: string;
  conferente?: string;
  modoRecebimento?: string;
  status?: string;
  dataConferencia?: string | null;
  totalItens?: number;
  quantidadeRecebidaTotal?: number;
  quantidadeConferidaTotal?: number;
  conferenciaItensDivergentes?: number;
};

/** Preenche tabelas de escala a partir do snapshot (quando ainda estão vazias). */
export async function syncDocumentosPlanejamentoFromSnapshotCloud(): Promise<{
  ok: boolean;
  documentos?: number;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_sync_documentos_planejamento_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { ok: false, missing: true, error: error.message };
    }
    return { ok: false, missing: false, error: error.message };
  }
  const row = (data ?? {}) as { ok?: boolean; documentos?: number; error?: string };
  if (row.ok === false) {
    return { ok: false, missing: false, error: row.error ?? 'Falha no sync.' };
  }
  return { ok: true, missing: false, documentos: Number(row.documentos) || 0 };
}

export async function syncRecebimentosFromSnapshotCloud(): Promise<{
  ok: boolean;
  recebimentos?: number;
  itens?: number;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_sync_recebimentos_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { ok: false, missing: true, error: error.message };
    }
    return { ok: false, missing: false, error: error.message };
  }
  const row = (data ?? {}) as {
    ok?: boolean;
    recebimentos?: number;
    itens?: number;
    error?: string;
  };
  if (row.ok === false) {
    return { ok: false, missing: false, error: row.error ?? 'Falha no sync.' };
  }
  return {
    ok: true,
    missing: false,
    recebimentos: Number(row.recebimentos) || 0,
    itens: Number(row.itens) || 0,
  };
}

export async function listDocumentosPlanejamentoPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{
  documentos: DocumentoListaEscala[];
  total: number;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { documentos: [], total: 0, source: 'none', missing: true, error: 'Supabase nao configurado.' };
  }

  const invoke = async () =>
    supabase.rpc('iso_pro_list_documentos_planejamento_page', {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca?.trim() || null,
      p_offset: options?.offset ?? 0,
      p_limit: options?.limit ?? 50,
      p_status: options?.status && options.status !== 'todos' ? options.status : null,
    });

  let { data, error } = await invoke();

  // JWT desalinhado: volta a anon e tenta 1x (restaura total desenhos sem forçar logout da app).
  if (error && isTenantForbiddenError(error) && isIsoProJwtSessionActive()) {
    await clearIsoProJwtSession();
    ({ data, error } = await invoke());
  }

  if (error) {
    if (isRpcMissingError(error)) {
      return { documentos: [], total: 0, source: 'missing', missing: true, error: error.message };
    }
    return { documentos: [], total: 0, source: 'error', missing: false, error: error.message };
  }
  let row = (data ?? {}) as {
    documentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };

  // Sem excepcao mas total 0 sob JWT: tipico de RLS a esconder linhas (claim em falta).
  // Confirma com 1 leitura em anon; se anon tiver dados, mantem anon para a sessao de dados.
  if (
    !row._error &&
    (Number(row.total) || 0) === 0 &&
    isIsoProJwtSessionActive()
  ) {
    await clearIsoProJwtSession();
    const retry = await invoke();
    if (!retry.error && retry.data && typeof retry.data === 'object') {
      const retryRow = retry.data as typeof row;
      if ((Number(retryRow.total) || 0) > 0) {
        row = retryRow;
      }
    }
  }

  if (row._error) {
    return { documentos: [], total: 0, source: 'error', missing: false, error: row._error };
  }
  const list = Array.isArray(row.documentos) ? (row.documentos as DocumentoListaEscala[]) : [];
  return {
    documentos: list.map((d) => ({ ...d, id: String(d.id ?? '') })),
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

export async function listRecebimentosPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
  modo?: string;
}): Promise<{
  recebimentos: RecebimentoListaEscala[];
  total: number;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { recebimentos: [], total: 0, source: 'none', missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_list_recebimentos_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
    p_modo: options?.modo && options.modo !== 'todos' ? options.modo : null,
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { recebimentos: [], total: 0, source: 'missing', missing: true, error: error.message };
    }
    return { recebimentos: [], total: 0, source: 'error', missing: false, error: error.message };
  }
  const row = (data ?? {}) as {
    recebimentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };
  if (row._error) {
    return { recebimentos: [], total: 0, source: 'error', missing: false, error: row._error };
  }
  const list = Array.isArray(row.recebimentos) ? (row.recebimentos as RecebimentoListaEscala[]) : [];
  return {
    recebimentos: list.map((r) => ({ ...r, id: String(r.id ?? '') })),
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

export async function readRecebimentoFromCloud(id: string): Promise<{
  recebimento: Record<string, unknown> | null;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { recebimento: null, source: 'none', missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_read_recebimento', {
    p_tenant_id: getActiveTenantId(),
    p_recebimento_id: id,
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { recebimento: null, source: 'missing', missing: true, error: error.message };
    }
    return { recebimento: null, source: 'error', missing: false, error: error.message };
  }
  const row = (data ?? {}) as {
    recebimento?: Record<string, unknown> | null;
    _source?: string;
    _error?: string;
  };
  if (row._error) {
    return { recebimento: null, source: 'error', missing: false, error: row._error };
  }
  return {
    recebimento: row.recebimento ?? null,
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

export async function listInventariosPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{
  inventarios: Array<Record<string, unknown>>;
  total: number;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { inventarios: [], total: 0, source: 'none', missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_list_inventarios_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { inventarios: [], total: 0, source: 'missing', missing: true, error: error.message };
    }
    return { inventarios: [], total: 0, source: 'error', missing: false, error: error.message };
  }
  const row = (data ?? {}) as {
    inventarios?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };
  if (row._error) {
    return { inventarios: [], total: 0, source: 'error', missing: false, error: row._error };
  }
  return {
    inventarios: Array.isArray(row.inventarios) ? (row.inventarios as Array<Record<string, unknown>>) : [],
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

export async function readInventarioFromCloud(id: string): Promise<{
  inventario: Record<string, unknown> | null;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { inventario: null, source: 'none', missing: true, error: 'Supabase nao configurado.' };
  }
  const { data, error } = await supabase.rpc('iso_pro_read_inventario', {
    p_tenant_id: getActiveTenantId(),
    p_id: id,
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return { inventario: null, source: 'missing', missing: true, error: error.message };
    }
    return { inventario: null, source: 'error', missing: false, error: error.message };
  }
  const row = (data ?? {}) as {
    inventario?: Record<string, unknown> | null;
    _source?: string;
    _error?: string;
  };
  if (row._error) {
    return { inventario: null, source: 'error', missing: false, error: row._error };
  }
  return {
    inventario: row.inventario ?? null,
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

export type DocumentoPendenteAtendimento = {
  id: string;
  numero?: string;
  revisao?: string;
  descricao?: string;
  responsavel?: string;
  status?: string;
  itens?: Array<{
    id?: string;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    quantidade?: number;
    quantidadeAtendida?: number;
  }>;
};

export async function listDocumentosPendentesAtendimentoFromCloud(options?: {
  busca?: string;
  limit?: number;
}): Promise<{
  documentos: DocumentoPendenteAtendimento[];
  total: number;
  truncated: boolean;
  source: string;
  missing: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      documentos: [],
      total: 0,
      truncated: false,
      source: 'none',
      missing: true,
      error: 'Supabase nao configurado.',
    };
  }
  const { data, error } = await supabase.rpc('iso_pro_list_documentos_pendentes_atendimento', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_limit: options?.limit ?? 200,
  });
  if (error) {
    if (isRpcMissingError(error)) {
      return {
        documentos: [],
        total: 0,
        truncated: false,
        source: 'missing',
        missing: true,
        error: error.message,
      };
    }
    return {
      documentos: [],
      total: 0,
      truncated: false,
      source: 'error',
      missing: false,
      error: error.message,
    };
  }
  const row = (data ?? {}) as {
    documentos?: unknown;
    total?: number;
    truncated?: boolean;
    _source?: string;
    _error?: string;
  };
  if (row._error) {
    return {
      documentos: [],
      total: 0,
      truncated: false,
      source: 'error',
      missing: false,
      error: row._error,
    };
  }
  const list = Array.isArray(row.documentos) ? (row.documentos as DocumentoPendenteAtendimento[]) : [];
  return {
    documentos: list.map((d) => ({ ...d, id: String(d.id ?? '') })),
    total: Number(row.total) || 0,
    truncated: Boolean(row.truncated),
    source: String(row._source ?? 'tables'),
    missing: false,
  };
}

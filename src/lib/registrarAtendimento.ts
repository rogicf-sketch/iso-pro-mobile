/**
 * Registo de atendimentos (retiradas) no app Campo — offline-first com fila de sync.
 * Estorno/devolucao ao estoque e recibo de estorno sao deliberadamente apenas PC/web (seguranca).
 */
import type {
  AtendimentoLote,
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
  Material,
} from 'iso-pro-shared';
import { formatNumeroAtendimento, reservarProximoNumeroAtendimento } from 'iso-pro-shared';
import { buildSaldoOperacionalParaAtendimento, codigoMaterialKey } from './saldoMaterial';
import {
  cssReciboAtendimentoLayout,
  escapeHtmlRecibo,
  htmlAssinaturasRecibo,
  htmlLinhaItemRecibo,
  htmlLogoRecibo,
  linhaMatriculaFuncaoAssinatura,
  nomeExibicaoAtendenteAssinatura,
  segmentoRodapeInstituicaoRecibo,
} from './reciboAtendimentoLayout';
import {
  DOCUMENTO_RODAPE_CNPJ_PADRAO,
  DOCUMENTO_RODAPE_NOME_PADRAO,
  resolverUrlLogoReciboMobile,
} from './logoInstitucionalRecibo';

function linhaPlanejamentoMesmoCodigo(codigoItem: unknown, codigoBuscado: string): boolean {
  return codigoMaterialKey(String(codigoItem ?? '')) === codigoMaterialKey(codigoBuscado);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function nextHistoricoId(hist: { id?: number }[]): number {
  let m = Date.now() % 1000000;
  for (const h of hist) {
    if (h && typeof h.id === 'number' && h.id > m) m = h.id;
  }
  return m + 1;
}

function slugPlanejamento(s: string, max: number): string {
  const t = String(s ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_');
  return (t.slice(0, max) || 'x').replace(/^_+|_+$/g, '') || 'x';
}

/**
 * Garante `id` em cada desenho e em cada linha antes de gravar na nuvem.
 * Desenhos sem id quebram o cruzamento desktop/mobile no snapshot; linhas sem id impedem reconciliação por item.
 */
function documentoPlanejamentoTemIdsCompletos(doc: DocumentoPlanejamento): boolean {
  if (doc.id == null || String(doc.id).trim() === '') return false;
  for (const item of doc.itens ?? []) {
    const row = item as DocumentoItemPlanejamento & { id?: string | number };
    if (row.id == null || String(row.id).trim() === '') return false;
  }
  return true;
}

export function garantirIdsDocumentosPlanejamento(payload: IsoSnapshotPayload): void {
  const docs = (payload.documentos ?? []) as DocumentoPlanejamento[];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!d || documentoPlanejamentoTemIdsCompletos(d)) continue;
    const temId = d.id != null && String(d.id).trim() !== '';
    if (!temId) {
      const num = slugPlanejamento(String(d.numero ?? ''), 56);
      const rev = slugPlanejamento(String(d.revisao ?? ''), 12);
      d.id = `doc-${i}-${num}${rev && rev !== 'x' ? `-rev-${rev}` : ''}`;
    }
    const did = String(d.id);
    const itens = d.itens ?? [];
    for (let j = 0; j < itens.length; j++) {
      const item = itens[j] as DocumentoItemPlanejamento & { id?: string | number };
      const temItem = item.id != null && String(item.id).trim() !== '';
      if (!temItem) {
        item.id = `${did}-item-${j + 1}`;
      }
    }
  }
  payload.documentos = docs;
}

/** Resolve id estável do desenho no snapshot (numero + revisão) — obrigatório para baixa por código. */
export function resolverIdDocumentoPlanejamento(
  payload: IsoSnapshotPayload,
  doc: Pick<DocumentoPlanejamento, 'id' | 'numero' | 'revisao'> | null | undefined,
): string | null {
  if (!doc) return null;
  const idDireto = doc.id != null ? String(doc.id).trim() : '';
  if (idDireto) return idDireto;

  const numero = String(doc.numero ?? '').trim();
  if (!numero) return null;
  const revisao = String(doc.revisao ?? '').trim();

  const docs = (payload.documentos ?? []) as DocumentoPlanejamento[];
  const candidatos = docs.filter((d) => String(d.numero ?? '').trim() === numero);
  if (!candidatos.length) return null;
  if (revisao) {
    const exato = candidatos.find((d) => String(d.revisao ?? '').trim() === revisao);
    if (exato?.id != null && String(exato.id).trim()) return String(exato.id);
  }
  const comId = candidatos.find((d) => d.id != null && String(d.id).trim());
  return comId?.id != null ? String(comId.id) : null;
}

export function materialTemDemandaPendenteNoDocumento(
  payload: IsoSnapshotPayload,
  documentoId: string,
  codigoMaterial: string,
): boolean {
  const cod = codigoMaterialKey(String(codigoMaterial ?? ''));
  if (!cod) return false;
  const doc = ((payload.documentos ?? []) as DocumentoPlanejamento[]).find(
    (d) => String(d.id ?? '') === String(documentoId),
  );
  if (!doc) return false;
  for (const it of doc.itens ?? []) {
    if (codigoMaterialKey(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento)) !== cod) continue;
    const qProj = Number(it.quantidade) || 0;
    const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
    if (qProj - qAt > 1e-9) return true;
  }
  return false;
}

/** Igual a `gerarCodigoBarras` no I.S.O PRO (HTML) — etiquetas / leitura. */
export function gerarCodigoBarras(codigo: string): string {
  let hash = 0;
  for (let i = 0; i < codigo.length; i++) {
    hash = (hash << 5) - hash + codigo.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash % 1000000000000)
    .toString()
    .padStart(12, '0');
}

/**
 * Etiquetas do I.S.O PRO (recebimento): o QR guarda `NF:...|COD:XXX|ROM:...|LOC:...` (ver desktop `montarPayloadQrRecebimento`).
 * O código de barras 1D é só o hash numérico ou o texto do código — por isso o scan do QR falhava saldo/baixa.
 */
export function extrairCodigoMaterialDeTextoLeitura(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const pipeCod = s.match(/\bCOD:([^|]+)/i);
  if (pipeCod?.[1]) {
    const v = pipeCod[1].trim();
    if (v && v !== '-') return v;
  }
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s.split(/\s/)[0]);
      for (const k of ['codigo', 'material', 'cod', 'sku', 'c']) {
        const v = u.searchParams.get(k);
        if (v?.trim()) return v.trim();
      }
    }
  } catch {
    /* URL inválida */
  }
  if (s.startsWith('{') && s.includes('"codigo"')) {
    try {
      const j = JSON.parse(s) as { codigo?: string };
      const c = String(j.codigo ?? '').trim();
      if (c) return c;
    } catch {
      /* ignore */
    }
  }
  return s;
}

export function encontrarMaterialPorCodigoOuBarras(materiais: Material[], valor: string): Material | null {
  const raw = (valor || '').trim();
  if (!raw) return null;
  const termo = extrairCodigoMaterialDeTextoLeitura(raw);
  if (!termo) return null;
  const up = termo.toUpperCase();
  const porCodigo = materiais.find((m) => String(m.codigo || '').toUpperCase() === up);
  if (porCodigo) return porCodigo;
  const porBarrasCadastro = materiais.find((m) => {
    const b = String((m as { codigoBarras?: string }).codigoBarras ?? '')
      .trim()
      .toUpperCase();
    return b !== '' && b === up;
  });
  if (porBarrasCadastro) return porBarrasCadastro;
  return materiais.find((m) => gerarCodigoBarras(String(m.codigo || '')) === termo) ?? null;
}

/** Código na linha do planejamento — mesma ordem que `saldoFromSnapshot` no desktop (`codigo` / `codigo_material` / `codigoMaterial`). */
export function codigoNaLinhaPlanejamento(it: DocumentoItemPlanejamento): string {
  const o = it as Record<string, unknown>;
  const v = o.codigo ?? o.codigo_material ?? o.codigoMaterial;
  return String(v ?? '').trim();
}

export function quantidadeAtendidaLinha(it: DocumentoItemPlanejamento): number {
  const o = it as Record<string, unknown>;
  const v = o.quantidadeAtendida ?? o.quantidade_atendida;
  return Number(v) || 0;
}

export function descricaoNaLinhaPlanejamento(it: DocumentoItemPlanejamento): string {
  const o = it as Record<string, unknown>;
  return String(o.descricao ?? o.descricaoMaterial ?? '').trim();
}

/**
 * Para «Dar baixa» por código: usa o cadastro `materiais` do snapshot; se a ficha não veio na nuvem
 * mas o código existe nas linhas dos desenhos (planejamento), sintetiza um `Material` a partir da linha —
 * mesmo cenário em que o operador vê o desenho e o saldo mas o array `materiais` está incompleto no JSON.
 *
 * Também alinha leitura **numérica do código de barras 1D** (hash) com o código alfanumérico da linha (`gerarCodigoBarras`).
 */
export function resolverMaterialParaBaixaPorCodigo(
  payload: IsoSnapshotPayload,
  codigoLido: string,
): Material | null {
  const materiais = (payload.materiais || []) as Material[];
  const doCadastro = encontrarMaterialPorCodigoOuBarras(materiais, codigoLido);
  if (doCadastro?.codigo) return doCadastro;

  const raw = String(codigoLido || '').trim();
  if (!raw) return null;
  const termo = extrairCodigoMaterialDeTextoLeitura(raw);
  if (!termo) return null;
  const kWanted = codigoMaterialKey(termo);
  if (!kWanted) return null;

  const linhaCasaComLeitura = (codigoLinha: string): boolean => {
    const c = codigoLinha.trim();
    if (!c) return false;
    if (codigoMaterialKey(c) === kWanted) return true;
    const hash = gerarCodigoBarras(c);
    if (hash && hash === termo) return true;
    return false;
  };

  for (const d of (payload.documentos || []) as DocumentoPlanejamento[]) {
    for (const it of d.itens || []) {
      const dip = it as DocumentoItemPlanejamento;
      const c = codigoNaLinhaPlanejamento(dip);
      if (!c || !linhaCasaComLeitura(c)) continue;
      return {
        codigo: c,
        descricao: descricaoNaLinhaPlanejamento(dip),
        unidade: String(dip.unidade ?? ''),
      };
    }
  }
  return (
    sintetizarMaterialComPendenciaParaCodigo(payload, termo) ??
    sintetizarMaterialComPendenciaParaCodigo(payload, raw) ??
    null
  );
}

export interface AvaliacaoLeituraScan {
  /** Texto cru lido pela câmara/leitor. */
  textoLido: string;
  /** Código canónico resolvido (cadastro/linha) ou o código extraído do texto. */
  codigo: string;
  /** true quando a leitura casa com um material do cadastro ou linha de desenho. */
  encontrado: boolean;
  /** true quando o texto lido não produz sequer um código utilizável. */
  vazio: boolean;
}

/**
 * Avalia uma leitura de scan ANTES de a colocar no formulário, para dar feedback
 * imediato (bip/erro) quando o código não existe. Não altera estado — pura e testável.
 */
export function avaliarLeituraScanAtendimento(
  payload: IsoSnapshotPayload | null | undefined,
  textoLido: string,
): AvaliacaoLeituraScan {
  const bruto = String(textoLido ?? '').trim();
  const codigoExtraido = extrairCodigoMaterialDeTextoLeitura(bruto) || bruto;
  if (!bruto || !codigoExtraido) {
    return { textoLido: bruto, codigo: '', encontrado: false, vazio: true };
  }
  if (!payload) {
    return { textoLido: bruto, codigo: codigoExtraido, encontrado: false, vazio: false };
  }
  const material = resolverMaterialParaBaixaPorCodigo(payload, bruto);
  return {
    textoLido: bruto,
    codigo: material?.codigo ? String(material.codigo) : codigoExtraido,
    encontrado: Boolean(material?.codigo),
    vazio: false,
  };
}

/** Documentos (desenhos) do planejamento com quantidade pendente para o `codigo` do material. */
export function listarDocumentosComDemandaPendenteMaterial(
  payload: IsoSnapshotPayload,
  codigoMaterial: string
): { documento: DocumentoPlanejamento; restanteMaterial: number }[] {
  const cod = String(codigoMaterial || '').trim();
  if (!cod || !codigoMaterialKey(cod)) return [];
  const docs = (payload.documentos || []) as DocumentoPlanejamento[];
  const out: { documento: DocumentoPlanejamento; restanteMaterial: number }[] = [];
  for (const d of docs) {
    let rest = 0;
    for (const it of d.itens || []) {
      if (!linhaPlanejamentoMesmoCodigo(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento), cod)) continue;
      const qProj = Number(it.quantidade) || 0;
      const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
      rest += Math.max(0, qProj - qAt);
    }
    if (rest > 1e-9) {
      out.push({ documento: d, restanteMaterial: rest });
    }
  }
  return out;
}

/**
 * Quando o resolver «normal» falha (ex.: leitura ambígua no APK) mas já existe pendência para o código no planejamento,
 * sintetiza o material a partir da primeira linha pendente — alinha com o que o operador vê no ecrã.
 */
export function sintetizarMaterialComPendenciaParaCodigo(
  payload: IsoSnapshotPayload,
  codigoPlanejamento: string,
): Material | null {
  const cod = String(codigoPlanejamento || '').trim();
  if (!cod) return null;
  const lista = listarDocumentosComDemandaPendenteMaterial(payload, cod);
  for (const { documento } of lista) {
    for (const it of documento.itens ?? []) {
      const dip = it as DocumentoItemPlanejamento;
      if (!linhaPlanejamentoMesmoCodigo(codigoNaLinhaPlanejamento(dip), cod)) continue;
      const qProj = Number(it.quantidade) || 0;
      const qAt = quantidadeAtendidaLinha(dip);
      if (qProj - qAt <= 0) continue;
      const c = codigoNaLinhaPlanejamento(dip);
      return {
        codigo: c,
        descricao: descricaoNaLinhaPlanejamento(dip),
        unidade: String(dip.unidade ?? ''),
      };
    }
  }
  return null;
}

/**
 * Consulta: todos os documentos em que o material aparece, com soma do restante nesse desenho (inclui restante 0).
 */
export function listarDocumentosPorMaterialConsulta(
  payload: IsoSnapshotPayload,
  codigoMaterial: string
): { documento: DocumentoPlanejamento; restanteMaterial: number }[] {
  const cod = String(codigoMaterial || '').trim();
  if (!cod || !codigoMaterialKey(cod)) return [];
  const docs = (payload.documentos || []) as DocumentoPlanejamento[];
  const out: { documento: DocumentoPlanejamento; restanteMaterial: number }[] = [];
  for (const d of docs) {
    let rest = 0;
    let tem = false;
    for (const it of d.itens || []) {
      if (!linhaPlanejamentoMesmoCodigo(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento), cod)) continue;
      tem = true;
      const qProj = Number(it.quantidade) || 0;
      const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
      rest += Math.max(0, qProj - qAt);
    }
    if (tem) {
      out.push({ documento: d, restanteMaterial: rest });
    }
  }
  out.sort((a, b) => {
    if (b.restanteMaterial !== a.restanteMaterial) return b.restanteMaterial - a.restanteMaterial;
    return String(a.documento.numero ?? '').localeCompare(String(b.documento.numero ?? ''));
  });
  return out;
}

/**
 * Baixa por código de barras ou código do material (vários documentos), como `atenderPorCodigoBarras` no HTML.
 *
 * `continuacao`: quando o operador já registou uma baixa por código nesta sessão e quer mais itens no **mesmo**
 * protocolo (um único `atendimentoLotes` + mesmo `loteNumero` / `loteId` no histórico), como no atendimento por desenho.
 *
 * `apenasDocumentoId`: quando definido (ex.: desenho de referência aberto no app), a baixa **não** reparte por outros
 * desenhos — só consome pendência nesse documento; quantidade acima disso é rejeitada (regra alinhada ao atendimento por linhas no PC).
 */
export function aplicarAtendimentoPorCodigoBarras(
  payload: IsoSnapshotPayload,
  codigoLido: string,
  quantidade: number,
  atendenteNome: string,
  recebedor: string,
  matriculaAtendente: string = '-',
  continuacao?: { loteNumero: string; loteId: number } | null,
  opcoes?: {
    apenasDocumentoId?: string | number | null;
    /** Mobile: baixa por código exige desenho de referência válido (nunca reparte silenciosamente em todos os desenhos). */
    exigirDocumentoReferencia?: boolean;
    identificacaoComplementar?: IdentificacaoComplementarAtendimentoHistorico;
    /** Numero reservado na nuvem (atomico) antes da primeira baixa da sessao. */
    reservaInicial?: { loteNumero: string; loteId: number } | null;
  },
):
  | {
      ok: true;
      payload: IsoSnapshotPayload;
      loteNumero: string;
      loteId: number;
      atendidoTotal: number;
      material: Material;
      documentosGravados: string[];
    }
  | { ok: false; erro: string } {
  const material = resolverMaterialParaBaixaPorCodigo(payload, codigoLido);
  if (!material || !material.codigo) {
    return { ok: false, erro: 'Material não encontrado para este código ou código de barras.' };
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { ok: false, erro: 'Quantidade inválida.' };
  }
  const atendente = (atendenteNome || '').trim() || 'App móvel';
  const matricula = (matriculaAtendente || '').trim() || '-';
  const receb = (recebedor || '').trim();
  if (!receb) return { ok: false, erro: 'Informe quem recebeu o material.' };
  const extraIdent = sliceIdentificacaoComplementarParaHistorico(opcoes?.identificacaoComplementar);

  const restritoId =
    opcoes?.apenasDocumentoId != null && String(opcoes.apenasDocumentoId).trim() !== ''
      ? String(opcoes.apenasDocumentoId).trim()
      : null;

  if (opcoes?.exigirDocumentoReferencia && !restritoId) {
    return {
      ok: false,
      erro:
        'Documento de referência inválido ou sem identificador no planejamento. Busque o desenho novamente antes de dar baixa.',
    };
  }

  if (restritoId && !materialTemDemandaPendenteNoDocumento(payload, restritoId, String(material.codigo ?? ''))) {
    return {
      ok: false,
      erro: `O material ${String(material.codigo ?? codigoLido)} não possui pendência no desenho de referência aberto. Abra o desenho correto ou escolha outro item.`,
    };
  }

  const docsValidacao = (payload.documentos || []) as DocumentoPlanejamento[];
  const docsParaFifo = restritoId
    ? docsValidacao.filter((d) => String(d.id ?? '') === restritoId)
    : docsValidacao;

  if (restritoId && docsParaFifo.length === 0) {
    return { ok: false, erro: 'Documento de referência não encontrado no planejamento.' };
  }

  let restCheck = quantidade;
  let possivel = 0;
  for (const d0 of docsParaFifo) {
    for (const it0 of d0.itens || []) {
      const cLinha = codigoNaLinhaPlanejamento(it0 as DocumentoItemPlanejamento);
      if (codigoMaterialKey(cLinha) !== codigoMaterialKey(String(material.codigo ?? ''))) continue;
      const qProj0 = Number(it0.quantidade) || 0;
      const qAt0 = quantidadeAtendidaLinha(it0 as DocumentoItemPlanejamento);
      const pend0 = qProj0 - qAt0;
      if (pend0 <= 0 || restCheck <= 0) continue;
      const qAp0 = Math.min(restCheck, pend0);
      possivel += qAp0;
      restCheck -= qAp0;
    }
  }
  if (possivel <= 0) {
    return {
      ok: false,
      erro: restritoId
        ? 'Não há demanda pendente para esse material neste desenho de referência.'
        : 'Não há demanda pendente para esse material nos documentos de planejamento.',
    };
  }

  if (quantidade > possivel + 1e-9) {
    return {
      ok: false,
      erro: restritoId
        ? `Quantidade acima do que ainda falta atender neste desenho (máx. ${possivel.toFixed(3)} un. no planejamento). Reduza ou escolha outro desenho.`
        : `Quantidade acima da pendência total no planejamento para este material (máx. ${possivel.toFixed(3)}).`,
    };
  }

  const saldoMap = buildSaldoOperacionalParaAtendimento(payload);
  const saldo = saldoMap.get(codigoMaterialKey(String(material.codigo))) ?? 0;
  if (saldo <= 0) {
    return {
      ok: false,
      erro:
        'Sem saldo de estoque para este material: é necessário recebimento no sistema (e conferência, se o recebimento exigir) antes de atender. Confira recebimentos no I.S.O PRO.',
    };
  }
  if (quantidade > saldo + 1e-9) {
    return {
      ok: false,
      erro: `Saldo insuficiente no estoque para ${String(material.codigo)}: disponível ${saldo.toFixed(3)} (recebimentos − já atendido + ajustes), pedido ${quantidade}.`,
    };
  }

  const next: IsoSnapshotPayload = { ...payload };
  garantirIdsDocumentosPlanejamento(next);
  const docsOrig = (next.documentos || []) as DocumentoPlanejamento[];
  const docs = [...docsOrig];

  /** Só clona o desenho que vai ser alterado (evita O(n) desenhos × itens em cada baixa por código). */
  const cloneDocById = (docId: string): DocumentoPlanejamento | null => {
    const idx = docs.findIndex((d) => String(d.id ?? '') === docId);
    if (idx === -1) return null;
    if (docs[idx] === docsOrig[idx]) {
      const src = docs[idx]!;
      docs[idx] = {
        ...src,
        itens: Array.isArray(src.itens) ? src.itens.map((it) => ({ ...it })) : [],
      };
    }
    return docs[idx]!;
  };

  next.configuracoesSistema = { ...(next.configuracoesSistema || {}) };

  const usarContinuacao =
    continuacao &&
    String(continuacao.loteNumero || '').trim() &&
    typeof continuacao.loteId === 'number' &&
    Number.isFinite(continuacao.loteId);

  let loteNumero: string;
  let loteId: number;
  if (usarContinuacao) {
    loteNumero = String(continuacao!.loteNumero).trim();
    loteId = continuacao!.loteId;
  } else {
    const alocado = alocarNovoLote(next, opcoes?.reservaInicial);
    loteNumero = alocado.loteNumero;
    loteId = alocado.loteId;
  }

  const historicoBase = [...((next.atendimentoHistorico || []) as Record<string, unknown>[])];
  const novasLinhasHistorico: Record<string, unknown>[] = [];
  let hid = nextHistoricoId(historicoBase as { id?: number }[]);
  let restante = quantidade;
  let atendidoTotal = 0;
  const documentosGravados = new Set<string>();

  const docsAplicar = restritoId ? docsOrig.filter((d) => String(d.id ?? '') === restritoId) : docsOrig;

  for (let d = 0; d < docsAplicar.length && restante > 0; d++) {
    const docRef = docsAplicar[d]!;
    const docId = String(docRef.id ?? '');
    const doc = cloneDocById(docId);
    if (!doc) continue;
    const itens = doc.itens || [];
    for (let ii = 0; ii < itens.length && restante > 0; ii++) {
      const item = itens[ii] as DocumentoItemPlanejamento;
      const cLinha = codigoNaLinhaPlanejamento(item);
      if (codigoMaterialKey(cLinha) !== codigoMaterialKey(String(material.codigo ?? ''))) continue;
      const qProj = Number(item.quantidade) || 0;
      const qAt = quantidadeAtendidaLinha(item);
      const pendente = qProj - qAt;
      if (pendente <= 0) continue;
      const qtdAplicar = Math.min(restante, pendente);
      item.quantidadeAtendida = qAt + qtdAplicar;
      documentosGravados.add(String(doc.numero ?? '-'));
      hid += 1;
      novasLinhasHistorico.push({
        id: hid,
        loteId,
        loteNumero,
        data: new Date().toISOString(),
        documento: doc.numero || '-',
        documentoId: doc.id ?? null,
        documentoItemId: (item as { id?: string | number }).id ?? null,
        codigo: cLinha,
        descricao: descricaoNaLinhaPlanejamento(item),
        quantidade: qtdAplicar,
        unidade: item.unidade,
        atendente,
        matricula,
        recebedor: receb,
        origem: 'mobile',
        ...extraIdent,
      });
      restante -= qtdAplicar;
      atendidoTotal += qtdAplicar;
    }
  }

  if (restante > 1e-6) {
    return {
      ok: false,
      erro:
        'Não foi possível aplicar toda a quantidade no planejamento (dados inconsistentes). Recarregue o snapshot e tente de novo.',
    };
  }

  next.atendimentoHistorico = [...historicoBase, ...novasLinhasHistorico];

  if (!usarContinuacao) {
    next.atendimentoLotes = [
      ...((next.atendimentoLotes || []) as AtendimentoLote[]),
      {
        id: loteId,
        numero: loteNumero,
        data: new Date().toISOString(),
        tipo: 'codigo_barras',
        documento: 'MULTIPLOS',
        atendente,
        matricula,
        recebedor: receb,
        ...extraIdent,
      },
    ];
  }

  next.documentos = docs;
  next.dataAtualizacao = new Date().toISOString();
  return {
    ok: true,
    payload: next,
    loteNumero,
    loteId,
    atendidoTotal,
    material,
    documentosGravados: Array.from(documentosGravados),
  };
}

export function montarTextoReciboCodigoBarras(
  loteNumero: string,
  material: Material,
  atendidoTotal: number,
  atendente: string,
  recebedor: string,
  matriculaAtendente?: string
): string {
  const mat = matriculaAtendente && matriculaAtendente !== '-' ? ` · Mat.: ${matriculaAtendente}` : '';
  return [
    `I.S.O PRO — Atendimento por código`,
    `Protocolo: ${loteNumero}`,
    `Material: ${material.codigo ?? ''} — ${(material.descricao ?? '').slice(0, 100)}`,
    `Quantidade: ${atendidoTotal} ${material.unidade ?? 'UN'}`,
    `Atendente: ${atendente}${mat}`,
    `Quem recebeu: ${recebedor}`,
    ``,
    new Date().toLocaleString('pt-BR'),
  ].join('\n');
}

export interface LinhaReciboCodigoBarrasSessao {
  loteNumero: string;
  material: Material;
  atendidoTotal: number;
}

/** Sessão unificada: baixas por código e/ou por documento (mesmo destinatário, um comprovante ao finalizar). */
export type LinhaSessaoAtendimento =
  | {
      tipo: 'codigo_barras';
      loteNumero: string;
      material: Material;
      atendidoTotal: number;
      /** Desenho aberto no registo — o ecrã pode limpar `doc` antes do recibo final. */
      documentoPlanejamento?: {
        numero: string;
        revisao: string;
        descricao: string;
        responsavel?: string;
      } | null;
      /** Desenhos onde a baixa foi gravada no planejamento (pode diferir do ref. se corrigido). */
      documentosGravados?: string[];
    }
  | {
      tipo: 'documento';
      loteNumero: string;
      docNumero: string;
      docRevisao: string;
      docDesc: string;
      docResponsavel?: string;
      itens: { codigo: string; qtd: number; unidade: string; descricao: string }[];
    };

/** Opcional: alinhar o texto do recibo mobile ao comprovante impresso do I.S.O PRO no PC. */
export type ContextoReciboSessaoMobile = {
  /** Desenho de referência aberto no ecrã (cabeçalho como no desktop). */
  documentoReferencia?: Pick<DocumentoPlanejamento, 'numero' | 'revisao' | 'descricao' | 'responsavel'> | null;
  /** `payload.configuracoesSistema` — cliente, projeto, contrato, local (igual ao PC). */
  configuracoesSistema?: Record<string, unknown> | null;
  /** Matrícula/função do retirante e função do operador (alinhado ao recibo do PC). */
  identificacaoAssinaturas?: {
    atendenteFuncao?: string;
    recebedorMatricula?: string;
    recebedorFuncao?: string;
  };
};

function cfgStr(cfg: Record<string, unknown> | null | undefined, key: string): string {
  const v = cfg?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Valor legível no recibo; vazio ou «-» vira traço tipográfico. */
function textoCampoReciboOpcional(v: string | undefined | null): string {
  const t = String(v ?? '').trim();
  if (!t || t === '-') return '—';
  return t;
}

/** Matrícula + função numa linha (recibo assinaturas / identificação). */
function linhaMatriculaFuncaoReciboCompacta(matExibicao: string, funcaoExibicao: string): string {
  return linhaMatriculaFuncaoAssinatura(matExibicao, funcaoExibicao);
}

function lotesNaSessao(linhas: LinhaSessaoAtendimento[]): string[] {
  const s = new Set<string>();
  for (const L of linhas) {
    const n = String(L.loteNumero ?? '').trim();
    if (n) s.add(n);
  }
  return [...s];
}

function documentosUnicosNaSessao(linhas: LinhaSessaoAtendimento[]): string[] {
  const s = new Set<string>();
  for (const L of linhas) {
    if (L.tipo === 'documento') {
      const n = String(L.docNumero ?? '').trim();
      if (n) s.add(n);
      continue;
    }
    for (const d of L.documentosGravados ?? []) {
      const n = String(d ?? '').trim();
      if (n && n !== '-') s.add(n);
    }
    const ref = L.documentoPlanejamento?.numero?.trim();
    if (ref) s.add(ref);
  }
  return Array.from(s);
}

function documentoExibicaoLinhaSessao(row: LinhaSessaoAtendimento): string {
  if (row.tipo === 'documento') return String(row.docNumero ?? '—');
  const gravados = (row.documentosGravados ?? []).map((d) => String(d).trim()).filter(Boolean);
  if (gravados.length === 1) return gravados[0]!;
  if (gravados.length > 1) return gravados.join(' · ');
  return String(row.documentoPlanejamento?.numero ?? '—');
}

function chaveDesenhoLinhaCodigoBarras(
  row: Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }>,
): string {
  const gravado = (row.documentosGravados ?? []).map((d) => String(d).trim()).find(Boolean);
  if (gravado) return gravado;
  return String(row.documentoPlanejamento?.numero ?? '').trim() || '__sem_desenho__';
}

/** Lotes distintos presentes na sessão (para reconstruir recibo a partir do histórico). */
export function lotesDistintosNaSessaoAtendimento(
  linhas: LinhaSessaoAtendimento[],
  loteRef?: { loteNumero: string; loteId: number } | null,
): { loteId: number; loteNumero: string }[] {
  if (loteRef?.loteNumero && typeof loteRef.loteId === 'number') {
    return [loteRef];
  }
  const nums = [...new Set(linhas.map((l) => String(l.loteNumero ?? '').trim()).filter(Boolean))];
  return nums.map((loteNumero) => ({ loteId: NaN, loteNumero }));
}

/** Recibo fiel ao que foi gravado — reconstrói linhas a partir de `atendimentoHistorico`. */
export function reconstruirLinhasReciboSessaoDoHistorico(
  payload: IsoSnapshotPayload,
  lotes: { loteId: number; loteNumero: string }[],
): LinhaSessaoAtendimento[] {
  if (!lotes.length) return [];
  const historico = (payload.atendimentoHistorico ?? []) as Record<string, unknown>[];
  const docs = (payload.documentos ?? []) as DocumentoPlanejamento[];
  const out: LinhaSessaoAtendimento[] = [];

  for (const lote of lotes) {
    const num = String(lote.loteNumero ?? '').trim();
    const linhasHist = historico
      .filter((h) => h.loteId === lote.loteId && String(h.loteNumero ?? '').trim() === num)
      .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));

    for (const h of linhasHist) {
      const codigo = String(h.codigo ?? '').trim();
      const mat =
        (codigo ? resolverMaterialParaBaixaPorCodigo(payload, codigo) : null) ??
        ({
          codigo: codigo || '—',
          descricao: String(h.descricao ?? ''),
          unidade: String(h.unidade ?? 'UN'),
        } as Material);
      const docId = h.documentoId != null ? String(h.documentoId) : '';
      const docNum = String(h.documento ?? '').trim();
      const doc =
        docs.find((d) => docId && String(d.id ?? '') === docId) ??
        (docNum ? docs.find((d) => String(d.numero ?? '').trim() === docNum) : undefined);

      out.push({
        tipo: 'codigo_barras',
        loteNumero: num,
        material: mat,
        atendidoTotal: Number(h.quantidade) || 0,
        documentoPlanejamento: doc
          ? {
              numero: String(doc.numero ?? docNum),
              revisao: String(doc.revisao ?? ''),
              descricao: String(doc.descricao ?? ''),
              responsavel: String(doc.responsavel ?? '').trim() || undefined,
            }
          : docNum
            ? { numero: docNum, revisao: '', descricao: '', responsavel: undefined }
            : null,
        documentosGravados: docNum ? [docNum] : [],
      });
    }
  }
  return out;
}

/** Preferir histórico (fonte de verdade) quando a sessão em memória perdeu linhas. */
export function linhasReciboSessaoComFallbackHistorico(
  payload: IsoSnapshotPayload,
  linhasSessao: LinhaSessaoAtendimento[],
  loteRef?: { loteNumero: string; loteId: number } | null,
): LinhaSessaoAtendimento[] {
  if (!linhasSessao.length) return linhasSessao;
  const lotes = lotesDistintosNaSessaoAtendimento(linhasSessao, loteRef);
  if (!lotes.length) return linhasSessao;
  const historico = (payload.atendimentoHistorico ?? []) as Record<string, unknown>[];
  const lotesResolvidos = lotes.map((l) => {
    if (Number.isFinite(l.loteId)) return l;
    const rows = historico.filter((h) => String(h.loteNumero ?? '').trim() === l.loteNumero);
    const ids = [...new Set(rows.map((h) => h.loteId).filter((id): id is number => typeof id === 'number'))];
    if (ids.length === 1) return { loteNumero: l.loteNumero, loteId: ids[0]! };
    return l;
  }).filter((l) => Number.isFinite(l.loteId));
  if (!lotesResolvidos.length) return linhasSessao;
  const doHistorico = reconstruirLinhasReciboSessaoDoHistorico(payload, lotesResolvidos);
  if (doHistorico.length > 0) return doHistorico;
  return linhasSessao;
}

function montarHtmlTabelaItensReciboSessao(linhas: LinhaSessaoAtendimento[]): {
  html: string;
  totalUnidades: number;
  qtdItens: number;
} {
  const mostrarColDoc = documentosUnicosNaSessao(linhas).length > 1;
  const rows: string[] = [];
  let idx = 0;
  let total = 0;
  let i = 0;

  while (i < linhas.length) {
    const row = linhas[i]!;
    if (row.tipo === 'documento') {
      for (const it of row.itens) {
        rows.push(
          htmlLinhaItemRecibo(
            idx,
            it.codigo,
            it.descricao,
            it.unidade,
            Number(it.qtd) || 0,
            mostrarColDoc ? row.docNumero : undefined,
          ),
        );
        idx += 1;
        total += Number(it.qtd) || 0;
      }
      i += 1;
      continue;
    }
    const proto = row.loteNumero;
    while (i < linhas.length && linhas[i]!.tipo === 'codigo_barras' && linhas[i]!.loteNumero === proto) {
      const x = linhas[i] as Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }>;
      rows.push(
        htmlLinhaItemRecibo(
          idx,
          String(x.material.codigo ?? '—'),
          String(x.material.descricao ?? '—'),
          String(x.material.unidade ?? 'UN'),
          Number(x.atendidoTotal) || 0,
          mostrarColDoc ? documentoExibicaoLinhaSessao(x) : undefined,
        ),
      );
      idx += 1;
      total += Number(x.atendidoTotal) || 0;
      i += 1;
    }
  }

  const thDoc = mostrarColDoc ? '<th class="col-doc">Documento</th>' : '';

  const html =
    '<div class="recibo-tabela-wrap">' +
    '<table class="recibo-tabela-itens">' +
    '<thead><tr>' +
    '<th class="col-num">#</th>' +
    thDoc +
    '<th class="col-codigo">Codigo</th>' +
    '<th class="col-desc">Descricao do material</th>' +
    '<th class="col-un">UN</th>' +
    '<th class="col-qtd">Qtd</th>' +
    '</tr></thead><tbody>' +
    rows.join('') +
    '</tbody></table></div>';

  return { html, totalUnidades: total, qtdItens: idx };
}

/** Gravado em `atendimentoHistorico` / `atendimentoLotes` para o PC exibir matrícula e função no recibo. */
export type IdentificacaoComplementarAtendimentoHistorico = {
  atendenteFuncao?: string;
  recebedorMatricula?: string;
  recebedorFuncao?: string;
};

function sliceIdentificacaoComplementarParaHistorico(
  id?: IdentificacaoComplementarAtendimentoHistorico | null,
): Record<string, string> {
  if (!id) return {};
  const o: Record<string, string> = {};
  const af = (id.atendenteFuncao ?? '').trim();
  if (af && af !== '—') o.atendenteFuncao = af;
  const rm = (id.recebedorMatricula ?? '').trim();
  if (rm && rm !== '-') o.recebedorMatricula = rm;
  const rf = (id.recebedorFuncao ?? '').trim();
  if (rf && rf !== '—') o.recebedorFuncao = rf;
  return o;
}

/** Largura alvo por linha no texto do recibo (partilha / impressão). */
const REC_WRAP = 78;

/**
 * Quebra texto em linhas com indentação: palavras quando possível; tokens longos (ex.: código de material) partem à força.
 */
function quebrarTextoParaRecibo(texto: string, largura: number, indent: string): string[] {
  const t = String(texto ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!t) return [`${indent}—`];

  const linhas: string[] = [];
  const palavras = t.split(/\s+/).filter(Boolean);

  let linhaAtual = '';

  const flush = () => {
    if (linhaAtual) {
      linhas.push(indent + linhaAtual);
      linhaAtual = '';
    }
  };

  for (const p of palavras) {
    if (p.length > largura) {
      flush();
      for (let i = 0; i < p.length; i += largura) {
        linhas.push(indent + p.slice(i, i + largura));
      }
      continue;
    }
    const tentativa = linhaAtual ? `${linhaAtual} ${p}` : p;
    if (tentativa.length <= largura) {
      linhaAtual = tentativa;
    } else {
      flush();
      linhaAtual = p;
    }
  }
  flush();
  return linhas;
}

function ultimoLoteNumeroSessao(linhas: LinhaSessaoAtendimento[]): string {
  let last = '';
  for (const L of linhas) {
    if (L.loteNumero) last = String(L.loteNumero);
  }
  return last || '—';
}

/** Formata quantidade + unidade para partilha (WhatsApp reconhece *negrito*). */
function linhaQtdUnReciboCompartilhavel(qtd: number, unidade: string): string {
  const q = Number(qtd) || 0;
  const un = String(unidade ?? 'UN').trim() || 'UN';
  return `*${q.toLocaleString('pt-BR')} ${un}*`;
}

function tituloDocumentoReciboCompartilhavel(numero: string, revisao?: string): string {
  const num = String(numero ?? '').trim() || '—';
  const rev = String(revisao ?? '').trim();
  return rev ? `${num} Rev. ${rev}` : num;
}

function linhasItemReciboCompartilhavel(
  indice: number,
  codigo: string,
  qtd: number,
  unidade: string,
  descricao: string,
): string[] {
  const cod = String(codigo ?? '—').replace(/\|/g, '/').trim() || '—';
  const desc0 = String(descricao ?? '—').replace(/\s+/g, ' ').trim() || '—';
  return [
    `*${indice}.* ${cod} · ${linhaQtdUnReciboCompartilhavel(qtd, unidade)}`,
    ...quebrarTextoParaRecibo(desc0, REC_WRAP - 2, '   '),
  ];
}

function linhasListaDocumentosProtocolo(docs: string[]): string[] {
  if (docs.length <= 1) return [];
  const out: string[] = [`*Documentos no protocolo (${docs.length}):*`];
  docs.forEach((d, i) => {
    out.push(`${i + 1}. ${d}`);
  });
  out.push('');
  return out;
}

function docRefCabecalhoTemConteudo(
  d: Pick<DocumentoPlanejamento, 'numero' | 'revisao' | 'descricao' | 'responsavel'> | null | undefined,
): boolean {
  if (!d) return false;
  return Boolean(
    String(d.numero ?? '').trim() ||
      String(d.revisao ?? '').trim() ||
      String(d.descricao ?? '').trim() ||
      String(d.responsavel ?? '').trim(),
  );
}

/** Quando o contexto não traz mais o desenho (ex.: baixa por código limpou o ecrã), recupera do próprio histórico da sessão. */
function documentoReferenciaAPartirDasLinhas(
  linhas: LinhaSessaoAtendimento[],
): Pick<DocumentoPlanejamento, 'numero' | 'revisao' | 'descricao' | 'responsavel'> | null {
  for (const L of linhas) {
    if (L.tipo === 'documento') {
      if (!String(L.docNumero ?? '').trim() && !String(L.docDesc ?? '').trim()) continue;
      return {
        numero: L.docNumero ?? '',
        revisao: L.docRevisao ?? '',
        descricao: L.docDesc ?? '',
        responsavel: (L.docResponsavel ?? '').trim(),
      };
    }
    const dp = L.documentoPlanejamento;
    if (L.tipo === 'codigo_barras' && dp && String(dp.numero ?? '').trim()) {
      return {
        numero: dp.numero,
        revisao: dp.revisao ?? '',
        descricao: dp.descricao ?? '',
        responsavel: (dp.responsavel ?? '').trim(),
      };
    }
  }
  return null;
}

/**
 * Itens agrupados por desenho — legível no WhatsApp (sem tabela ASCII / pipes).
 */
function montarLinhasTabelaReciboPc(linhas: LinhaSessaoAtendimento[]): { rows: string[]; totalUnidades: number } {
  const rows: string[] = [];
  let idx = 0;
  let total = 0;
  let i = 0;

  while (i < linhas.length) {
    const row = linhas[i]!;
    if (row.tipo === 'documento') {
      rows.push('');
      rows.push(`*${tituloDocumentoReciboCompartilhavel(row.docNumero, row.docRevisao)}*`);
      for (const it of row.itens) {
        idx += 1;
        const q = Number(it.qtd) || 0;
        total += q;
        rows.push(...linhasItemReciboCompartilhavel(idx, it.codigo, q, it.unidade, it.descricao));
      }
      i += 1;
      continue;
    }
    const proto = row.loteNumero;
    const run: LinhaSessaoAtendimento[] = [];
    while (i < linhas.length && linhas[i]!.tipo === 'codigo_barras' && linhas[i]!.loteNumero === proto) {
      run.push(linhas[i]!);
      i += 1;
    }
    const porDesenho = new Map<string, Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }>[]>();
    for (const r of run) {
      if (r.tipo !== 'codigo_barras') continue;
      const k = chaveDesenhoLinhaCodigoBarras(r);
      const arr = porDesenho.get(k) ?? [];
      arr.push(r);
      porDesenho.set(k, arr);
    }
    for (const grupo of porDesenho.values()) {
      const primeiroComDoc = grupo.find((r) => Boolean(r.documentoPlanejamento?.numero?.trim()));
      rows.push('');
      if (primeiroComDoc?.documentoPlanejamento) {
        const dp = primeiroComDoc.documentoPlanejamento;
        rows.push(`*${tituloDocumentoReciboCompartilhavel(dp.numero, dp.revisao)}*`);
        if (String(dp.responsavel ?? '').trim()) {
          rows.push(`   Responsável: ${String(dp.responsavel).trim()}`);
        }
      } else {
        rows.push(`*Baixa por código · ${proto}*`);
      }
      for (const x of grupo) {
        idx += 1;
        const q = Number(x.atendidoTotal) || 0;
        total += q;
        rows.push(
          ...linhasItemReciboCompartilhavel(
            idx,
            String(x.material.codigo ?? '—'),
            q,
            String(x.material.unidade ?? 'UN'),
            String(x.material.descricao ?? '—'),
          ),
        );
      }
    }
  }
  return { rows, totalUnidades: total };
}

/** Um único texto de recibo com várias baixas por código (mesma sessão / mesmo destinatário). */
export function montarTextoReciboCodigoBarrasSessao(
  linhas: LinhaReciboCodigoBarrasSessao[],
  atendente: string,
  recebedor: string,
  matriculaAtendente?: string,
  contexto?: ContextoReciboSessaoMobile,
): string {
  const unificadas: LinhaSessaoAtendimento[] = linhas.map((L) => ({
    tipo: 'codigo_barras' as const,
    loteNumero: L.loteNumero,
    material: L.material,
    atendidoTotal: L.atendidoTotal,
  }));
  return montarTextoReciboSessaoUnificada(unificadas, atendente, recebedor, matriculaAtendente, contexto);
}

/**
 * Comprovante único (sessão mobile): estrutura alinhada ao HTML do PC (`imprimirReciboAtendimento` —
 * cabeçalho, dados do documento quando existir, tabela de itens, total, assinaturas).
 */
export function montarTextoReciboSessaoUnificada(
  linhas: LinhaSessaoAtendimento[],
  atendente: string,
  recebedor: string,
  matriculaAtendente?: string,
  contexto?: ContextoReciboSessaoMobile,
): string {
  if (linhas.length === 0) return '';
  const cfg = contexto?.configuracoesSistema;
  const docRef =
    documentosUnicosNaSessao(linhas).length === 1
      ? documentoReferenciaAPartirDasLinhas(linhas) ??
        (docRefCabecalhoTemConteudo(contexto?.documentoReferencia ?? undefined)
          ? contexto?.documentoReferencia ?? null
          : null)
      : null;
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const idAs = contexto?.identificacaoAssinaturas;
  const matBrutaAt = (matriculaAtendente ?? '').trim();
  const matAtRecibo = textoCampoReciboOpcional(matBrutaAt || undefined);
  const funAtRecibo = textoCampoReciboOpcional(idAs?.atendenteFuncao);
  const matRecRecibo = textoCampoReciboOpcional(idAs?.recebedorMatricula);
  const funRecRecibo = textoCampoReciboOpcional(idAs?.recebedorFuncao);

  const cliente = cfgStr(cfg, 'cliente');
  const projeto = cfgStr(cfg, 'projeto');
  const contrato = cfgStr(cfg, 'contrato');
  const local = cfgStr(cfg, 'local');
  const temCfg = Boolean(cliente || projeto || contrato || local);

  const refLote = ultimoLoteNumeroSessao(linhas);
  const { rows: linhasTab, totalUnidades } = montarLinhasTabelaReciboPc(linhas);
  const docsProtocolo = documentosUnicosNaSessao(linhas);

  const out: string[] = [
    '*I.S.O PRO — Recibo de retirada de material*',
    '',
    `*Protocolo:* ${refLote}`,
    `*Gerado:* ${geradoEm}`,
    '',
  ];

  if (temCfg) {
    out.push('*Dados do projeto*');
    if (cliente) out.push(`Cliente: ${cliente}`);
    if (projeto) out.push(`Projeto: ${projeto}`);
    if (contrato) out.push(`Contrato: ${contrato}`);
    if (local) out.push(`Local: ${local}`);
    out.push('');
  }

  out.push('*Identificação*');
  out.push('*Quem retirou*');
  out.push(...quebrarTextoParaRecibo(recebedor, REC_WRAP - 2, ''));
  out.push(linhaMatriculaFuncaoReciboCompacta(matRecRecibo, funRecRecibo));
  out.push('');
  out.push('*Operador (atendente)*');
  out.push(...quebrarTextoParaRecibo(atendente, REC_WRAP - 2, ''));
  out.push(linhaMatriculaFuncaoReciboCompacta(matAtRecibo, funAtRecibo));
  out.push('');

  if (docRefCabecalhoTemConteudo(docRef)) {
    out.push('*Documento de referência*');
    out.push(tituloDocumentoReciboCompartilhavel(docRef!.numero ?? '—', docRef!.revisao ?? ''));
    if (String(docRef!.responsavel ?? '').trim()) {
      out.push(`Responsável: ${String(docRef!.responsavel).trim()}`);
    }
    if (String(docRef!.descricao ?? '').trim()) {
      out.push(...quebrarTextoParaRecibo(String(docRef!.descricao), REC_WRAP, ''));
    }
    out.push('');
  } else {
    out.push(...linhasListaDocumentosProtocolo(docsProtocolo));
  }

  out.push('*Itens da retirada*');
  out.push(...linhasTab);
  out.push('');
  out.push(`*Total:* ${totalUnidades.toLocaleString('pt-BR')} unidades`);
  out.push('');
  out.push('_Retirada interna — colaborador cadastrado no I.S.O PRO._');
  out.push(`_Referência: ${refLote}_`);

  return out.join('\n');
}

/**
 * HTML completo para impressão (expo-print). Layout alinhado ao recibo do I.S.O PRO desktop.
 */
export function montarHtmlReciboSessaoUnificada(
  linhas: LinhaSessaoAtendimento[],
  atendente: string,
  recebedor: string,
  matriculaAtendente?: string,
  contexto?: ContextoReciboSessaoMobile,
): string {
  if (linhas.length === 0) return '';
  const cfg = contexto?.configuracoesSistema;
  const docRef =
    documentosUnicosNaSessao(linhas).length === 1
      ? documentoReferenciaAPartirDasLinhas(linhas) ??
        (docRefCabecalhoTemConteudo(contexto?.documentoReferencia ?? undefined)
          ? contexto?.documentoReferencia ?? null
          : null)
      : null;
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const idAs = contexto?.identificacaoAssinaturas;
  const matBrutaAt = (matriculaAtendente ?? '').trim();
  const matAtRecibo = textoCampoReciboOpcional(matBrutaAt || undefined);
  const funAtRecibo = textoCampoReciboOpcional(idAs?.atendenteFuncao);
  const matRecRecibo = textoCampoReciboOpcional(idAs?.recebedorMatricula);
  const funRecRecibo = textoCampoReciboOpcional(idAs?.recebedorFuncao);

  const logoUrl = resolverUrlLogoReciboMobile(cfgStr(cfg, 'logoUrl') || cfgStr(cfg, 'logoInstitucionalUrl'));
  const segRodape = segmentoRodapeInstituicaoRecibo(
    cfgStr(cfg, 'documentoRodapeNome') || DOCUMENTO_RODAPE_NOME_PADRAO,
    cfgStr(cfg, 'documentoRodapeCnpj') || DOCUMENTO_RODAPE_CNPJ_PADRAO,
  );

  const lotes = lotesNaSessao(linhas);
  const refLoteExib = lotes.length <= 1 ? refLoteLabel(linhas) : lotes.map((n) => escapeHtmlRecibo(n)).join(' · ');
  const refRodape = lotes.length === 1 ? lotes[0]! : lotes.join(' · ');

  const { html: tabelaHtml, totalUnidades, qtdItens } = montarHtmlTabelaItensReciboSessao(linhas);
  const classeDensidade = qtdItens > 6 ? ' recibo-body--denso' : '';

  const docTitulo =
    docRefCabecalhoTemConteudo(docRef) ?
      `${docRef!.numero ?? '—'} Rev. ${docRef!.revisao ?? '—'}`
    : '—';

  const docsUnicos = documentosUnicosNaSessao(linhas);
  const gridDocHtml =
    docRefCabecalhoTemConteudo(docRef) ?
      `<p><strong>Documento:</strong> ${escapeHtmlRecibo(docTitulo)}</p>
      <p><strong>Responsavel (documento):</strong> ${escapeHtmlRecibo(textoCampoReciboOpcional(docRef!.responsavel))}</p>`
    : docsUnicos.length > 1 ?
      `<p><strong>Documentos:</strong> ${escapeHtmlRecibo(docsUnicos.join(' · '))}</p>
      <p class="recibo-aviso-multi-doc">Varios desenhos neste protocolo — veja a coluna Documento na tabela abaixo.</p>`
    : '';

  const descDocHtml =
    docRefCabecalhoTemConteudo(docRef) && String(docRef!.descricao ?? '').trim() ?
      `<div class="recibo-doc-desc">
      <strong>Descricao do documento</strong>
      <p style="margin: 6px 0 0">${escapeHtmlRecibo(String(docRef!.descricao).trim())}</p>
    </div>`
    : '';

  const atendenteAss = nomeExibicaoAtendenteAssinatura(atendente, matBrutaAt || undefined);
  const metaAt = linhaMatriculaFuncaoAssinatura(matAtRecibo, funAtRecibo);
  const metaRec = linhaMatriculaFuncaoAssinatura(matRecRecibo, funRecRecibo);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recibo ${escapeHtmlRecibo(refRodape)}</title>
  <style>${cssReciboAtendimentoLayout()}</style>
</head>
<body class="recibo-body${classeDensidade}">
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRecibo(geradoEm)}</span>
    <span>Recibo ${escapeHtmlRecibo(refRodape)}</span>
  </div>

  <header class="recibo-header-main recibo-header-main--titulo-centro">
    ${htmlLogoRecibo(logoUrl)}
    <div class="inst-title-col recibo-titulo-centro">
      <h1>Recibo de retirada de material</h1>
    </div>
  </header>

  <section class="bloco recibo-bloco-info">
    <div class="grid2">
      <p><strong>Lote / atendimento:</strong> ${refLoteExib}</p>
      <p><strong>Data e hora:</strong> ${escapeHtmlRecibo(geradoEm)}</p>
      ${gridDocHtml}
    </div>
    ${descDocHtml}
  </section>

  <p class="recibo-tipo-badge" role="note">
    <strong>Retirada interna</strong> — material entregue a colaborador cadastrado; identificacao vinculada ao registro deste atendimento (arquivo e auditoria).
  </p>

  <section class="bloco recibo-bloco-itens">
    <h2>Itens desta retirada</h2>
    ${tabelaHtml}
  </section>

  <div class="recibo-fechamento">
    <div class="recibo-total-linha"><strong>Total de unidades (esta operacao):</strong> ${escapeHtmlRecibo(String(totalUnidades))}</div>

  <div class="recibo-rodape-fin">
  ${htmlAssinaturasRecibo(atendenteAss, metaAt, recebedor.trim() || '—', metaRec)}
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO${segRodape}. Conteudo para arquivo e auditoria. Referencia: ${escapeHtmlRecibo(refRodape)}.</p>
  </div>
  </div>
  </div>
</body>
</html>`;
}

function refLoteLabel(linhas: LinhaSessaoAtendimento[]): string {
  const lotes = lotesNaSessao(linhas);
  if (lotes.length === 1) return escapeHtmlRecibo(lotes[0]!);
  return escapeHtmlRecibo(ultimoLoteNumeroSessao(linhas));
}

export function gerarNumeroAtendimento(cfg: Record<string, unknown>): string {
  const seq = (Number(cfg.sequenciaAtendimento) || 0) + 1;
  cfg.sequenciaAtendimento = seq;
  return formatNumeroAtendimento(seq);
}

function alocarNovoLote(
  next: IsoSnapshotPayload,
  reservaInicial?: { loteNumero: string; loteId: number } | null,
): { loteNumero: string; loteId: number } {
  if (reservaInicial?.loteNumero && Number.isFinite(reservaInicial.loteId)) {
    return { loteNumero: String(reservaInicial.loteNumero).trim(), loteId: reservaInicial.loteId };
  }
  const { numero } = reservarProximoNumeroAtendimento(next);
  return { loteNumero: numero, loteId: Date.now() + Math.floor(Math.random() * 1000) };
}

/**
 * Regista um lote de atendimento (um documento, várias linhas), atualizando
 * `quantidadeAtendida` em cada item do documento — alinhado ao fluxo do HTML.
 */
export function aplicarAtendimentoLote(
  payload: IsoSnapshotPayload,
  documentoId: string | number,
  quantidadesPorIndice: Record<number, number>,
  atendenteNome: string,
  recebedor: string,
  matriculaAtendente: string = '-',
  /** Mesmo protocolo que baixa por código: vários «Registar» na mesma sessão = um único ATD na nuvem. */
  continuacao?: { loteNumero: string; loteId: number } | null,
  identificacaoComplementar?: IdentificacaoComplementarAtendimentoHistorico | null,
  reservaInicial?: { loteNumero: string; loteId: number } | null,
): { ok: true; payload: IsoSnapshotPayload; loteNumero: string; loteId: number } | { ok: false; erro: string } {
  const atendente = (atendenteNome || '').trim() || 'App móvel';
  const matricula = (matriculaAtendente || '').trim() || '-';
  const receb = (recebedor || '').trim();
  if (!receb) return { ok: false, erro: 'Informe quem recebeu o material.' };
  const extraIdent = sliceIdentificacaoComplementarParaHistorico(identificacaoComplementar);

  const next: IsoSnapshotPayload = { ...payload };
  garantirIdsDocumentosPlanejamento(next);
  const docs = [...((next.documentos || []) as DocumentoPlanejamento[])];
  const docIdx = docs.findIndex((d) => String(d.id) === String(documentoId));
  if (docIdx === -1) return { ok: false, erro: 'Documento não encontrado.' };

  const doc: DocumentoPlanejamento = {
    ...docs[docIdx],
    itens: Array.isArray(docs[docIdx].itens) ? docs[docIdx].itens!.map((it) => ({ ...it })) : [],
  };
  const itensDoc = doc.itens ?? [];

  for (const [idxStr, qtdRaw] of Object.entries(quantidadesPorIndice)) {
    const idx = Number(idxStr);
    const qtd = Number(qtdRaw);
    if (!Number.isFinite(qtd) || qtd <= 0) continue;
    const item = itensDoc[idx] as DocumentoItemPlanejamento | undefined;
    if (!item) {
      return { ok: false, erro: `Linha ${idx}: item não existe neste documento.` };
    }
    const qProj = Number(item.quantidade) || 0;
    const qAt = quantidadeAtendidaLinha(item);
    const restante = qProj - qAt;
    if (qtd > restante + 1e-9) {
      return {
        ok: false,
        erro: `Item ${codigoNaLinhaPlanejamento(item) || idx}: máximo ${restante.toFixed(3)} — falta atender no planejamento (não é recebimento).`,
      };
    }
  }

  const entradas = Object.entries(quantidadesPorIndice).filter(([, q]) => Number(q) > 0);
  if (entradas.length === 0) {
    return { ok: false, erro: 'Indique pelo menos uma quantidade maior que zero.' };
  }

  const saldoMap = buildSaldoOperacionalParaAtendimento(payload);
  const porCodigo = new Map<string, number>();
  for (const [idxStr, qtdRaw] of entradas) {
    const idx = Number(idxStr);
    const qtd = Number(qtdRaw);
    const item = itensDoc[idx] as DocumentoItemPlanejamento | undefined;
    if (!item) continue;
    const k = codigoMaterialKey(codigoNaLinhaPlanejamento(item));
    if (!k) continue;
    porCodigo.set(k, (porCodigo.get(k) ?? 0) + qtd);
  }
  for (const [k, qtdPedido] of porCodigo) {
    const saldo = saldoMap.get(k) ?? 0;
    if (qtdPedido > saldo + 1e-9) {
      return {
        ok: false,
        erro: `Saldo insuficiente no estoque para o material ${k}: disponível ${saldo.toFixed(3)} (recebimentos − já atendido + ajustes), pedido ${qtdPedido.toFixed(3)}.`,
      };
    }
  }

  next.configuracoesSistema = { ...(next.configuracoesSistema || {}) };

  const usarContinuacao =
    continuacao &&
    String(continuacao.loteNumero || '').trim() &&
    typeof continuacao.loteId === 'number' &&
    Number.isFinite(continuacao.loteId);

  let loteNumero: string;
  let loteId: number;
  if (usarContinuacao) {
    loteNumero = String(continuacao!.loteNumero).trim();
    loteId = continuacao!.loteId;
  } else {
    const alocado = alocarNovoLote(next, reservaInicial);
    loteNumero = alocado.loteNumero;
    loteId = alocado.loteId;
  }

  const historicoBase = [...((next.atendimentoHistorico || []) as Record<string, unknown>[])];
  const novasLinhasHistorico: Record<string, unknown>[] = [];
  let hid = nextHistoricoId(historicoBase as { id?: number }[]);

  for (const [idxStr, qtdRaw] of entradas) {
    const idx = Number(idxStr);
    const qtd = Number(qtdRaw);
    const item = itensDoc[idx] as DocumentoItemPlanejamento;
    if (!item) continue;
    const qAt = quantidadeAtendidaLinha(item);
    item.quantidadeAtendida = qAt + qtd;
    hid += 1;
    novasLinhasHistorico.push({
      id: hid,
      loteId,
      loteNumero,
      data: new Date().toISOString(),
      documento: doc.numero || '-',
      documentoId: doc.id ?? null,
      documentoItemId: (item as { id?: string | number }).id ?? null,
      codigo: codigoNaLinhaPlanejamento(item),
      descricao: descricaoNaLinhaPlanejamento(item),
      quantidade: qtd,
      unidade: item.unidade,
      atendente,
      matricula,
      recebedor: receb,
      origem: 'mobile',
      ...extraIdent,
    });
  }

  next.atendimentoHistorico = [...historicoBase, ...novasLinhasHistorico];

  if (!usarContinuacao) {
    next.atendimentoLotes = [
      ...((next.atendimentoLotes || []) as AtendimentoLote[]),
      {
        id: loteId,
        numero: loteNumero,
        data: new Date().toISOString(),
        tipo: 'documento',
        documento: doc.numero || '-',
        atendente,
        matricula,
        recebedor: receb,
        ...extraIdent,
      },
    ];
  }

  docs[docIdx] = doc;
  next.documentos = docs;
  next.dataAtualizacao = new Date().toISOString();
  return { ok: true, payload: next, loteNumero, loteId };
}

export function montarTextoRecibo(
  doc: DocumentoPlanejamento,
  loteNumero: string,
  quantidades: Record<number, number>,
  atendente: string,
  recebedor: string,
  matriculaAtendente?: string
): string {
  const mat = matriculaAtendente && matriculaAtendente !== '-' ? matriculaAtendente.trim() : '';
  const matLinhaCompacta = linhaMatriculaFuncaoReciboCompacta(textoCampoReciboOpcional(mat || undefined), '—');
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const linhas: string[] = [
    '*I.S.O PRO — Recibo de retirada de material*',
    '',
    `*Protocolo:* ${loteNumero}`,
    `*Gerado:* ${geradoEm}`,
    '',
    '*Identificação*',
    '*Quem retirou*',
    ...quebrarTextoParaRecibo(recebedor, REC_WRAP - 2, ''),
    '*Operador (atendente)*',
    ...quebrarTextoParaRecibo(atendente, REC_WRAP - 2, ''),
    ...(matLinhaCompacta !== '—' ? [matLinhaCompacta] : []),
    '',
    '*Documento*',
    tituloDocumentoReciboCompartilhavel(String(doc.numero ?? '—'), String(doc.revisao ?? '')),
    ...(String(doc.responsavel ?? '').trim() ? [`Responsável: ${String(doc.responsavel).trim()}`] : []),
    ...(String(doc.descricao ?? '').trim()
      ? quebrarTextoParaRecibo(String(doc.descricao), REC_WRAP, '')
      : []),
    '',
    '*Itens da retirada*',
  ];
  let idx = 0;
  let total = 0;
  for (const [i, q] of Object.entries(quantidades)) {
    if (!Number(q) || Number(q) <= 0) continue;
    const it = doc.itens?.[Number(i)] as DocumentoItemPlanejamento | undefined;
    if (!it) continue;
    idx += 1;
    const qn = Number(q) || 0;
    total += qn;
    linhas.push(
      ...linhasItemReciboCompartilhavel(
        idx,
        codigoNaLinhaPlanejamento(it) || '—',
        qn,
        String(it.unidade ?? 'UN'),
        descricaoNaLinhaPlanejamento(it) || '—',
      ),
    );
  }
  linhas.push('');
  linhas.push(`*Total:* ${total.toLocaleString('pt-BR')} unidades`);
  linhas.push('');
  linhas.push(`_Referência: ${loteNumero}_`);
  return linhas.join('\n');
}

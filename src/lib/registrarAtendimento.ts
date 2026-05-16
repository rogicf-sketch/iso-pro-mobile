import type {
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
  Material,
} from 'iso-pro-shared';
import { buildSaldoOperacionalParaAtendimento, codigoMaterialKey } from './saldoMaterial';

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
export function garantirIdsDocumentosPlanejamento(payload: IsoSnapshotPayload): void {
  const docs = (payload.documentos ?? []) as DocumentoPlanejamento[];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!d) continue;
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
    if (rest > 0) {
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
    identificacaoComplementar?: IdentificacaoComplementarAtendimentoHistorico;
  },
):
  | { ok: true; payload: IsoSnapshotPayload; loteNumero: string; loteId: number; atendidoTotal: number; material: Material }
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
      ? String(opcoes.apenasDocumentoId)
      : null;

  const docsOrig = (payload.documentos || []) as DocumentoPlanejamento[];
  const docsParaFifo = restritoId
    ? docsOrig.filter((d) => String(d.id ?? '') === restritoId)
    : docsOrig;

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

  const next = deepClone(payload);
  garantirIdsDocumentosPlanejamento(next);
  const docs = (next.documentos || []) as DocumentoPlanejamento[];
  for (let d = 0; d < docs.length; d++) {
    docs[d] = deepClone(docs[d]);
    docs[d].itens = Array.isArray(docs[d].itens) ? docs[d].itens!.map((it) => ({ ...it })) : [];
  }

  next.configuracoesSistema = { ...(next.configuracoesSistema || {}) };
  const cfg = next.configuracoesSistema as Record<string, unknown>;

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
    loteNumero = gerarNumeroAtendimento(cfg);
    loteId = Date.now() + Math.floor(Math.random() * 1000);
  }

  let hid = nextHistoricoId((next.atendimentoHistorico || []) as { id?: number }[]);
  let restante = quantidade;
  let atendidoTotal = 0;

  const docsAplicar = restritoId ? docs.filter((d) => String(d.id ?? '') === restritoId) : docs;

  for (let d = 0; d < docsAplicar.length && restante > 0; d++) {
    const doc = docsAplicar[d];
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
      hid += 1;
      next.atendimentoHistorico = [
        ...(next.atendimentoHistorico || []),
        {
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
        },
      ];
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

  if (!usarContinuacao) {
    next.atendimentoLotes = [
      ...(next.atendimentoLotes || []),
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
  return { ok: true, payload: next, loteNumero, loteId, atendidoTotal, material };
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
  const mOk = Boolean(matExibicao && matExibicao !== '—');
  const fOk = Boolean(funcaoExibicao && funcaoExibicao !== '—');
  if (!mOk && !fOk) return '—';
  const p: string[] = [];
  if (mOk) p.push(`Mat. ${matExibicao}`);
  if (fOk) p.push(funcaoExibicao);
  return p.join(' · ');
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

/** Quando a sessão tem um único protocolo, o cabeçalho já mostra o ATD — evita repetir nos blocos de itens. */
function loteUnicoNaSessao(linhas: LinhaSessaoAtendimento[]): string | null {
  const s = new Set<string>();
  for (const L of linhas) {
    const n = String(L.loteNumero ?? '').trim();
    if (n) s.add(n);
  }
  if (s.size === 1) return [...s][0]!;
  return null;
}

const REC_SEP = '────────────────────────────────────────────────────────';

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
 * Itens em blocos (sem truncar código/descrição): aproxima o detalhe do comprovante do PC.
 */
function montarLinhasTabelaReciboPc(linhas: LinhaSessaoAtendimento[]): { rows: string[]; totalUnidades: number } {
  const rows: string[] = [];
  let idx = 0;
  let total = 0;
  let i = 0;
  const W = REC_WRAP - 4;

  while (i < linhas.length) {
    const row = linhas[i]!;
    if (row.tipo === 'documento') {
      rows.push('');
      rows.push('  ▸ Documento (agrupamento por desenho):');
      const docTitulo = `${String(row.docNumero ?? '').trim()}  Rev. ${String(row.docRevisao ?? '').trim()}`.trim();
      rows.push(...quebrarTextoParaRecibo(docTitulo, W, '     '));
      rows.push(`     Lote / protocolo: ${row.loteNumero}`);
      rows.push(`     #  | UN | Qtd | Código | Descrição`);
      for (const it of row.itens) {
        idx += 1;
        const q = Number(it.qtd) || 0;
        total += q;
        const un = String(it.unidade ?? 'UN');
        const cod = String(it.codigo ?? '—').replace(/\|/g, '/');
        const desc0 = String(it.descricao ?? '—').replace(/\s+/g, ' ').trim();
        rows.push(`     ${String(idx).padStart(2)} | ${un.padEnd(4)} | ${String(q).padStart(5)} | ${cod}`);
        rows.push(...quebrarTextoParaRecibo(desc0, W - 5, '         '));
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
    const primeiroComDoc = run.find(
      (r): r is Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }> =>
        r.tipo === 'codigo_barras' && Boolean(r.documentoPlanejamento?.numero?.trim()),
    );
    rows.push('');
    if (primeiroComDoc?.documentoPlanejamento) {
      const dp = primeiroComDoc.documentoPlanejamento;
      rows.push('  ▸ Documento no planejamento (referência):');
      const refLinha = `${String(dp.numero).trim()}  Rev. ${String(dp.revisao ?? '').trim()}`;
      rows.push(...quebrarTextoParaRecibo(refLinha, W, '     '));
      if (String(dp.responsavel ?? '').trim()) {
        rows.push(`     Responsável: ${String(dp.responsavel).trim()}`);
      }
      if (String(dp.descricao ?? '').trim()) {
        rows.push(...quebrarTextoParaRecibo(`Descrição: ${String(dp.descricao)}`, W, '     '));
      }
    }
    rows.push(`  ▸ Lote / protocolo: ${proto} (baixa por código)`);
    rows.push(`     #  | UN | Qtd | Código | Descrição`);
    for (const r of run) {
      const x = r as Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }>;
      idx += 1;
      const q = Number(x.atendidoTotal) || 0;
      total += q;
      const un = String(x.material.unidade ?? 'UN');
      const cod = String(x.material.codigo ?? '—').replace(/\|/g, '/');
      const desc0 = String(x.material.descricao ?? '—').replace(/\s+/g, ' ').trim();
      rows.push(`     ${String(idx).padStart(2)} | ${un.padEnd(4)} | ${String(q).padStart(5)} | ${cod}`);
      rows.push(...quebrarTextoParaRecibo(desc0, W - 5, '         '));
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
    docRefCabecalhoTemConteudo(contexto?.documentoReferencia ?? undefined) ?
      contexto?.documentoReferencia ?? null
    : documentoReferenciaAPartirDasLinhas(linhas);
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

  const out: string[] = [
    REC_SEP,
    'I.S.O PRO — Recibo de retirada de material (sessão — app móvel)',
    REC_SEP,
    `Gerado em: ${geradoEm}    ·    Ref. lote: ${refLote}`,
    '',
  ];

  if (temCfg) {
    out.push('Dados do projeto (configuração):');
    if (cliente) out.push(`  Cliente:        ${cliente}`);
    if (projeto) out.push(`  Projeto:        ${projeto}`);
    if (contrato) out.push(`  Contrato:       ${contrato}`);
    if (local) out.push(`  Local:          ${local}`);
    out.push('');
  }

  out.push('Identificação:');
  out.push('  Atendido (quem retirou):');
  out.push(...quebrarTextoParaRecibo(recebedor, REC_WRAP - 4, '    '));
  out.push(`    ${linhaMatriculaFuncaoReciboCompacta(matRecRecibo, funRecRecibo)}`);
  out.push('  Atendente (operador):');
  out.push(...quebrarTextoParaRecibo(atendente, REC_WRAP - 4, '    '));
  out.push(`    ${linhaMatriculaFuncaoReciboCompacta(matAtRecibo, funAtRecibo)}`);
  out.push('');

  if (docRefCabecalhoTemConteudo(docRef)) {
    const docTitulo = `${docRef!.numero ?? '—'} Rev. ${docRef!.revisao ?? '—'}`;
    out.push('Documento de referência (planejamento):');
    out.push('  Documento (nº / revisão):');
    out.push(...quebrarTextoParaRecibo(docTitulo, REC_WRAP - 4, '    '));
    out.push('  Responsável (documento):');
    out.push(...quebrarTextoParaRecibo((docRef!.responsavel ?? '—').trim() || '—', REC_WRAP - 4, '    '));
    out.push('  Descrição do documento:');
    out.push(...quebrarTextoParaRecibo((docRef!.descricao ?? '—').trim() || '—', REC_WRAP - 4, '    '));
    out.push('');
  }

  out.push('Retirada interna:');
  out.push('  Material retirado por colaborador cadastrado (registro vinculado ao atendimento).');
  out.push('');
  out.push('Itens desta retirada (código e descrição completos, sem cortar)');
  out.push(...linhasTab);
  out.push('');
  out.push(`Total de unidades (esta sessão): ${totalUnidades.toLocaleString('pt-BR')}`);
  out.push('');
  out.push('Assinaturas:');
  out.push('');
  out.push('Atendente (operador):');
  out.push(...quebrarTextoParaRecibo(atendente, REC_WRAP - 2, '  '));
  out.push(`  ${linhaMatriculaFuncaoReciboCompacta(matAtRecibo, funAtRecibo)}`);
  out.push('');
  out.push('Atendido (quem retirou):');
  out.push(...quebrarTextoParaRecibo(recebedor, REC_WRAP - 2, '  '));
  out.push(`  ${linhaMatriculaFuncaoReciboCompacta(matRecRecibo, funRecRecibo)}`);
  out.push('');
  out.push('__________________________     __________________________');
  out.push('');
  out.push(REC_SEP);

  return out.join('\n');
}

function escapeHtmlRecibo(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blocoPreEscapedLinhas(linhas: string[]): string {
  return linhas.map((l) => escapeHtmlRecibo(l)).join('<br/>');
}

function blocoPreFromQuebra(texto: string, largura: number, indent: string): string {
  return blocoPreEscapedLinhas(quebrarTextoParaRecibo(texto, largura, indent));
}

/**
 * Corpo dos itens em HTML: tabela compacta (usa a largura A4, menos páginas que blocos empilhados).
 */
function montarHtmlBlocosReciboPc(
  linhas: LinhaSessaoAtendimento[],
  opts?: { omitProtoNumeroQuandoLote?: string | null },
): { html: string; totalUnidades: number } {
  const omit = (opts?.omitProtoNumeroQuandoLote ?? '').trim();
  const parts: string[] = [];
  let idx = 0;
  let total = 0;
  let i = 0;

  const thead =
    '<thead><tr>' +
    '<th class="col-num">#</th>' +
    '<th class="col-cod">Código</th>' +
    '<th class="col-desc">Descrição do material</th>' +
    '<th class="col-un">UN</th>' +
    '<th class="col-qtd">Qtd</th>' +
    '</tr></thead>';

  while (i < linhas.length) {
    const row = linhas[i]!;
    if (row.tipo === 'documento') {
      parts.push('<section class="grp">');
      parts.push('<p class="grp-tit">Documento (agrupamento por desenho)</p>');
      const docTitulo = `${String(row.docNumero ?? '').trim()}  Rev. ${String(row.docRevisao ?? '').trim()}`.trim();
      parts.push(`<p class="doc-tit">${escapeHtmlRecibo(docTitulo)}</p>`);
      if (!omit || String(row.loteNumero) !== omit) {
        parts.push(`<p class="proto">Lote / protocolo: ${escapeHtmlRecibo(String(row.loteNumero))}</p>`);
      }
      parts.push(`<table class="itens-tbl">${thead}<tbody>`);
      for (const it of row.itens) {
        idx += 1;
        const q = Number(it.qtd) || 0;
        total += q;
        const un = String(it.unidade ?? 'UN');
        parts.push(
          `<tr><td class="col-num">${idx}</td><td class="col-cod">${escapeHtmlRecibo(String(it.codigo ?? '—'))}</td>` +
            `<td class="col-desc">${escapeHtmlRecibo(String(it.descricao ?? '—'))}</td>` +
            `<td class="col-un">${escapeHtmlRecibo(un)}</td><td class="col-qtd">${escapeHtmlRecibo(String(q))}</td></tr>`,
        );
      }
      parts.push('</tbody></table></section>');
      i += 1;
      continue;
    }
    const proto = row.loteNumero;
    const run: LinhaSessaoAtendimento[] = [];
    while (i < linhas.length && linhas[i]!.tipo === 'codigo_barras' && linhas[i]!.loteNumero === proto) {
      run.push(linhas[i]!);
      i += 1;
    }
    const primeiroComDoc = run.find(
      (r): r is Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }> =>
        r.tipo === 'codigo_barras' && Boolean(r.documentoPlanejamento?.numero?.trim()),
    );
    parts.push('<section class="grp">');
    if (primeiroComDoc?.documentoPlanejamento) {
      const dp = primeiroComDoc.documentoPlanejamento;
      parts.push('<p class="sub-tit">Documento no planejamento (referência)</p>');
      const refLinha = `${String(dp.numero).trim()}  Rev. ${String(dp.revisao ?? '').trim()}`;
      parts.push(`<p class="doc-ref">${escapeHtmlRecibo(refLinha)}</p>`);
      const meta: string[] = [];
      if (String(dp.responsavel ?? '').trim()) {
        meta.push(`<span><strong>Responsável:</strong> ${escapeHtmlRecibo(String(dp.responsavel).trim())}</span>`);
      }
      if (String(dp.descricao ?? '').trim()) {
        meta.push(`<span><strong>Descrição:</strong> ${escapeHtmlRecibo(String(dp.descricao))}</span>`);
      }
      if (meta.length) parts.push(`<p class="doc-meta">${meta.join(' · ')}</p>`);
    }
    if (omit && String(proto) === omit) {
      parts.push('<p class="proto proto-hint">Baixa por código · protocolo indicado no cabeçalho deste recibo.</p>');
    } else {
      parts.push(`<p class="proto">Lote / protocolo: ${escapeHtmlRecibo(String(proto))} (baixa por código)</p>`);
    }
    parts.push(`<table class="itens-tbl">${thead}<tbody>`);
    for (const r of run) {
      const x = r as Extract<LinhaSessaoAtendimento, { tipo: 'codigo_barras' }>;
      idx += 1;
      const q = Number(x.atendidoTotal) || 0;
      total += q;
      const un = String(x.material.unidade ?? 'UN');
      parts.push(
        `<tr><td class="col-num">${idx}</td><td class="col-cod">${escapeHtmlRecibo(String(x.material.codigo ?? '—'))}</td>` +
          `<td class="col-desc">${escapeHtmlRecibo(String(x.material.descricao ?? '—'))}</td>` +
          `<td class="col-un">${escapeHtmlRecibo(un)}</td><td class="col-qtd">${escapeHtmlRecibo(String(q))}</td></tr>`,
      );
    }
    parts.push('</tbody></table></section>');
  }
  return { html: parts.join('\n'), totalUnidades: total };
}

const RECIBO_HTML_CSS = `*{box-sizing:border-box}
@page{size:A4;margin:10mm 12mm}
body{margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;font-size:9.5px;line-height:1.4;color:#0f172a;background:#e2e8f0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:100%;width:100%;margin:0 auto;padding:10px 12px 16px}
.hdr{background:linear-gradient(180deg,#1e3a5f 0%,#1a365d 100%);color:#fff;padding:12px 14px;border-radius:8px 8px 0 0;border:1px solid #0f2942;border-bottom:none}
.hdr h1{margin:0;font-size:11.5px;font-weight:700;line-height:1.3;letter-spacing:-.01em}
.hdr .meta{margin:8px 0 0;font-size:8.75px;opacity:.93;line-height:1.45}
.hdr .meta strong{font-weight:600;opacity:1}
.sheet{background:#fff;padding:12px 14px 14px;border:1px solid #c5ccd6;border-top:none;border-radius:0 0 8px 8px;box-shadow:0 4px 14px rgba(15,23,42,.07)}
.sec{margin:0;padding:12px 0;border-bottom:1px solid #e8edf3}
.itens-sec{border-bottom:none}
.sec-tit{font-weight:700;color:#1a365d;margin:0 0 10px;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase}
.id-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}
.id-slot{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 10px 8px;text-align:left}
.id-slot .slot-label{font-size:7.75px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 8px}
.id-slot .ass-nome-principal,.id-slot .ass-meta-linha{text-align:left}
.prewrap{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.def-grid{display:grid;grid-template-columns:minmax(108px,32%) 1fr;gap:8px 14px;margin:0;font-size:9px;align-items:start}
.def-grid dt{margin:0;color:#64748b;font-weight:600;line-height:1.35}
.def-grid dd{margin:0;color:#0f172a;font-weight:500;line-height:1.4}
.retirada-nota{margin:0;padding:10px 12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:9px;color:#475569;line-height:1.45}
.itens-sec{padding:4px 0 0}
.itens-sec .sec-tit{margin-bottom:8px}
.items-lead{margin:-4px 0 10px;font-size:8.25px;color:#64748b;font-weight:500}
.grp{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin:0 0 10px;background:#fafbfc;page-break-inside:avoid}
.grp:last-child{margin-bottom:0}
.grp-tit{font-weight:700;margin:0 0 6px;color:#1a365d;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase}
.sub-tit{font-weight:700;margin:0 0 4px;font-size:8.5px;color:#475569}
.doc-tit,.doc-ref{font-weight:600;margin:0 0 4px;font-size:10px;color:#0f172a}
.doc-meta{margin:6px 0 8px;font-size:8.25px;color:#475569;line-height:1.4}
.proto{font-size:8.5px;color:#475569;margin:0 0 8px;line-height:1.35}
.proto-hint{font-style:italic;color:#64748b}
.itens-tbl{width:100%;border-collapse:collapse;font-size:8.25px;margin:0;table-layout:fixed}
.itens-tbl th,.itens-tbl td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere}
.itens-tbl thead th{background:#e2e8f0;color:#1e293b;font-weight:600;text-align:left;font-size:8px}
.itens-tbl .col-num{width:5%;text-align:center}
.itens-tbl .col-cod{width:19%;font-size:7.75px}
.itens-tbl .col-desc{width:54%}
.itens-tbl .col-un{width:9%;text-align:center}
.itens-tbl .col-qtd{width:11%;text-align:right;font-variant-numeric:tabular-nums}
.itens-tbl tbody tr:nth-child(even){background:#f8fafc}
.tot{font-weight:700;margin:12px 0 0;padding:8px 12px;background:linear-gradient(180deg,#ecfdf5 0%,#d1fae5 100%);border:1px solid #a7f3d0;border-radius:8px;font-size:9.5px;color:#065f46;text-align:center}
.sig{margin:0;padding:12px 0 4px;border-top:none}
.sig .sec-tit{margin-bottom:12px}
.sig-grid-pro{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0}
.sig-block{text-align:center;padding:0 4px}
.sig-line{height:32px;margin:0 0 10px;border-bottom:2px solid #1e293b}
.sig-role{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:0 0 6px}
.ass-nome-principal{font-weight:700;font-size:10.5px;color:#0f172a;margin:0 0 4px;line-height:1.25;text-align:center}
.ass-meta-linha{font-size:8.25px;color:#64748b;margin:0 0 8px;line-height:1.35;text-align:center}
.sig-foot{font-size:7.5px;color:#94a3b8;margin:6px 0 0;font-style:italic}
.foot{margin:14px 0 0;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:7.75px;color:#94a3b8;text-align:center;line-height:1.4}
@media print{
body{background:#fff!important}
.wrap{padding:0!important;max-width:none!important}
.sheet{box-shadow:none!important;border-color:#ccc!important;padding:8px 0!important}
.grp{background:#fff!important}
.itens-tbl tbody tr:nth-child(even){background:transparent!important}
.tot{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

/**
 * HTML completo para impressão (expo-print). Mesmos dados que `montarTextoReciboSessaoUnificada`; partilha fica em texto.
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
    docRefCabecalhoTemConteudo(contexto?.documentoReferencia ?? undefined) ?
      contexto?.documentoReferencia ?? null
    : documentoReferenciaAPartirDasLinhas(linhas);
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
  const loteUnico = loteUnicoNaSessao(linhas);
  const { html: itensHtml, totalUnidades } = montarHtmlBlocosReciboPc(linhas, {
    omitProtoNumeroQuandoLote: loteUnico,
  });

  const partes: string[] = [];
  partes.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>');
  partes.push('<meta name="viewport" content="width=device-width,initial-scale=1"/>');
  partes.push(`<style>${RECIBO_HTML_CSS}</style></head><body><div class="wrap">`);
  partes.push('<header class="hdr"><h1>I.S.O PRO — Recibo de retirada de material (sessão — app móvel)</h1>');
  partes.push(
    `<p class="meta">Gerado em: <strong>${escapeHtmlRecibo(geradoEm)}</strong> · Protocolo: <strong>${escapeHtmlRecibo(String(refLote))}</strong></p></header>`,
  );
  partes.push('<div class="sheet">');

  if (temCfg) {
    partes.push('<section class="sec"><p class="sec-tit">Dados do projeto</p><dl class="def-grid">');
    if (cliente) partes.push(`<dt>Cliente</dt><dd>${escapeHtmlRecibo(cliente)}</dd>`);
    if (projeto) partes.push(`<dt>Projeto</dt><dd>${escapeHtmlRecibo(projeto)}</dd>`);
    if (contrato) partes.push(`<dt>Contrato</dt><dd>${escapeHtmlRecibo(contrato)}</dd>`);
    if (local) partes.push(`<dt>Local</dt><dd>${escapeHtmlRecibo(local)}</dd>`);
    partes.push('</dl></section>');
  }

  partes.push('<section class="sec sec-id"><p class="sec-tit">Identificação</p>');
  partes.push('<div class="id-grid">');
  partes.push('<div class="id-slot">');
  partes.push('<p class="slot-label">Atendido (quem retirou)</p>');
  partes.push(`<div class="prewrap ass-nome-principal">${blocoPreFromQuebra(recebedor, REC_WRAP - 4, '')}</div>`);
  partes.push(
    `<p class="ass-meta-linha">${escapeHtmlRecibo(linhaMatriculaFuncaoReciboCompacta(matRecRecibo, funRecRecibo))}</p>`,
  );
  partes.push('</div>');
  partes.push('<div class="id-slot">');
  partes.push('<p class="slot-label">Atendente (operador)</p>');
  partes.push(`<div class="prewrap ass-nome-principal">${blocoPreFromQuebra(atendente, REC_WRAP - 4, '')}</div>`);
  partes.push(
    `<p class="ass-meta-linha">${escapeHtmlRecibo(linhaMatriculaFuncaoReciboCompacta(matAtRecibo, funAtRecibo))}</p>`,
  );
  partes.push('</div></div></section>');

  if (docRefCabecalhoTemConteudo(docRef)) {
    const docTitulo = `${docRef!.numero ?? '—'} Rev. ${docRef!.revisao ?? '—'}`;
    partes.push('<section class="sec"><p class="sec-tit">Documento de referência (planejamento)</p>');
    partes.push('<dl class="def-grid">');
    partes.push(`<dt>Nº / revisão</dt><dd><span class="prewrap">${blocoPreFromQuebra(docTitulo, REC_WRAP - 8, '')}</span></dd>`);
    partes.push(
      `<dt>Responsável (documento)</dt><dd><span class="prewrap">${blocoPreFromQuebra((docRef!.responsavel ?? '—').trim() || '—', REC_WRAP - 8, '')}</span></dd>`,
    );
    partes.push(
      `<dt>Descrição do documento</dt><dd><span class="prewrap">${blocoPreFromQuebra((docRef!.descricao ?? '—').trim() || '—', REC_WRAP - 8, '')}</span></dd>`,
    );
    partes.push('</dl></section>');
  }

  partes.push('<section class="sec"><p class="sec-tit">Tipo de retirada</p>');
  partes.push(
    '<p class="retirada-nota"><strong>Retirada interna.</strong> Material retirado por colaborador cadastrado (registro vinculado ao atendimento).</p></section>',
  );

  partes.push('<section class="sec itens-sec">');
  partes.push('<p class="sec-tit">Itens desta retirada</p>');
  partes.push('<p class="items-lead">Quantidades e referências conforme o planejamento e o protocolo acima.</p>');
  partes.push(itensHtml);
  partes.push(
    `<p class="tot">Total de unidades (esta sessão): ${escapeHtmlRecibo(totalUnidades.toLocaleString('pt-BR'))}</p>`,
  );
  partes.push('</section>');

  partes.push('<section class="sig"><p class="sec-tit">Assinaturas</p>');
  partes.push('<div class="sig-grid-pro">');
  partes.push('<div class="sig-block">');
  partes.push('<div class="sig-line" aria-hidden="true"></div>');
  partes.push('<p class="sig-role">Atendente (operador)</p>');
  partes.push(`<div class="prewrap ass-nome-principal">${blocoPreFromQuebra(atendente, REC_WRAP - 4, '')}</div>`);
  partes.push(
    `<p class="ass-meta-linha">${escapeHtmlRecibo(linhaMatriculaFuncaoReciboCompacta(matAtRecibo, funAtRecibo))}</p>`,
  );
  partes.push('<p class="sig-foot">Assinatura do atendente</p>');
  partes.push('</div>');
  partes.push('<div class="sig-block">');
  partes.push('<div class="sig-line" aria-hidden="true"></div>');
  partes.push('<p class="sig-role">Atendido (quem retirou)</p>');
  partes.push(`<div class="prewrap ass-nome-principal">${blocoPreFromQuebra(recebedor, REC_WRAP - 4, '')}</div>`);
  partes.push(
    `<p class="ass-meta-linha">${escapeHtmlRecibo(linhaMatriculaFuncaoReciboCompacta(matRecRecibo, funRecRecibo))}</p>`,
  );
  partes.push('<p class="sig-foot">Assinatura de quem retirou</p>');
  partes.push('</div></div></section>');

  partes.push('<p class="foot">Documento gerado pelo I.S.O PRO — Campo · conferir os dados antes de assinar.</p>');
  partes.push('</div></div></body></html>');

  return partes.join('');
}

export function gerarNumeroAtendimento(cfg: Record<string, unknown>): string {
  const seq = (Number(cfg.sequenciaAtendimento) || 0) + 1;
  cfg.sequenciaAtendimento = seq;
  const data = new Date();
  const y = data.getFullYear();
  const mo = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  const numSeq = String(seq).padStart(5, '0');
  return `ATD-${y}${mo}${d}-${numSeq}`;
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
): { ok: true; payload: IsoSnapshotPayload; loteNumero: string; loteId: number } | { ok: false; erro: string } {
  const atendente = (atendenteNome || '').trim() || 'App móvel';
  const matricula = (matriculaAtendente || '').trim() || '-';
  const receb = (recebedor || '').trim();
  if (!receb) return { ok: false, erro: 'Informe quem recebeu o material.' };
  const extraIdent = sliceIdentificacaoComplementarParaHistorico(identificacaoComplementar);

  const next = deepClone(payload);
  garantirIdsDocumentosPlanejamento(next);
  const docs = (next.documentos || []) as DocumentoPlanejamento[];
  const docIdx = docs.findIndex((d) => String(d.id) === String(documentoId));
  if (docIdx === -1) return { ok: false, erro: 'Documento não encontrado.' };

  const doc: DocumentoPlanejamento = deepClone(docs[docIdx]);
  doc.itens = Array.isArray(doc.itens) ? doc.itens.map((it) => ({ ...it })) : [];

  for (const [idxStr, qtdRaw] of Object.entries(quantidadesPorIndice)) {
    const idx = Number(idxStr);
    const qtd = Number(qtdRaw);
    if (!Number.isFinite(qtd) || qtd <= 0) continue;
    const item = doc.itens[idx] as DocumentoItemPlanejamento | undefined;
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
    const item = doc.itens[idx] as DocumentoItemPlanejamento | undefined;
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
  const cfg = next.configuracoesSistema as Record<string, unknown>;

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
    loteNumero = gerarNumeroAtendimento(cfg);
    loteId = Date.now() + Math.floor(Math.random() * 1000);
  }

  let hid = nextHistoricoId((next.atendimentoHistorico || []) as { id?: number }[]);

  for (const [idxStr, qtdRaw] of entradas) {
    const idx = Number(idxStr);
    const qtd = Number(qtdRaw);
    const item = doc.itens[idx] as DocumentoItemPlanejamento;
    if (!item) continue;
    const qAt = quantidadeAtendidaLinha(item);
    item.quantidadeAtendida = qAt + qtd;
    hid += 1;
    next.atendimentoHistorico = [
      ...(next.atendimentoHistorico || []),
      {
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
      },
    ];
  }

  if (!usarContinuacao) {
    next.atendimentoLotes = [
      ...(next.atendimentoLotes || []),
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
    REC_SEP,
    'I.S.O PRO — Recibo de retirada de material (app móvel)',
    REC_SEP,
    `Gerado em: ${geradoEm}    ·    Lote / atendimento: ${loteNumero}`,
    '',
    'Identificação:',
    '  Atendido (quem retirou):',
    ...quebrarTextoParaRecibo(recebedor, REC_WRAP - 4, '    '),
    '  Atendente (operador):',
    ...quebrarTextoParaRecibo(atendente, REC_WRAP - 4, '    '),
    ...(matLinhaCompacta !== '—' ? [`    ${matLinhaCompacta}`] : []),
    '',
    'Documento:',
    '  Número / revisão:',
    ...quebrarTextoParaRecibo(`${doc.numero ?? '—'} Rev. ${doc.revisao ?? '—'}`, REC_WRAP - 4, '    '),
    '  Responsável (documento):',
    ...quebrarTextoParaRecibo(String(doc.responsavel ?? '—').trim() || '—', REC_WRAP - 4, '    '),
    '  Descrição do documento:',
    ...quebrarTextoParaRecibo((doc.descricao ?? '—').trim() || '—', REC_WRAP - 4, '    '),
    '',
    'Itens desta retirada:',
    `  #  | UN | Qtd | Código | (descrição nas linhas seguintes)`,
  ];
  let idx = 0;
  let total = 0;
  const W = REC_WRAP - 4;
  for (const [i, q] of Object.entries(quantidades)) {
    if (!Number(q) || Number(q) <= 0) continue;
    const it = doc.itens?.[Number(i)] as DocumentoItemPlanejamento | undefined;
    if (!it) continue;
    idx += 1;
    const qn = Number(q) || 0;
    total += qn;
    const un = String(it.unidade ?? '');
    const cod = String(codigoNaLinhaPlanejamento(it) || '—').replace(/\|/g, '/');
    const desc0 = String(descricaoNaLinhaPlanejamento(it) || '—').replace(/\s+/g, ' ').trim();
    linhas.push(`  ${String(idx).padStart(2)} | ${un.padEnd(4)} | ${String(qn).padStart(5)} | ${cod}`);
    linhas.push(...quebrarTextoParaRecibo(desc0, W - 2, '     '));
  }
  linhas.push('');
  linhas.push(`Total de unidades (esta operação): ${total.toLocaleString('pt-BR')}`);
  linhas.push('');
  linhas.push('Assinaturas:');
  linhas.push('');
  linhas.push('Atendente (operador):');
  linhas.push(...quebrarTextoParaRecibo(atendente, REC_WRAP - 2, '  '));
  if (matLinhaCompacta !== '—') linhas.push(`  ${matLinhaCompacta}`);
  linhas.push('');
  linhas.push('Atendido (quem retirou):');
  linhas.push(...quebrarTextoParaRecibo(recebedor, REC_WRAP - 2, '  '));
  linhas.push('');
  linhas.push('__________________________     __________________________');
  linhas.push('');
  linhas.push(REC_SEP);
  return linhas.join('\n');
}

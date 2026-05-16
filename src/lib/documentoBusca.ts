import type { DocumentoItemPlanejamento, DocumentoPlanejamento } from 'iso-pro-shared';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Remove traço/espaço no fim do que se está a digitar — «AJ-» passa a «aj» e faz match em «AJ001». */
function alvoSemSeparadorFinal(alvo: string): string {
  return alvo.replace(/[-\s._/]+$/g, '').trim();
}

/**
 * Algum segmento do número (por -/_) contém o texto ou alinha por prefixo.
 * Não usa `alvo.startsWith(segmento)` quando o segmento tem 1 carácter — evita que a letra «b»
 * de `…10006_B` faça match com pesquisas como «bcc» ou «bio».
 */
function numeroSegmentosCorrespondem(numeroRaw: string, alvo: string): boolean {
  const n = norm(String(numeroRaw ?? ''));
  const a = norm(alvo);
  if (!n || !a || a.length < 2) return false;
  const partes = n.split(/[-_/]+/).filter(Boolean);
  return partes.some((p) => {
    if (!p) return false;
    if (p.includes(a) || p.startsWith(a)) return true;
    if (p.length >= 2 && a.startsWith(p)) return true;
    return false;
  });
}

/** Código / descrição de linha do planejamento (pesquisa por material no mesmo campo do desenho). */
function itemPlanejamentoCombinaTexto(it: DocumentoItemPlanejamento | undefined, buscaTexto: string): boolean {
  const q = norm(buscaTexto);
  if (!q || !it) return false;
  const o = it as Record<string, unknown>;
  const rawCod = String(o.codigo ?? o.codigo_material ?? o.codigoMaterial ?? '');
  const c = norm(rawCod);
  const desc = norm(String(o.descricao ?? o.descricaoMaterial ?? ''));
  if (c.includes(q) || desc.includes(q)) return true;
  if (q.length >= 2 && rawCod && numeroSegmentosCorrespondem(rawCod, buscaTexto)) return true;
  return false;
}

/**
 * Quando `includes` falha: zeros à esquerda (032 vs 32), sufixo ou último segmento após -/_ .
 */
function numeroCorrespondeFlexivel(numeroRaw: string, alvo: string): boolean {
  const n = norm(String(numeroRaw ?? ''));
  const a = norm(alvo);
  if (!n || !a) return false;
  if (n.includes(a)) return false;

  const aNoLead = a.replace(/^0+/, '') || a;
  if (aNoLead !== a && n.includes(aNoLead)) return true;
  if (n.endsWith(a) || (aNoLead !== a && n.endsWith(aNoLead))) return true;

  const lastSeg = (n.split(/[-_/]+/).pop() ?? '').trim();
  if (lastSeg === a || lastSeg === aNoLead) return true;

  return false;
}

export type ResultadoBuscaDocumento =
  | { kind: 'none' }
  | { kind: 'one'; doc: DocumentoPlanejamento }
  | { kind: 'sameNumeroVarios'; docs: DocumentoPlanejamento[] }
  | { kind: 'escolher'; docs: DocumentoPlanejamento[] };

/**
 * Igual ao fluxo do atendimento/consulta: exact → includes → flexível; várias correspondências pedem escolha.
 */
export function resolverBuscaDocumentoPorNumero(
  documentos: DocumentoPlanejamento[],
  buscaTexto: string,
): ResultadoBuscaDocumento {
  const alvo = norm(buscaTexto);
  if (!alvo) return { kind: 'none' };

  const exact = documentos.filter((d) => norm(String(d.numero ?? '')) === alvo);
  if (exact.length === 1) return { kind: 'one', doc: exact[0] };
  if (exact.length > 1) return { kind: 'sameNumeroVarios', docs: exact };

  const parcial = documentos.filter((d) => norm(String(d.numero ?? '')).includes(alvo));
  if (parcial.length === 1) return { kind: 'one', doc: parcial[0] };
  if (parcial.length > 1) return { kind: 'escolher', docs: parcial };

  const alvoCore = alvoSemSeparadorFinal(alvo);
  if (alvoCore.length >= 2 && alvoCore !== alvo) {
    const porCore = documentos.filter((d) => norm(String(d.numero ?? '')).includes(alvoCore));
    if (porCore.length === 1) return { kind: 'one', doc: porCore[0] };
    if (porCore.length > 1) return { kind: 'escolher', docs: porCore };
  }

  const segAlvo = alvoCore.length >= 2 ? alvoCore : alvo;
  const porSegmento = documentos.filter((d) => numeroSegmentosCorrespondem(String(d.numero ?? ''), segAlvo));
  if (porSegmento.length === 1) return { kind: 'one', doc: porSegmento[0] };
  if (porSegmento.length > 1) return { kind: 'escolher', docs: porSegmento };

  const flex = documentos.filter((d) => numeroCorrespondeFlexivel(String(d.numero ?? ''), buscaTexto));
  if (flex.length === 1) return { kind: 'one', doc: flex[0] };
  if (flex.length > 1) return { kind: 'escolher', docs: flex };

  return { kind: 'none' };
}

/**
 * Filtro imediato ao digitar: número, revisão, descrição, responsável e segmentos do número (ex.: «232» em «AQ-3-BT-232-CS10»).
 * Ordenado por número do desenho; limitado para listas grandes.
 */
export function filtrarDocumentosPlanejamentoPorTexto(
  documentos: DocumentoPlanejamento[],
  buscaTexto: string,
  max = 50,
): DocumentoPlanejamento[] {
  const q = norm(buscaTexto);
  if (!q) return [];

  const out: DocumentoPlanejamento[] = [];
  for (const d of documentos) {
    const num = norm(String(d.numero ?? ''));
    const rev = norm(String(d.revisao ?? ''));
    const desc = norm(String(d.descricao ?? ''));
    const resp = norm(String(d.responsavel ?? ''));
    let ok = false;
    if (num.includes(q) || rev.includes(q) || desc.includes(q) || resp.includes(q)) ok = true;
    else {
      const partes = num.split(/[-_/]+/).filter(Boolean);
      if (partes.some((p) => p.includes(q) || p.startsWith(q))) ok = true;
      else if (q.length >= 2 && numeroSegmentosCorrespondem(String(d.numero ?? ''), q)) ok = true;
      else if (numeroCorrespondeFlexivel(String(d.numero ?? ''), buscaTexto)) ok = true;
    }
    if (!ok) {
      for (const it of d.itens ?? []) {
        if (itemPlanejamentoCombinaTexto(it, buscaTexto)) {
          ok = true;
          break;
        }
      }
    }
    if (ok) out.push(d);
  }
  out.sort((a, b) => String(a.numero ?? '').localeCompare(String(b.numero ?? ''), undefined, { numeric: true }));
  return out.slice(0, max);
}

/** Primeiros números distintos — para mensagem de ajuda quando a busca falha. */
export function exemplosNumerosDocumentos(documentos: DocumentoPlanejamento[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of documentos) {
    const n = String(d.numero ?? '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

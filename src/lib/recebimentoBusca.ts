import type { Recebimento } from 'iso-pro-shared';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Trecho bate com código de alguma linha do recebimento (NF, romaneio, fornecedor já testados à parte). */
export function recebimentoCombinaCodigoItem(recebimento: Recebimento, buscaTexto: string): boolean {
  const q = norm(buscaTexto);
  if (!q) return false;
  for (const it of recebimento.itens ?? []) {
    const c = norm(String(it?.codigo ?? ''));
    if (!c) continue;
    if (c.includes(q) || q.includes(c)) return true;
    if (q.length >= 2 && numeroSegmentosCorrespondem(String(it?.codigo ?? ''), q)) return true;
    if (textoCorrespondeFlexivel(String(it?.codigo ?? ''), buscaTexto)) return true;
  }
  return false;
}

function alvoSemSeparadorFinal(alvo: string): string {
  return alvo.replace(/[-\s._/]+$/g, '').trim();
}

function numeroSegmentosCorrespondem(textoRaw: string, alvo: string): boolean {
  const n = norm(String(textoRaw ?? ''));
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

function textoCorrespondeFlexivel(textoRaw: string, alvoDigitado: string): boolean {
  const n = norm(String(textoRaw ?? ''));
  const a = norm(alvoDigitado);
  if (!n || !a) return false;
  if (n.includes(a)) return false;

  const aNoLead = a.replace(/^0+/, '') || a;
  if (aNoLead !== a && n.includes(aNoLead)) return true;
  if (n.endsWith(a) || (aNoLead !== a && n.endsWith(aNoLead))) return true;

  const lastSeg = (n.split(/[-_/]+/).pop() ?? '').trim();
  if (lastSeg === a || lastSeg === aNoLead) return true;

  const digN = n.replace(/\D/g, '');
  const digA = a.replace(/\D/g, '');
  if (digA.length >= 4 && digN.includes(digA)) return true;

  return false;
}

export type ResultadoBuscaRecebimento =
  | { kind: 'none' }
  | { kind: 'one'; rec: Recebimento }
  | { kind: 'sameNotaVarios'; recs: Recebimento[] }
  | { kind: 'escolher'; recs: Recebimento[] };

/**
 * Prioridade: campo nota (NF); depois romaneio se não houver nota no cadastro.
 * Mesma ideia que documento: exact → includes → flexível → segmentos → dígitos.
 */
export function resolverBuscaRecebimentoPorNota(
  recebimentos: Recebimento[],
  buscaTexto: string,
): ResultadoBuscaRecebimento {
  const alvo = norm(buscaTexto);
  if (!alvo) return { kind: 'none' };

  const chaveNf = (r: Recebimento) => norm(String(r.nota ?? ''));
  const chaveRom = (r: Recebimento) => norm(String(r.romaneio ?? ''));

  const exact = recebimentos.filter((r) => chaveNf(r) === alvo || (chaveNf(r) === '' && chaveRom(r) === alvo));
  if (exact.length === 1) return { kind: 'one', rec: exact[0] };
  if (exact.length > 1) return { kind: 'sameNotaVarios', recs: exact };

  const parcialNf = recebimentos.filter((r) => chaveNf(r).includes(alvo));
  if (parcialNf.length === 1) return { kind: 'one', rec: parcialNf[0] };
  if (parcialNf.length > 1) return { kind: 'escolher', recs: parcialNf };

  // Só romaneio (quando não houve match parcial na NF)
  const parcialRom = recebimentos.filter((r) => chaveRom(r).includes(alvo));
  if (parcialRom.length === 1) return { kind: 'one', rec: parcialRom[0] };
  if (parcialRom.length > 1) return { kind: 'escolher', recs: parcialRom };

  const alvoCore = alvoSemSeparadorFinal(alvo);
  if (alvoCore.length >= 2 && alvoCore !== alvo) {
    const porCore = recebimentos.filter((r) => chaveNf(r).includes(alvoCore) || chaveRom(r).includes(alvoCore));
    if (porCore.length === 1) return { kind: 'one', rec: porCore[0] };
    if (porCore.length > 1) return { kind: 'escolher', recs: porCore };
  }

  const segAlvo = alvoCore.length >= 2 ? alvoCore : alvo;
  const porSegmento = recebimentos.filter(
    (r) => numeroSegmentosCorrespondem(String(r.nota ?? ''), segAlvo) || numeroSegmentosCorrespondem(String(r.romaneio ?? ''), segAlvo),
  );
  if (porSegmento.length === 1) return { kind: 'one', rec: porSegmento[0] };
  if (porSegmento.length > 1) return { kind: 'escolher', recs: porSegmento };

  const flex = recebimentos.filter(
    (r) => textoCorrespondeFlexivel(String(r.nota ?? ''), buscaTexto) || textoCorrespondeFlexivel(String(r.romaneio ?? ''), buscaTexto),
  );
  if (flex.length === 1) return { kind: 'one', rec: flex[0] };
  if (flex.length > 1) return { kind: 'escolher', recs: flex };

  const porCodigo = recebimentos.filter((r) => recebimentoCombinaCodigoItem(r, buscaTexto));
  if (porCodigo.length === 1) return { kind: 'one', rec: porCodigo[0] };
  if (porCodigo.length > 1) return { kind: 'escolher', recs: porCodigo };

  return { kind: 'none' };
}

/** Filtragem imediata ao digitar: NF, romaneio, fornecedor. */
export function filtrarRecebimentosPorTextoInteligente(
  recebimentos: Recebimento[],
  buscaTexto: string,
  max = 50,
): Recebimento[] {
  const q = norm(buscaTexto);
  if (!q) return [];

  const out: Recebimento[] = [];
  for (const r of recebimentos) {
    const nf = norm(String(r.nota ?? ''));
    const rom = norm(String(r.romaneio ?? ''));
    const forn = norm(String(r.fornecedorNome ?? ''));
    let ok = false;
    if (nf.includes(q) || rom.includes(q) || forn.includes(q)) ok = true;
    else {
      const partesNf = nf.split(/[-_/]+/).filter(Boolean);
      if (partesNf.some((p) => p.includes(q) || p.startsWith(q))) ok = true;
      else if (q.length >= 2 && numeroSegmentosCorrespondem(String(r.nota ?? ''), q)) ok = true;
      else if (textoCorrespondeFlexivel(String(r.nota ?? ''), buscaTexto)) ok = true;
      else if (textoCorrespondeFlexivel(String(r.romaneio ?? ''), buscaTexto)) ok = true;
    }
    if (!ok && recebimentoCombinaCodigoItem(r, buscaTexto)) ok = true;
    if (ok) out.push(r);
  }
  out.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
  return out.slice(0, max);
}

/** Título de linha — evita «NF: NF-3365» quando `nota` já inclui o prefixo «NF-». */
export function rotuloNotaRomaneioRecebimento(r: Recebimento): string {
  const nota = (r.nota ?? '').trim() || '—';
  const rom = (r.romaneio ?? '').trim() || '—';
  return `Nota: ${nota} · Rom.: ${rom}`;
}

export function exemplosNotasRecebimentos(recebimentos: Recebimento[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of recebimentos) {
    const n = String(r.nota ?? '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

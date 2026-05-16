import type {
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
} from 'iso-pro-shared';
import { codigoMaterialKey } from './saldoMaterial';
import { codigoNaLinhaPlanejamento, quantidadeAtendidaLinha } from './registrarAtendimento';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function setQuantidadeAtendidaLinha(it: DocumentoItemPlanejamento, valor: number): void {
  const o = it as Record<string, unknown>;
  const v = Math.max(0, Number(valor) || 0);
  o.quantidadeAtendida = v;
  if ('quantidade_atendida' in o) o.quantidade_atendida = v;
}

/** Recibos de teste 11/04/2026 (sequência 2–9). */
export const PROTOCOLOS_ATD_20260411_TESTE = [
  'ATD-20260411-00009',
  'ATD-20260411-00008',
  'ATD-20260411-00007',
  'ATD-20260411-00006',
  'ATD-20260411-00005',
  'ATD-20260411-00004',
  'ATD-20260411-00003',
  'ATD-20260411-00002',
] as const;

export type ResultadoRemocaoRecibos = {
  payload: IsoSnapshotPayload;
  removidosHistorico: number;
  removidosLotes: number;
  removidosAtendimentos: number;
};

function normalizarRotuloDoc(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Remove linhas de `atendimentoHistorico`, lotes em `atendimentoLotes` e registros em `atendimentos`
 * (estrutura desktop) cujo protocolo está em `protocolos`.
 * Reverte `quantidadeAtendida` nas linhas do planejamento conforme as linhas de histórico removidas.
 */
export function removerRecibosDoPayload(
  payload: IsoSnapshotPayload,
  protocolos: readonly string[],
): ResultadoRemocaoRecibos {
  const set = new Set(protocolos.map((p) => String(p).trim()).filter(Boolean));
  if (set.size === 0) {
    return {
      payload: deepClone(payload),
      removidosHistorico: 0,
      removidosLotes: 0,
      removidosAtendimentos: 0,
    };
  }

  const next = deepClone(payload) as IsoSnapshotPayload & {
    atendimentos?: { numero?: string; [k: string]: unknown }[];
  };

  const histAll = next.atendimentoHistorico ?? [];
  const aRemover = histAll.filter((h) => h.loteNumero && set.has(String(h.loteNumero)));
  const histFiltrado = histAll.filter((h) => !(h.loteNumero && set.has(String(h.loteNumero))));

  const docs = [...(next.documentos ?? [])] as DocumentoPlanejamento[];

  for (const line of aRemover) {
    const q = Number(line.quantidade) || 0;
    if (q <= 1e-12) continue;

    const docId = String(line.documentoId ?? '').trim();
    const rotHist = normalizarRotuloDoc(String(line.documento ?? ''));

    for (const doc of docs) {
      if (docId && String(doc.id ?? '') !== docId) continue;
      if (!docId && rotHist && normalizarRotuloDoc(String(doc.numero ?? '')) !== rotHist) continue;
      if (!docId && !rotHist) continue;

      const itens = (doc.itens ?? []) as DocumentoItemPlanejamento[];
      const itemId = String(line.documentoItemId ?? '').trim();
      if (itemId) {
        for (const it of itens) {
          if (String((it as { id?: unknown }).id ?? '') !== itemId) continue;
          const cur = quantidadeAtendidaLinha(it);
          setQuantidadeAtendidaLinha(it, cur - q);
          break;
        }
        break;
      }

      const codAlvo = codigoMaterialKey(String(line.codigo ?? ''));
      if (!codAlvo) break;

      let restante = q;
      for (const it of itens) {
        if (restante <= 1e-12) break;
        if (codigoMaterialKey(codigoNaLinhaPlanejamento(it)) !== codAlvo) continue;
        const cur = quantidadeAtendidaLinha(it);
        const take = Math.min(cur, restante);
        if (take <= 1e-12) continue;
        setQuantidadeAtendidaLinha(it, cur - take);
        restante -= take;
      }
      break;
    }
  }

  next.documentos = docs;
  next.atendimentoHistorico = histFiltrado;

  const lotes = next.atendimentoLotes ?? [];
  const lotesFiltrados = lotes.filter((l) => !(l.numero && set.has(String(l.numero))));
  next.atendimentoLotes = lotesFiltrados;

  const atends = Array.isArray(next.atendimentos) ? next.atendimentos : [];
  const atendsFiltrados = atends.filter((at) => {
    const n = String((at as { numero?: unknown }).numero ?? '').trim();
    return !n || !set.has(n);
  });

  next.atendimentos = atendsFiltrados;

  return {
    payload: next,
    removidosHistorico: aRemover.length,
    removidosLotes: lotes.length - lotesFiltrados.length,
    removidosAtendimentos: atends.length - atendsFiltrados.length,
  };
}

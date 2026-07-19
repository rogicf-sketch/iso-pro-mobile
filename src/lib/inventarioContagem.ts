import type { InventarioItemSnapshot, IsoSnapshotPayload, Material, Recebimento } from 'iso-pro-shared';
import { filtrarRecebimentosPorTextoInteligente } from './recebimentoBusca';
import { codigoMaterialKey } from './saldoMaterial';
import {
  extrairCodigoMaterialDeTextoLeitura,
  gerarCodigoBarras,
  resolverMaterialParaBaixaPorCodigo,
} from './registrarAtendimento';

export type EstatisticasInventarioContagem = {
  total: number;
  contados: number;
  pendentes: number;
  divergencias: number;
};

function textoContagemPreenchido(texto: string | undefined): boolean {
  return String(texto ?? '').trim() !== '';
}

export function parseQuantidadeContadaTexto(texto: string): number | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function itemKey(it: InventarioItemSnapshot, index: number): string {
  return String(it.id ?? `item-${index}`);
}

export function calcularEstatisticasInventarioContagem(
  itens: InventarioItemSnapshot[],
  qtdTextoPorItemId: Record<string, string>,
): EstatisticasInventarioContagem {
  let contados = 0;
  let divergencias = 0;
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]!;
    const kid = itemKey(it, i);
    const txt = qtdTextoPorItemId[kid] ?? '';
    if (!textoContagemPreenchido(txt)) continue;
    contados += 1;
    const q = parseQuantidadeContadaTexto(txt);
    const saldo = Number(it.saldoSistema ?? 0);
    if (q !== undefined && Math.abs(q - saldo) > 1e-9) {
      divergencias += 1;
    }
  }
  const total = itens.length;
  return {
    total,
    contados,
    pendentes: Math.max(0, total - contados),
    divergencias,
  };
}

function codigoEmLinhaRecebimento(item: { codigo?: string | null }): string {
  return codigoMaterialKey(String(item.codigo ?? ''));
}

/** Códigos de material presentes em recebimentos cuja NF/romaneio bate com a busca. */
export function codigosMaterialPorBuscaRecebimento(recebimentos: Recebimento[], busca: string): Set<string> {
  const recs = filtrarRecebimentosPorTextoInteligente(recebimentos, busca, 100);
  const out = new Set<string>();
  for (const rec of recs) {
    for (const it of rec.itens ?? []) {
      const k = codigoEmLinhaRecebimento(it);
      if (k) out.add(k);
    }
  }
  return out;
}

export function recebimentoBuscaCombina(payload: IsoSnapshotPayload | null | undefined, busca: string): boolean {
  if (!payload?.recebimentos?.length || !busca.trim()) return false;
  return filtrarRecebimentosPorTextoInteligente(payload.recebimentos, busca, 1).length > 0;
}

export function filtrarItensInventarioPorBusca(
  itens: InventarioItemSnapshot[],
  busca: string,
  payload?: IsoSnapshotPayload | null,
): InventarioItemSnapshot[] {
  const q = busca.trim().toLowerCase();
  if (!q) return itens;

  const codigosNf =
    payload?.recebimentos?.length && busca.trim()
      ? codigosMaterialPorBuscaRecebimento(payload.recebimentos, busca)
      : new Set<string>();

  return itens.filter((it) => {
    const cod = String(it.codigoMaterial ?? '').toLowerCase();
    const desc = String(it.descricaoMaterial ?? '').toLowerCase();
    const loc = String(it.localizacaoContada ?? '').toLowerCase();
    if (cod.includes(q) || desc.includes(q) || loc.includes(q)) return true;
    if (codigosNf.size > 0) {
      const k = codigoMaterialKey(String(it.codigoMaterial ?? ''));
      return Boolean(k && codigosNf.has(k));
    }
    return false;
  });
}

function inventarioItemCasaComLeitura(codigoItem: string, termo: string, raw: string): boolean {
  const c = String(codigoItem ?? '').trim();
  if (!c) return false;
  const t = String(termo ?? '').trim();
  const r = String(raw ?? '').trim();
  if (codigoMaterialKey(c) === codigoMaterialKey(t)) return true;
  const hash = gerarCodigoBarras(c);
  if (!hash) return false;
  if (hash === t || hash === r) return true;
  const digT = t.replace(/\D/g, '');
  const digR = r.replace(/\D/g, '');
  if (digT.length >= 4 && hash === digT) return true;
  if (digR.length >= 4 && hash === digR) return true;
  return false;
}

/** Descreve o que foi lido — mensagem de erro mais clara no scan. */
export function descreverLeituraInventarioParaErro(raw: string): string {
  const s = String(raw ?? '').trim();
  const termo = extrairCodigoMaterialDeTextoLeitura(s) || s;
  if (/^\d{8,}$/.test(termo)) return `código de barras ${termo}`;
  return `código «${termo}»`;
}

export function encontrarIndiceItemInventarioPorLeitura(
  itens: InventarioItemSnapshot[],
  raw: string,
): number {
  const s = String(raw ?? '').trim();
  if (!s) return -1;
  const termo = extrairCodigoMaterialDeTextoLeitura(s) || s;
  if (!termo.trim()) return -1;
  return itens.findIndex((it) =>
    inventarioItemCasaComLeitura(String(it.codigoMaterial ?? ''), termo, s),
  );
}

export function inventarioTemContagemIniciada(
  itens: InventarioItemSnapshot[],
  qtdTextoPorItemId: Record<string, string>,
): boolean {
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]!;
    const kid = itemKey(it, i);
    if (textoContagemPreenchido(qtdTextoPorItemId[kid] ?? '')) return true;
    const qc = it.quantidadeContada;
    if (qc !== undefined && qc !== null && String(qc).trim() !== '') return true;
  }
  return false;
}

/** Resolve material do cadastro (ou planejamento) a partir de scan/pesquisa. */
export function resolverMaterialParaInventario(
  payload: IsoSnapshotPayload | null | undefined,
  leitura: string,
): Material | null {
  if (!payload) return null;
  return resolverMaterialParaBaixaPorCodigo(payload, leitura);
}

export function indiceItemInventarioPorCodigoMaterial(
  itens: InventarioItemSnapshot[],
  codigoMaterial: string,
): number {
  const alvo = codigoMaterialKey(codigoMaterial);
  if (!alvo) return -1;
  return itens.findIndex((it) => codigoMaterialKey(String(it.codigoMaterial ?? '')) === alvo);
}

export function criarItemInventarioDoMaterial(
  material: Material,
  saldoSistema: number,
): InventarioItemSnapshot {
  const codigo = String(material.codigo ?? '').trim();
  return {
    id: `mob-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    codigoMaterial: codigo,
    descricaoMaterial: String(material.descricao ?? '').trim() || codigo,
    unidade: String(material.unidade ?? '').trim() || 'UN',
    saldoSistema,
    quantidadeContada: undefined,
    localizacaoContada: undefined,
  };
}

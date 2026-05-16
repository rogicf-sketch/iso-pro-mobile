import type {
  DocumentoItemPlanejamento,
  IsoSnapshotPayload,
  Recebimento,
  RecebimentoItem,
} from 'iso-pro-shared';

/** Mesma chave que o I.S.O PRO desktop — cruza documento, recebimento e saldo. */
export function codigoMaterialKey(c: string): string {
  return String(c || '').trim().toUpperCase();
}

/** Mesma ordem de chaves que o desktop em `saldoFromSnapshot.ts`. */
function codigoEmItemRecebimento(item: RecebimentoItem): string {
  const o = item as Record<string, unknown>;
  return String(o.codigo ?? o.codigo_material ?? o.codigoMaterial ?? '').trim();
}

function codigoEmLinhaDocumento(item: DocumentoItemPlanejamento): string {
  const o = item as Record<string, unknown>;
  return String(o.codigo ?? o.codigo_material ?? o.codigoMaterial ?? '').trim();
}

function getQuantidadeRecebidaItem(
  item: RecebimentoItem,
  modo: string,
  status: string | null | undefined,
): number {
  if (modo === 'direto' || modo === undefined) {
    return Number(item.quantidade ?? 0);
  }
  return status === 'conferido' ? Number(item.quantidadeConferida ?? 0) : 0;
}

/**
 * Saldo **operacional** por código, só a partir de **movimentos** no snapshot:
 * recebimentos (conferidos quando aplicável) − soma de `quantidadeAtendida` nos documentos + ajustes de estoque.
 *
 * **Não** usa `materiais[].saldoAtual` explícito: esse campo pode ficar desatualizado na nuvem e fazia o telemóvel
 * mostrar saldo com «pendência no desenho» mesmo sem recebimento — o PC recalcula e bloqueia. O mobile deve seguir
 * a mesma regra de movimento para ficar alinhado ao I.S.O PRO no PC.
 */
export function buildSaldoOperacionalParaAtendimento(payload: IsoSnapshotPayload): Map<string, number> {
  const recebimentosMap = new Map<string, number>();
  for (const recebimento of payload.recebimentos ?? []) {
    const rec = recebimento as Recebimento & Record<string, unknown>;
    if (String(rec.status ?? '').toLowerCase() === 'cancelado') continue;

    const modo = recebimento.modoRecebimento ?? 'direto';
    const status = recebimento.statusConferencia ?? null;
    for (const item of recebimento.itens ?? []) {
      const codigo = codigoMaterialKey(codigoEmItemRecebimento(item));
      if (!codigo) continue;
      const atual = recebimentosMap.get(codigo) ?? 0;
      recebimentosMap.set(codigo, atual + getQuantidadeRecebidaItem(item, modo, status));
    }
  }

  const atendidoMap = new Map<string, number>();
  for (const documento of payload.documentos ?? []) {
    for (const item of documento.itens ?? []) {
      const codigo = codigoMaterialKey(codigoEmLinhaDocumento(item));
      if (!codigo) continue;
      const o = item as Record<string, unknown>;
      const qAt = o.quantidadeAtendida ?? o.quantidade_atendida;
      const atual = atendidoMap.get(codigo) ?? 0;
      atendidoMap.set(codigo, atual + Number(qAt ?? 0));
    }
  }

  const ajustesMap = new Map<string, number>();
  for (const ajuste of payload.estoqueAjustes ?? []) {
    const rec = ajuste as { codigo?: string; codigoMaterial?: string; delta?: number | string | null };
    const codigo = codigoMaterialKey(String(rec.codigo ?? rec.codigoMaterial ?? '').trim());
    if (!codigo) continue;
    const atual = ajustesMap.get(codigo) ?? 0;
    ajustesMap.set(codigo, atual + Number(rec.delta ?? 0));
  }

  const todosCodigos = new Set<string>();
  for (const k of recebimentosMap.keys()) todosCodigos.add(k);
  for (const k of atendidoMap.keys()) todosCodigos.add(k);
  for (const k of ajustesMap.keys()) todosCodigos.add(k);
  for (const material of payload.materiais ?? []) {
    const c = codigoMaterialKey(String(material.codigo ?? ''));
    if (c) todosCodigos.add(c);
  }

  const saldoMap = new Map<string, number>();
  for (const codigo of todosCodigos) {
    const saldo = Math.max(
      0,
      (recebimentosMap.get(codigo) ?? 0) - (atendidoMap.get(codigo) ?? 0) + (ajustesMap.get(codigo) ?? 0),
    );
    saldoMap.set(codigo, saldo);
  }

  return saldoMap;
}

/** @deprecated Use `buildSaldoOperacionalParaAtendimento` — mantido como alias para não inflar com saldo explícito. */
export function buildSaldoPorCodigoMaterial(payload: IsoSnapshotPayload): Map<string, number> {
  return buildSaldoOperacionalParaAtendimento(payload);
}

export function getSaldoCodigo(payload: IsoSnapshotPayload, codigoMaterial: string): number {
  const map = buildSaldoOperacionalParaAtendimento(payload);
  return map.get(codigoMaterialKey(codigoMaterial)) ?? 0;
}

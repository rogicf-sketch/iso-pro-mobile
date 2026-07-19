import type { InventarioItemSnapshot, InventarioSnapshot, IsoSnapshotPayload } from 'iso-pro-shared';

import { parseQuantidadeContadaTexto } from './inventarioContagem';

function localTexto(it: InventarioItemSnapshot, localTextoPorItemId: Record<string, string>, kid: string): string {
  const fromForm = String(localTextoPorItemId[kid] ?? '').trim();
  if (fromForm) return fromForm;
  return String(it.localizacaoContada ?? '').trim();
}

/** Aplica quantidades e locais editados localmente (para comparar com snapshot ou gravar). */
export function mergeContagemLocalEmInventario(
  inv: InventarioSnapshot,
  qtdTextoPorItemId: Record<string, string>,
  localTextoPorItemId: Record<string, string>,
): InventarioSnapshot {
  const itens = (inv.itens ?? []).map((it, i) => {
    const kid = String(it.id ?? `item-${i}`);
    const q = parseQuantidadeContadaTexto(qtdTextoPorItemId[kid] ?? '');
    const loc = localTexto(it, localTextoPorItemId, kid);
    const row: InventarioItemSnapshot = { ...it };
    if (q === undefined) {
      delete row.quantidadeContada;
    } else {
      row.quantidadeContada = q;
    }
    if (loc) {
      row.localizacaoContada = loc;
    } else {
      delete row.localizacaoContada;
    }
    return row;
  });
  return { ...inv, itens };
}

/** @deprecated Use mergeContagemLocalEmInventario */
export function mergeQuantidadesContadasEmInventario(
  inv: InventarioSnapshot,
  qtdTextoPorItemId: Record<string, string>,
): InventarioSnapshot {
  return mergeContagemLocalEmInventario(inv, qtdTextoPorItemId, {});
}

function qtdNum(it: InventarioItemSnapshot | undefined): number | null {
  if (!it) return null;
  const q = it.quantidadeContada;
  if (q === undefined || q === null) return null;
  if (typeof q === 'string' && String(q).trim() === '') return null;
  const n = Number(q);
  return Number.isFinite(n) ? n : null;
}

function locStr(it: InventarioItemSnapshot | undefined): string {
  return String(it?.localizacaoContada ?? '').trim();
}

function itensInventarioDiferem(a: InventarioItemSnapshot[] | undefined, b: InventarioItemSnapshot[] | undefined): boolean {
  const mapA = new Map(
    (a ?? []).map((it) => [
      String(it.id ?? ''),
      { q: qtdNum(it), loc: locStr(it) },
    ]),
  );
  const mapB = new Map(
    (b ?? []).map((it) => [
      String(it.id ?? ''),
      { q: qtdNum(it), loc: locStr(it) },
    ]),
  );
  const ids = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const id of ids) {
    const va = mapA.get(id);
    const vb = mapB.get(id);
    if ((va?.q ?? null) !== (vb?.q ?? null)) return true;
    if ((va?.loc ?? '') !== (vb?.loc ?? '')) return true;
  }
  return false;
}

/**
 * `true` quando contagem editada localmente difere do último snapshot carregado
 * (ainda não refletida após «Guardar na nuvem»).
 */
export function inventarioLocalDifereDoSnapshot(
  local: InventarioSnapshot | null,
  payload: IsoSnapshotPayload | null,
): boolean {
  if (!local?.id || !payload?.inventarios?.length) return false;
  if (String(local.status ?? '') !== 'aberto') return false;
  const server = payload.inventarios.find((inv) => String(inv.id) === String(local.id));
  if (!server) return true;
  const serverItens = Array.isArray(server.itens) ? server.itens : [];
  if ((local.itens?.length ?? 0) !== serverItens.length) return true;
  const codigosLocal = new Set(
    (local.itens ?? []).map((it) => String(it.codigoMaterial ?? '').trim().toLowerCase()).filter(Boolean),
  );
  const codigosServer = new Set(
    serverItens.map((it) => String(it.codigoMaterial ?? '').trim().toLowerCase()).filter(Boolean),
  );
  if (codigosLocal.size !== codigosServer.size) return true;
  for (const c of codigosLocal) {
    if (!codigosServer.has(c)) return true;
  }
  return itensInventarioDiferem(local.itens, serverItens);
}

export function mergeLinhasContagemPreserveLocal(
  prevQtd: Record<string, string>,
  prevLoc: Record<string, string>,
  inv: InventarioSnapshot,
): { qtdTextoPorItemId: Record<string, string>; localTextoPorItemId: Record<string, string> } {
  const qtdTextoPorItemId: Record<string, string> = {};
  const localTextoPorItemId: Record<string, string> = {};
  (inv.itens ?? []).forEach((it, i) => {
    const kid = String(it.id ?? `item-${i}`);
    if (Object.prototype.hasOwnProperty.call(prevQtd, kid)) {
      qtdTextoPorItemId[kid] = prevQtd[kid] ?? '';
    } else {
      const qc = it.quantidadeContada as number | string | undefined | null;
      if (qc === undefined || qc === null) {
        qtdTextoPorItemId[kid] = '';
      } else if (typeof qc === 'string' && qc.trim() === '') {
        qtdTextoPorItemId[kid] = '';
      } else {
        const n = typeof qc === 'number' ? qc : Number(String(qc).replace(',', '.'));
        if (Number.isFinite(n) && n === 0) qtdTextoPorItemId[kid] = '';
        else qtdTextoPorItemId[kid] = String(qc);
      }
    }
    if (Object.prototype.hasOwnProperty.call(prevLoc, kid)) {
      localTextoPorItemId[kid] = prevLoc[kid] ?? '';
    } else {
      localTextoPorItemId[kid] = String(it.localizacaoContada ?? '');
    }
  });
  return { qtdTextoPorItemId, localTextoPorItemId };
}

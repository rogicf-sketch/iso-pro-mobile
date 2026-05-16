import type { InventarioItemSnapshot, InventarioSnapshot, IsoSnapshotPayload } from 'iso-pro-shared';

function parseQty(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Aplica os textos de quantidade contada ao inventário (para comparar com o snapshot ou gravar). */
export function mergeQuantidadesContadasEmInventario(
  inv: InventarioSnapshot,
  qtdTextoPorItemId: Record<string, string>,
): InventarioSnapshot {
  const itens = (inv.itens ?? []).map((it, i) => {
    const kid = String(it.id ?? `item-${i}`);
    const q = parseQty(qtdTextoPorItemId[kid] ?? '');
    const row: InventarioItemSnapshot = { ...it };
    if (q === undefined) {
      delete row.quantidadeContada;
    } else {
      row.quantidadeContada = q;
    }
    return row;
  });
  return { ...inv, itens };
}

function qtdNum(it: InventarioItemSnapshot | undefined): number | null {
  if (!it) return null;
  const q = it.quantidadeContada;
  if (q === undefined || q === null) return null;
  if (typeof q === 'string' && String(q).trim() === '') return null;
  const n = Number(q);
  return Number.isFinite(n) ? n : null;
}

function itensInventarioDiferem(a: InventarioItemSnapshot[] | undefined, b: InventarioItemSnapshot[] | undefined): boolean {
  const mapA = new Map((a ?? []).map((it) => [String(it.id ?? ''), qtdNum(it)]));
  const mapB = new Map((b ?? []).map((it) => [String(it.id ?? ''), qtdNum(it)]));
  const ids = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const id of ids) {
    if (mapA.get(id) !== mapB.get(id)) return true;
  }
  return false;
}

/**
 * `true` quando as quantidades contadas editadas localmente diferem do último snapshot carregado
 * (ainda não refletidas após «Guardar na nuvem»).
 */
export function inventarioLocalDifereDoSnapshot(
  local: InventarioSnapshot | null,
  payload: IsoSnapshotPayload | null,
): boolean {
  if (!local?.id || !payload?.inventarios?.length) return false;
  if (String(local.status ?? '') !== 'aberto') return false;
  const server = payload.inventarios.find((inv) => String(inv.id) === String(local.id));
  if (!server) return true;
  return itensInventarioDiferem(local.itens, server.itens);
}

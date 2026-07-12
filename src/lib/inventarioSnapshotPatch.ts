import type { IsoSnapshotPayload } from 'iso-pro-shared';

import { mergeInventarioRecord } from './offlineSnapshotMerge.utils';
import { SNAPSHOT_MOBILE_INVENTARIO_MERGE_KEYS } from './snapshotSliceKeys';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export type InventarioContagemPatchPlan = {
  patch: Record<string, unknown>;
  mergeKeys: readonly string[];
  patchWithoutMerge: Record<string, unknown>;
  /** Inventário já fundido (itens por id / max contagem) — para atualizar UI local. */
  inventarioMerged: Record<string, unknown>;
};

/**
 * Patch seguro de contagem: delta de 1 inventário + mergeKeys, com fallback da lista completa.
 * Funde itens locais sobre a nuvem (max quantidadeContada) para não apagar contagem concorrente.
 */
export function buildInventarioContagemPatchPlan(input: {
  freshInventarios: NonNullable<IsoSnapshotPayload['inventarios']>;
  inventarioId: string;
  localInventario: Record<string, unknown>;
}): InventarioContagemPatchPlan {
  const list = input.freshInventarios;
  if (!list.length) {
    throw new Error('Não foi possível localizar o inventário no pacote.');
  }
  const idx = list.findIndex((inv) => String((inv as { id?: unknown }).id) === String(input.inventarioId));
  if (idx === -1) {
    throw new Error('Não foi possível localizar o inventário no pacote.');
  }

  const cloudRow = deepClone(list[idx]!) as Record<string, unknown>;
  const inventarioMerged = mergeInventarioRecord(cloudRow, input.localInventario);
  const dataAtualizacao = new Date().toISOString();
  const fullList = deepClone(list) as Array<Record<string, unknown>>;
  fullList[idx] = inventarioMerged;

  return {
    patch: {
      inventarios: [inventarioMerged],
      dataAtualizacao,
    },
    mergeKeys: SNAPSHOT_MOBILE_INVENTARIO_MERGE_KEYS,
    patchWithoutMerge: {
      inventarios: fullList,
      dataAtualizacao,
    },
    inventarioMerged,
  };
}

import type { IsoSnapshotPayload } from 'iso-pro-shared';

import { fetchSnapshotSlicesForWrite, type SnapshotPatchPlan } from './snapshot';

export type SnapshotWriteBaseline = {
  payload: IsoSnapshotPayload;
  updatedAt: string;
};

export type SnapshotPatchBuildResult = {
  patch: Record<string, unknown>;
  mergeKeys?: readonly string[];
  patchWithoutMerge?: Record<string, unknown>;
};

/**
 * Prepara patch para gravação: na 1.ª tentativa usa o snapshot já carregado no ecrã
 * (evita nova ida à nuvem em dados móveis). Em conflito de versão, releitura fresca.
 */
export function createSnapshotPatchPrepareWithBaseline(
  baseline: SnapshotWriteBaseline | null | undefined,
  readKeys: readonly string[],
  apply: (payload: IsoSnapshotPayload) => SnapshotPatchBuildResult | Promise<SnapshotPatchBuildResult>,
): () => Promise<SnapshotPatchPlan> {
  let attempt = 0;

  return async () => {
    if (attempt === 0 && baseline?.payload && baseline.updatedAt) {
      attempt += 1;
      const built = await apply(baseline.payload);
      return {
        patch: built.patch,
        baselineUpdatedAt: baseline.updatedAt,
        mergeKeys: built.mergeKeys,
        patchWithoutMerge: built.patchWithoutMerge,
      };
    }

    attempt += 1;
    const { payload: fresh, updatedAt, error } = await fetchSnapshotSlicesForWrite(readKeys);
    if (error) {
      throw new Error(error);
    }
    if (!fresh) {
      throw new Error('Snapshot indisponível. Carregue a nuvem e tente novamente.');
    }
    const built = await apply(fresh);
    return {
      patch: built.patch,
      baselineUpdatedAt: updatedAt,
      mergeKeys: built.mergeKeys,
      patchWithoutMerge: built.patchWithoutMerge,
    };
  };
}

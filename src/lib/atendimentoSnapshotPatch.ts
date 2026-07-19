import type { DocumentoPlanejamento, IsoSnapshotPayload } from 'iso-pro-shared';

import { SNAPSHOT_MOBILE_ATENDIMENTO_PATCH_KEYS } from './snapshotSliceKeys';
import { quantidadeAtendidaLinha } from './registrarAtendimento';

function buildFullAtendimentoPatch(next: IsoSnapshotPayload): Record<string, unknown> {
  const rec = next as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of SNAPSHOT_MOBILE_ATENDIMENTO_PATCH_KEYS) {
    if (key in rec) {
      patch[key] = rec[key];
    }
  }
  return patch;
}

/** Chaves enviadas como delta e fundidas por id no RPC `iso_pro_patch_snapshot`. */
export const SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS = [
  'documentos',
  'atendimentoHistorico',
  'atendimentoLotes',
] as const;

function documentoAlteradoPorAtendimento(
  before: DocumentoPlanejamento,
  after: DocumentoPlanejamento,
): boolean {
  const itemsBefore = before.itens ?? [];
  const itemsAfter = after.itens ?? [];
  if (itemsBefore.length !== itemsAfter.length) return true;
  for (let i = 0; i < itemsBefore.length; i++) {
    const qBefore = quantidadeAtendidaLinha(itemsBefore[i]!);
    const qAfter = quantidadeAtendidaLinha(itemsAfter[i]!);
    if (Math.abs(qBefore - qAfter) > 1e-9) return true;
  }
  return false;
}

/**
 * Patch mínimo para gravação em dados móveis: só documentos alterados, linhas novas de histórico/lotes.
 * Requer RPC com `p_merge_keys` (migration 20260705140000).
 */
export function buildAtendimentoSnapshotPatchDelta(
  baseline: IsoSnapshotPayload,
  next: IsoSnapshotPayload,
): {
  patch: Record<string, unknown>;
  mergeKeys: readonly string[];
  patchWithoutMerge: Record<string, unknown>;
  comandoPatch: Record<string, unknown>;
} {
  const baseDocs = (baseline.documentos ?? []) as DocumentoPlanejamento[];
  const nextDocs = (next.documentos ?? []) as DocumentoPlanejamento[];
  const nextById = new Map(nextDocs.map((d) => [String(d.id ?? ''), d]));

  const changedDocs: DocumentoPlanejamento[] = [];
  for (const baseDoc of baseDocs) {
    const id = String(baseDoc.id ?? '');
    const nextDoc = nextById.get(id);
    if (nextDoc && documentoAlteradoPorAtendimento(baseDoc, nextDoc)) {
      changedDocs.push(nextDoc);
    }
  }
  for (const nextDoc of nextDocs) {
    const id = String(nextDoc.id ?? '');
    if (!id) continue;
    if (!baseDocs.some((d) => String(d.id ?? '') === id)) {
      changedDocs.push(nextDoc);
    }
  }

  const baseHist = baseline.atendimentoHistorico ?? [];
  const nextHist = next.atendimentoHistorico ?? [];
  const baseHistIds = new Set(
    baseHist.map((h) => (h as { id?: unknown }).id).filter((id) => id != null && id !== ''),
  );
  const newHist = nextHist.filter((h) => {
    const id = (h as { id?: unknown }).id;
    return id != null && id !== '' && !baseHistIds.has(id);
  });

  const baseLotes = baseline.atendimentoLotes ?? [];
  const nextLotes = next.atendimentoLotes ?? [];
  const baseLoteIds = new Set(
    baseLotes.map((l) => (l as { id?: unknown }).id).filter((id) => id != null && id !== ''),
  );
  const newLotes = nextLotes.filter((l) => {
    const id = (l as { id?: unknown }).id;
    return id != null && id !== '' && !baseLoteIds.has(id);
  });

  const patch: Record<string, unknown> = {
    dataAtualizacao: next.dataAtualizacao ?? new Date().toISOString(),
  };
  if (changedDocs.length) patch.documentos = changedDocs;
  if (newHist.length) patch.atendimentoHistorico = newHist;
  if (newLotes.length) patch.atendimentoLotes = newLotes;

  const sequenciaBase = (baseline.configuracoesSistema as Record<string, unknown> | undefined)
    ?.sequenciaAtendimento;
  const sequenciaNext = (next.configuracoesSistema as Record<string, unknown> | undefined)
    ?.sequenciaAtendimento;
  if (sequenciaNext !== sequenciaBase) {
    patch.configuracoesSistema = {
      ...((baseline.configuracoesSistema as Record<string, unknown> | undefined) ?? {}),
      sequenciaAtendimento: sequenciaNext,
    };
  }

  return {
    patch,
    mergeKeys: SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS,
    patchWithoutMerge: buildFullAtendimentoPatch(next),
    /** Payload enviado ao RPC idempotente (paridade PC 0.1.78 + lotes mobile). */
    comandoPatch: { ...patch },
  };
}

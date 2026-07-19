import type { DocumentoPlanejamento, IsoSnapshotPayload } from 'iso-pro-shared';

import { quantidadeAtendidaLinha } from './registrarAtendimento';
import { mergeSnapshotForOfflineReplay } from './offlineSnapshotMerge.utils';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function mergeDocumentoPreservandoAtendimentoLocal(
  nuvem: DocumentoPlanejamento,
  local: DocumentoPlanejamento,
): DocumentoPlanejamento {
  const out = deepClone(nuvem);
  const localItens = local.itens ?? [];
  if (!out.itens?.length || !localItens.length) return out;
  for (const localIt of localItens) {
    const localId = String((localIt as { id?: unknown }).id ?? '').trim();
    const nuvemIt = out.itens.find((it) => String((it as { id?: unknown }).id ?? '').trim() === localId);
    if (!nuvemIt) continue;
    const qLocal = quantidadeAtendidaLinha(localIt);
    const qNuvem = quantidadeAtendidaLinha(nuvemIt);
    if (qLocal > qNuvem + 1e-9) {
      (nuvemIt as Record<string, unknown>).quantidadeAtendida = qLocal;
    }
  }
  return out;
}

/**
 * Recarregar fatias da nuvem sem perder desenhos lazy-loaded nem baixas ainda na fila offline.
 */
export function mergeAtendimentoPayloadPreservandoLocal(
  nuvem: IsoSnapshotPayload,
  local: IsoSnapshotPayload | null,
): IsoSnapshotPayload {
  if (!local) return nuvem;
  const merged = mergeSnapshotForOfflineReplay(nuvem, local);
  const localDocs = (local.documentos ?? []) as DocumentoPlanejamento[];
  if (!localDocs.length) return merged;

  const byId = new Map<string, DocumentoPlanejamento>();
  for (const d of (merged.documentos ?? []) as DocumentoPlanejamento[]) {
    byId.set(String(d.id ?? ''), d);
  }
  for (const localDoc of localDocs) {
    const id = String(localDoc.id ?? '').trim();
    if (!id) continue;
    const nuvemDoc = byId.get(id);
    if (!nuvemDoc) {
      byId.set(id, deepClone(localDoc));
      continue;
    }
    byId.set(id, mergeDocumentoPreservandoAtendimentoLocal(nuvemDoc, localDoc));
  }
  merged.documentos = [...byId.values()];
  return merged;
}

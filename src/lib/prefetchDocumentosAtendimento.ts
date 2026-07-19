import type { DocumentoPlanejamento } from 'iso-pro-shared';
import { fetchSnapshotSlices } from './snapshot';
import { listDocumentosPlanejamentoResumoFromCloud } from './isoProSnapshot';

function preferirDocumentoMaisCompleto(
  a: DocumentoPlanejamento,
  b: DocumentoPlanejamento,
): DocumentoPlanejamento {
  const itensA = a.itens?.length ?? 0;
  const itensB = b.itens?.length ?? 0;
  if (itensA !== itensB) return itensB > itensA ? b : a;
  return a;
}

export function mergeDocumentosPlanejamentoNoPayload(
  base: DocumentoPlanejamento[],
  extra: DocumentoPlanejamento[],
): DocumentoPlanejamento[] {
  const map = new Map<string, DocumentoPlanejamento>();
  for (const d of base) {
    const id = String(d.id ?? '').trim();
    if (id) map.set(id, d);
  }
  for (const d of extra) {
    const id = String(d.id ?? '').trim();
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, prev ? preferirDocumentoMaisCompleto(prev, d) : d);
  }
  return [...map.values()];
}

/** Carrega lista de desenhos em background (resumo leve → fallback fatia completa). */
export async function prefetchDocumentosParaAtendimento(
  mergeDocumentos: (docs: DocumentoPlanejamento[]) => void,
): Promise<{ count: number; source: 'resumo' | 'full' | 'none' }> {
  try {
    const resumo = await listDocumentosPlanejamentoResumoFromCloud();
    if (!resumo.missing && resumo.documentos.length > 0) {
      mergeDocumentos(resumo.documentos as unknown as DocumentoPlanejamento[]);
      return { count: resumo.documentos.length, source: 'resumo' };
    }
  } catch {
    /* fallback abaixo */
  }

  try {
    const { payload, error } = await fetchSnapshotSlices(['documentos'], { bypassCache: true });
    if (!error && payload?.documentos?.length) {
      mergeDocumentos(payload.documentos as DocumentoPlanejamento[]);
      return { count: payload.documentos.length, source: 'full' };
    }
  } catch {
    /* ignore */
  }

  return { count: 0, source: 'none' };
}

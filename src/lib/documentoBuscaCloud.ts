/**
 * Garante documentos no payload para resolver busca parcial (boot leve sem documentos[]).
 * Ordem: local → list_page / search RPC → read exacto (sempre com itens) → fatia documentos.
 */
import type { DocumentoPlanejamento, IsoSnapshotPayload } from 'iso-pro-shared';
import { fetchSnapshotSlices } from './snapshot';
import { readDocumentoPlanejamentoFromCloud, searchDocumentosPlanejamentoFromCloud } from './isoProSnapshot';
import { listDocumentosPlanejamentoPageFromCloud } from './escalaCloud';
import { resolverBuscaDocumentoPorNumero } from './documentoBusca';

function preferirDocumentoMaisCompleto(
  a: DocumentoPlanejamento | undefined,
  b: DocumentoPlanejamento,
): DocumentoPlanejamento {
  if (!a) return b;
  const aLen = a.itens?.length ?? 0;
  const bLen = b.itens?.length ?? 0;
  if (bLen > aLen) return b;
  if (aLen > bLen) return a;
  return b;
}

function mergeDocumentoLists(
  base: DocumentoPlanejamento[],
  extra: DocumentoPlanejamento[],
): DocumentoPlanejamento[] {
  const map = new Map<string, DocumentoPlanejamento>();
  for (const d of base) {
    const id = String(d.id ?? '');
    if (!id) continue;
    map.set(id, preferirDocumentoMaisCompleto(map.get(id), d));
  }
  for (const d of extra) {
    const id = String(d.id ?? '');
    if (!id) continue;
    map.set(id, preferirDocumentoMaisCompleto(map.get(id), d));
  }
  return [...map.values()];
}

/** list_page / resumo devolvem itens:[]; hidrata com read completo. */
async function hidratarDocumentosSemItens(
  docs: DocumentoPlanejamento[],
): Promise<DocumentoPlanejamento[]> {
  const out: DocumentoPlanejamento[] = [];
  for (const d of docs) {
    if ((d.itens?.length ?? 0) > 0) {
      out.push(d);
      continue;
    }
    try {
      const cloud = await readDocumentoPlanejamentoFromCloud({
        documentoId: d.id,
        numero: d.numero,
        revisao: d.revisao,
      });
      if (cloud.documento) {
        out.push(cloud.documento as unknown as DocumentoPlanejamento);
      } else {
        out.push(d);
      }
    } catch {
      out.push(d);
    }
  }
  return out;
}

export async function carregarDocumentosParaBuscaTexto(input: {
  payload: IsoSnapshotPayload;
  buscaTexto: string;
  mergeDocumentos: (docs: DocumentoPlanejamento[]) => void;
}): Promise<DocumentoPlanejamento[]> {
  const texto = input.buscaTexto.trim();
  let documentos = (input.payload.documentos ?? []) as DocumentoPlanejamento[];
  if (!texto) return documentos;

  const localHit = resolverBuscaDocumentoPorNumero(documentos, texto);
  if (localHit.kind !== 'none') {
    const candidates = localHit.kind === 'one' ? [localHit.doc] : localHit.docs;
    const needsHydrate = candidates.some((d) => (d.itens?.length ?? 0) === 0);
    if (!needsHydrate) return documentos;
    const hydrated = await hidratarDocumentosSemItens(candidates);
    input.mergeDocumentos(hydrated);
    return mergeDocumentoLists(documentos, hydrated);
  }

  try {
    const page = await listDocumentosPlanejamentoPageFromCloud({
      busca: texto,
      offset: 0,
      limit: 50,
    });
    if (!page.missing && page.documentos.length > 0) {
      const found = await hidratarDocumentosSemItens(page.documentos as DocumentoPlanejamento[]);
      input.mergeDocumentos(found);
      documentos = mergeDocumentoLists(documentos, found);
      if (resolverBuscaDocumentoPorNumero(documentos, texto).kind !== 'none') {
        return documentos;
      }
    }
  } catch {
    /* tenta search legado */
  }

  try {
    const search = await searchDocumentosPlanejamentoFromCloud(texto);
    if (!search.missing && search.documentos.length > 0) {
      const found = await hidratarDocumentosSemItens(
        search.documentos as unknown as DocumentoPlanejamento[],
      );
      input.mergeDocumentos(found);
      documentos = mergeDocumentoLists(documentos, found);
      if (resolverBuscaDocumentoPorNumero(documentos, texto).kind !== 'none') {
        return documentos;
      }
    }
  } catch {
    /* tenta fallbacks */
  }

  try {
    const cloud = await readDocumentoPlanejamentoFromCloud({ numero: texto });
    if (cloud.documento) {
      const doc = cloud.documento as unknown as DocumentoPlanejamento;
      input.mergeDocumentos([doc]);
      documentos = mergeDocumentoLists(documentos, [doc]);
      if (resolverBuscaDocumentoPorNumero(documentos, texto).kind !== 'none') {
        return documentos;
      }
    }
  } catch {
    /* tenta fatia completa só se RPCs em falta */
  }

  try {
    const pageProbe = await listDocumentosPlanejamentoPageFromCloud({ busca: texto, limit: 1 });
    if (!pageProbe.missing) {
      return documentos;
    }
  } catch {
    /* continua para fatia */
  }

  try {
    const { payload: slice, error } = await fetchSnapshotSlices(['documentos']);
    if (!error && slice?.documentos?.length) {
      const found = slice.documentos as DocumentoPlanejamento[];
      input.mergeDocumentos(found);
      return mergeDocumentoLists(documentos, found);
    }
  } catch {
    /* mantem local */
  }

  return documentos;
}

import { describe, expect, it, vi } from 'vitest';
import type { DocumentoPlanejamento, IsoSnapshotPayload } from 'iso-pro-shared';
import { carregarDocumentosParaBuscaTexto } from './documentoBuscaCloud';

vi.mock('./isoProSnapshot', () => ({
  readDocumentoPlanejamentoFromCloud: vi.fn(),
  searchDocumentosPlanejamentoFromCloud: vi.fn(),
}));

vi.mock('./escalaCloud', () => ({
  listDocumentosPlanejamentoPageFromCloud: vi.fn(async () => ({
    documentos: [],
    updatedAt: null,
    missing: true,
  })),
}));

vi.mock('./snapshot', () => ({
  fetchSnapshotSlices: vi.fn(),
}));

import { readDocumentoPlanejamentoFromCloud, searchDocumentosPlanejamentoFromCloud } from './isoProSnapshot';
import { fetchSnapshotSlices } from './snapshot';

describe('carregarDocumentosParaBuscaTexto', () => {
  it('usa busca parcial na nuvem quando payload local nao tem documentos', async () => {
    vi.mocked(searchDocumentosPlanejamentoFromCloud).mockResolvedValue({
      documentos: [
        {
          id: 'd-aq',
          numero: 'AQ-3-BT-232-CS10-IQ',
          revisao: 'A',
          itens: [{ id: 'i1', codigo: 'M1', quantidade: 10, quantidadeAtendida: 0 }],
        },
      ],
      updatedAt: '2026-07-05T20:00:00.000Z',
      missing: false,
    });
    vi.mocked(readDocumentoPlanejamentoFromCloud).mockResolvedValue({
      documento: null,
      updatedAt: null,
      missing: false,
    });

    const payload: IsoSnapshotPayload = { documentos: [] };
    const merged: DocumentoPlanejamento[] = [];
    const docs = await carregarDocumentosParaBuscaTexto({
      payload,
      buscaTexto: 'AQ',
      mergeDocumentos: (d) => merged.push(...d),
    });

    expect(searchDocumentosPlanejamentoFromCloud).toHaveBeenCalledWith('AQ');
    expect(docs.some((d) => String(d.numero).includes('AQ-3-BT'))).toBe(true);
    expect(merged).toHaveLength(1);
  });

  it('cai na fatia documentos quando RPC de busca nao existe', async () => {
    vi.mocked(searchDocumentosPlanejamentoFromCloud).mockResolvedValue({
      documentos: [],
      updatedAt: null,
      missing: true,
    });
    vi.mocked(readDocumentoPlanejamentoFromCloud).mockResolvedValue({
      documento: null,
      updatedAt: null,
      missing: true,
    });
    vi.mocked(fetchSnapshotSlices).mockResolvedValue({
      payload: {
        documentos: [{ id: 'd-spd', numero: 'SPD-001', revisao: 'B', itens: [] }],
      } as IsoSnapshotPayload,
      updatedAt: '2026-07-05T20:00:00.000Z',
      error: null,
    });

    const docs = await carregarDocumentosParaBuscaTexto({
      payload: { documentos: [] },
      buscaTexto: 'SPD',
      mergeDocumentos: () => {},
    });

    expect(fetchSnapshotSlices).toHaveBeenCalledWith(['documentos']);
    expect(docs.some((d) => String(d.numero).startsWith('SPD'))).toBe(true);
  });
});

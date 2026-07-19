import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSnapshotPatchFromNext,
  commitDefaultSnapshotPatchWrite,
  fetchSnapshotSlices,
} from './snapshot';

vi.mock('./registrarAtendimento', () => ({
  garantirIdsDocumentosPlanejamento: vi.fn(),
}));
vi.mock('./config', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
}));
vi.mock('./errorReporting', () => ({
  captureOperationalEvent: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('./formatOperadorNetworkError', () => ({
  formatOperadorNetworkError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));
vi.mock('./isoProSnapshot', () => ({
  commitIsoProSnapshotPatch: vi.fn(),
  invalidateIsoProSnapshotCache: vi.fn(),
  isIsoProSnapshotConflictError: vi.fn(() => false),
  readIsoProSnapshotSlicesForWrite: vi.fn(),
  readIsoProSnapshotSlicesWithUpdatedAt: vi.fn(),
  readIsoProSnapshotStats: vi.fn(),
}));
vi.mock('./supabase', () => ({
  getSupabase: vi.fn(() => ({})),
}));
vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));

import {
  commitIsoProSnapshotPatch,
  readIsoProSnapshotSlicesForWrite,
  readIsoProSnapshotSlicesWithUpdatedAt,
} from './isoProSnapshot';

describe('fetchSnapshotSlices', () => {
  beforeEach(() => {
    vi.mocked(readIsoProSnapshotSlicesWithUpdatedAt).mockReset();
  });

  it('enriquece documentos a partir de fatias parciais', async () => {
    vi.mocked(readIsoProSnapshotSlicesWithUpdatedAt).mockResolvedValue({
      slices: {
        documentos: [{ id: 'doc-1', numero: 'D-01', itens: [] }],
        materiais: [],
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await fetchSnapshotSlices(['documentos', 'materiais']);
    expect(result.error).toBeNull();
    expect(result.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.payload?.documentos).toHaveLength(1);
  });
});

describe('buildSnapshotPatchFromNext', () => {
  it('extrai apenas chaves indicadas', () => {
    const patch = buildSnapshotPatchFromNext(
      {
        documentos: [{ id: 'doc-1', numero: 'A', itens: [] }],
        materiais: [{ codigo: 'M1' }],
        dataAtualizacao: '2026-01-01',
      },
      ['documentos', 'dataAtualizacao'],
    );
    expect(patch).toEqual({
      documentos: [{ id: 'doc-1', numero: 'A', itens: [] }],
      dataAtualizacao: '2026-01-01',
    });
    expect(patch.materiais).toBeUndefined();
  });
});

describe('commitDefaultSnapshotPatchWrite', () => {
  beforeEach(() => {
    vi.mocked(commitIsoProSnapshotPatch).mockReset();
  });

  it('propaga erro de prepare', async () => {
    vi.mocked(commitIsoProSnapshotPatch).mockImplementation(async (prepare) => {
      await prepare();
    });
    const result = await commitDefaultSnapshotPatchWrite(async () => {
      throw new Error('prepare falhou');
    });
    expect(result.error).toBe('prepare falhou');
    expect(result.conflict).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SNAPSHOT_CONFLICT_MESSAGE,
  commitDefaultSnapshotWrite,
  upsertDefaultSnapshot,
} from './snapshot';
import { getSupabase } from './supabase';

vi.mock('./registrarAtendimento', () => ({
  garantirIdsDocumentosPlanejamento: vi.fn(),
}));
vi.mock('./config', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
}));
vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));

const payloadMinimo = {
  documentos: [],
  materiais: [],
  recebimentos: [],
  colaboradores: [],
};

describe('upsertDefaultSnapshot', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset();
  });

  it('sem Supabase devolve erro de configuração', async () => {
    vi.mocked(getSupabase).mockReturnValue(null);
    const r = await upsertDefaultSnapshot(payloadMinimo, '2026-01-01T00:00:00.000Z');
    expect(r.error).toMatch(/não configurado/i);
    expect(r.conflict).toBe(false);
  });

  it('com baseline e zero linhas atualizadas marca conflito', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    const r = await upsertDefaultSnapshot(payloadMinimo, '2026-01-01T00:00:00.000Z');
    expect(r.conflict).toBe(true);
    expect(r.error).toBe(SNAPSHOT_CONFLICT_MESSAGE);
  });

  it('com baseline e linha atualizada devolve updatedAt', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'default' }], error: null }),
    }));
    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    const r = await upsertDefaultSnapshot(payloadMinimo, '2026-01-01T00:00:00.000Z');
    expect(r.conflict).toBe(false);
    expect(r.error).toBeNull();
    expect(r.updatedAt).toMatch(/^\d{4}-/);
  });
});

describe('commitDefaultSnapshotWrite', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset();
  });

  it('repete prepare quando há conflito e depois sucede', async () => {
    let calls = 0;
    const update = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockImplementation(async () => {
        calls += 1;
        return { data: calls >= 2 ? [{ id: 'default' }] : [], error: null };
      }),
    }));
    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    const r = await commitDefaultSnapshotWrite(async () => ({
      nextPayload: payloadMinimo,
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    }));

    expect(r.conflict).toBe(false);
    expect(r.error).toBeNull();
    expect(calls).toBe(2);
  });
});

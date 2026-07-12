import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

vi.mock('./snapshot', () => ({
  fetchSnapshotSlicesForWrite: vi.fn(),
}));

import { fetchSnapshotSlicesForWrite } from './snapshot';
import { createSnapshotPatchPrepareWithBaseline } from './snapshotWritePrepare';

describe('createSnapshotPatchPrepareWithBaseline', () => {
  beforeEach(() => {
    vi.mocked(fetchSnapshotSlicesForWrite).mockReset();
  });

  it('usa baseline em memória na primeira tentativa sem ir à nuvem', async () => {
    const baselinePayload = { documentos: [{ id: 'd1', numero: 'A', itens: [] }] } as IsoSnapshotPayload;
    const prepare = createSnapshotPatchPrepareWithBaseline(
      { payload: baselinePayload, updatedAt: '2026-06-07T10:00:00.000Z' },
      ['documentos'],
      (payload) => ({
        patch: { documentos: payload.documentos, dataAtualizacao: '2026-06-07T10:00:01.000Z' },
      }),
    );

    const plan = await prepare();

    expect(fetchSnapshotSlicesForWrite).not.toHaveBeenCalled();
    expect(plan.baselineUpdatedAt).toBe('2026-06-07T10:00:00.000Z');
    expect(plan.patch.dataAtualizacao).toBe('2026-06-07T10:00:01.000Z');
  });

  it('rele da nuvem a partir da segunda tentativa (conflito)', async () => {
    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { documentos: [{ id: 'd2', numero: 'B', itens: [] }] } as IsoSnapshotPayload,
      updatedAt: '2026-06-07T11:00:00.000Z',
      error: null,
    });

    const prepare = createSnapshotPatchPrepareWithBaseline(
      { payload: { documentos: [] } as IsoSnapshotPayload, updatedAt: '2026-06-07T10:00:00.000Z' },
      ['documentos'],
      (payload) => ({
        patch: { documentos: payload.documentos },
      }),
    );

    await prepare();
    const retryPlan = await prepare();

    expect(fetchSnapshotSlicesForWrite).toHaveBeenCalledTimes(1);
    expect(retryPlan.baselineUpdatedAt).toBe('2026-06-07T11:00:00.000Z');
    expect(retryPlan.patch.documentos).toEqual([{ id: 'd2', numero: 'B', itens: [] }]);
  });

  it('vai à nuvem quando não há baseline', async () => {
    vi.mocked(fetchSnapshotSlicesForWrite).mockResolvedValue({
      payload: { documentos: [] } as IsoSnapshotPayload,
      updatedAt: '2026-06-07T12:00:00.000Z',
      error: null,
    });

    const prepare = createSnapshotPatchPrepareWithBaseline(null, ['documentos'], (payload) => ({
      patch: { documentos: payload.documentos },
    }));

    const plan = await prepare();

    expect(fetchSnapshotSlicesForWrite).toHaveBeenCalledTimes(1);
    expect(plan.baselineUpdatedAt).toBe('2026-06-07T12:00:00.000Z');
  });
});

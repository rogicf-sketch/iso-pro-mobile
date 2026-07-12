import { describe, expect, it } from 'vitest';
import { buildInventarioContagemPatchPlan } from './inventarioSnapshotPatch';

describe('buildInventarioContagemPatchPlan', () => {
  it('envia delta com mergeKeys e preserva inventarios irmaos no fallback', () => {
    const plan = buildInventarioContagemPatchPlan({
      freshInventarios: [
        {
          id: 'inv-1',
          status: 'aberto',
          itens: [
            { id: 'a', quantidadeContada: 10 },
            { id: 'b', quantidadeContada: 0 },
          ],
        },
        { id: 'inv-2', status: 'aberto', itens: [{ id: 'z', quantidadeContada: 1 }] },
      ],
      inventarioId: 'inv-1',
      localInventario: {
        id: 'inv-1',
        status: 'aberto',
        itens: [
          { id: 'a', quantidadeContada: 0 },
          { id: 'b', quantidadeContada: 4 },
        ],
      },
    });

    expect(plan.mergeKeys).toEqual(['inventarios']);
    expect(plan.patch.inventarios).toHaveLength(1);
    expect(plan.patchWithoutMerge.inventarios).toHaveLength(2);

    const merged = (plan.patch.inventarios as Array<{ itens: Array<{ id: string; quantidadeContada: number }> }>)[0]!;
    expect(merged.itens.find((i) => i.id === 'a')?.quantidadeContada).toBe(10);
    expect(merged.itens.find((i) => i.id === 'b')?.quantidadeContada).toBe(4);
  });

  it('falha se o inventario nao existe no snapshot fresco', () => {
    expect(() =>
      buildInventarioContagemPatchPlan({
        freshInventarios: [{ id: 'other', status: 'aberto', itens: [] }],
        inventarioId: 'inv-1',
        localInventario: { id: 'inv-1', itens: [] },
      }),
    ).toThrow(/localizar o inventário/);
  });
});

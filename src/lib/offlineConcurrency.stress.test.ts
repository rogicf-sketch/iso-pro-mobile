import { describe, expect, it } from 'vitest';
import { mergeSnapshotForOfflineReplay } from './offlineSnapshotMerge.utils';

/**
 * Stress: 2 aparelhos offline no mesmo inventário / SKU.
 * Simula flush sequencial (A depois B) sobre snapshot fresco.
 */
describe('stress 2 offline → mesmo inventário/SKU', () => {
  const cloudBase = {
    dataAtualizacao: 'cloud',
    inventarios: [
      {
        id: 'inv-1',
        status: 'aberto' as const,
        itens: [
          { id: 'sku-a', codigoMaterial: 'A', quantidadeContada: 0, localizacaoContada: '' },
          { id: 'sku-b', codigoMaterial: 'B', quantidadeContada: 0, localizacaoContada: '' },
          { id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 5, localizacaoContada: 'R1' },
        ],
      },
      {
        id: 'inv-2',
        status: 'aberto' as const,
        itens: [{ id: 'sku-z', codigoMaterial: 'Z', quantidadeContada: 1, localizacaoContada: '' }],
      },
    ],
    materiais: [{ codigo: 'A', saldoAtual: 100 }],
  };

  it('dois aparelhos contam SKUs diferentes no mesmo inventário — ambas contagens sobrevivem', () => {
    const deviceA = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [
            { id: 'sku-a', codigoMaterial: 'A', quantidadeContada: 12, localizacaoContada: 'A1' },
            { id: 'sku-b', codigoMaterial: 'B', quantidadeContada: 0, localizacaoContada: '' },
            { id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 5, localizacaoContada: 'R1' },
          ],
        },
      ],
    };
    const deviceB = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [
            { id: 'sku-a', codigoMaterial: 'A', quantidadeContada: 0, localizacaoContada: '' },
            { id: 'sku-b', codigoMaterial: 'B', quantidadeContada: 7, localizacaoContada: 'B2' },
            { id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 5, localizacaoContada: 'R1' },
          ],
        },
      ],
    };

    let cloud = mergeSnapshotForOfflineReplay(cloudBase, deviceA);
    cloud = mergeSnapshotForOfflineReplay(cloud, deviceB);

    const inv = cloud.inventarios?.find((i) => i.id === 'inv-1');
    const itens = inv?.itens ?? [];
    expect(itens.find((i) => i.id === 'sku-a')?.quantidadeContada).toBe(12);
    expect(itens.find((i) => i.id === 'sku-b')?.quantidadeContada).toBe(7);
    expect(itens.find((i) => i.id === 'sku-c')?.quantidadeContada).toBe(5);
    expect(cloud.inventarios?.find((i) => i.id === 'inv-2')?.itens?.[0]?.quantidadeContada).toBe(1);
  });

  it('mesmo SKU contado nos dois aparelhos — fica o maior contagem', () => {
    const deviceA = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 8, localizacaoContada: 'R2' }],
        },
      ],
    };
    const deviceB = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 11, localizacaoContada: 'R3' }],
        },
      ],
    };

    let cloud = mergeSnapshotForOfflineReplay(cloudBase, deviceA);
    cloud = mergeSnapshotForOfflineReplay(cloud, deviceB);

    const skuC = cloud.inventarios?.find((i) => i.id === 'inv-1')?.itens?.find((i) => i.id === 'sku-c');
    expect(skuC?.quantidadeContada).toBe(11);
    expect(skuC?.localizacaoContada).toBe('R3');
  });

  it('ordem B→A no mesmo SKU ainda preserva o máximo', () => {
    const deviceA = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 20, localizacaoContada: 'A' }],
        },
      ],
    };
    const deviceB = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'sku-c', codigoMaterial: 'C', quantidadeContada: 3, localizacaoContada: 'B' }],
        },
      ],
    };

    let cloud = mergeSnapshotForOfflineReplay(cloudBase, deviceB);
    cloud = mergeSnapshotForOfflineReplay(cloud, deviceA);

    expect(
      cloud.inventarios?.find((i) => i.id === 'inv-1')?.itens?.find((i) => i.id === 'sku-c')?.quantidadeContada,
    ).toBe(20);
  });

  it('dois saldos offline no mesmo material — nuvem prevalece', () => {
    const a = { materiais: [{ codigo: 'A', saldoAtual: 40 }] };
    const b = { materiais: [{ codigo: 'A', saldoAtual: 55 }] };

    let cloud = mergeSnapshotForOfflineReplay(cloudBase, a);
    cloud = mergeSnapshotForOfflineReplay(cloud, b);

    expect(cloud.materiais?.[0]?.saldoAtual).toBe(100);
  });

  it('inventário irmão não é apagado quando só um inventário vem na fila', () => {
    const onlyInv1 = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'sku-a', codigoMaterial: 'A', quantidadeContada: 1, localizacaoContada: '' }],
        },
      ],
    };
    const cloud = mergeSnapshotForOfflineReplay(cloudBase, onlyInv1);
    expect(cloud.inventarios).toHaveLength(2);
    expect(cloud.inventarios?.map((i) => i.id).sort()).toEqual(['inv-1', 'inv-2']);
  });
});

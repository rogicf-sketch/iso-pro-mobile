import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';
import {
  criarItemInventarioDoMaterial,
  indiceItemInventarioPorCodigoMaterial,
  resolverMaterialParaInventario,
} from './inventarioContagem';

describe('inventarioContagem / inventario aberto mobile', () => {
  it('cria item com saldo sistema informado', () => {
    const item = criarItemInventarioDoMaterial({ codigo: 'M1', descricao: 'Parafuso', unidade: 'PC' }, 0);
    expect(item.codigoMaterial).toBe('M1');
    expect(item.saldoSistema).toBe(0);
    expect(item.id).toMatch(/^mob-/);
  });

  it('resolve material do cadastro por codigo', () => {
    const payload: IsoSnapshotPayload = {
      materiais: [{ id: '1', codigo: 'BAR-30', descricao: 'Barra', unidade: 'M' }],
    };
    const m = resolverMaterialParaInventario(payload, 'BAR-30');
    expect(m?.codigo).toBe('BAR-30');
  });

  it('indiceItemInventarioPorCodigoMaterial ignora maiusculas', () => {
    const idx = indiceItemInventarioPorCodigoMaterial(
      [{ id: 'a', codigoMaterial: 'bar-30', descricaoMaterial: 'X', unidade: 'M' }],
      'BAR-30',
    );
    expect(idx).toBe(0);
  });
});

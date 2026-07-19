import { describe, expect, it } from 'vitest';
import type { InventarioSnapshot } from 'iso-pro-shared';
import { inventarioLocalDifereDoSnapshot, mergeContagemLocalEmInventario } from './inventarioEstado';

describe('mergeContagemLocalEmInventario', () => {
  it('aplica quantidade e local da contagem', () => {
    const inv: InventarioSnapshot = {
      id: 'inv-1',
      status: 'aberto',
      itens: [{ id: 'li-1', codigoMaterial: 'M1', saldoSistema: 10 }],
    };
    const merged = mergeContagemLocalEmInventario(inv, { 'li-1': '7' }, { 'li-1': 'A-12' });
    expect(merged.itens![0]!.quantidadeContada).toBe(7);
    expect(merged.itens![0]!.localizacaoContada).toBe('A-12');
  });
});

describe('inventarioLocalDifereDoSnapshot', () => {
  it('detecta divergência de local', () => {
    const local: InventarioSnapshot = {
      id: 'inv-1',
      status: 'aberto',
      itens: [{ id: 'li-1', quantidadeContada: 5, localizacaoContada: 'B-01' }],
    };
    const payload = {
      inventarios: [
        {
          id: 'inv-1',
          status: 'aberto' as const,
          itens: [{ id: 'li-1', quantidadeContada: 5, localizacaoContada: 'A-12' }],
        },
      ],
    };
    expect(inventarioLocalDifereDoSnapshot(local, payload)).toBe(true);
  });
});

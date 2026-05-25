import { describe, expect, it } from 'vitest';
import type { RecebimentoItem } from 'iso-pro-shared';
import {
  aplicarLocalizacaoNoItem,
  locLinhaNormalizada,
  normalizarTextoLocalizacaoItem,
} from './conferenciaLocalizacao';

describe('conferenciaLocalizacao', () => {
  it('normaliza e limita texto', () => {
    expect(normalizarTextoLocalizacaoItem('  A-12  ')).toBe('A-12');
  });

  it('aplica e remove localizacao no item', () => {
    const row = {} as RecebimentoItem;
    aplicarLocalizacaoNoItem(row, 'B-04');
    expect(locLinhaNormalizada(row)).toBe('B-04');
    aplicarLocalizacaoNoItem(row, '  ');
    expect(locLinhaNormalizada(row)).toBe('');
    expect(row.localizacao).toBeUndefined();
  });
});

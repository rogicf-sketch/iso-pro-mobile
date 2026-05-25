import { describe, expect, it } from 'vitest';
import type { RecebimentoItem } from 'iso-pro-shared';
import {
  aplicarLocalizacaoNoItem,
  limitarTextoLocalizacaoEmEdicao,
  locLinhaNormalizada,
  normalizarTextoLocalizacaoItem,
} from './conferenciaLocalizacao';

describe('conferenciaLocalizacao', () => {
  it('em edicao mantem espacos no meio e no fim', () => {
    expect(limitarTextoLocalizacaoEmEdicao('Galpão ')).toBe('Galpão ');
    expect(limitarTextoLocalizacaoEmEdicao('Galpão A')).toBe('Galpão A');
  });

  it('normaliza e limita texto ao gravar', () => {
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

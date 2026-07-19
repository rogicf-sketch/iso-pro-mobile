import { describe, expect, it } from 'vitest';
import type { InventarioItemSnapshot, IsoSnapshotPayload } from 'iso-pro-shared';
import {
  codigosMaterialPorBuscaRecebimento,
  descreverLeituraInventarioParaErro,
  encontrarIndiceItemInventarioPorLeitura,
  filtrarItensInventarioPorBusca,
  recebimentoBuscaCombina,
} from './inventarioContagem';
import { gerarCodigoBarras } from './registrarAtendimento';

const itens: InventarioItemSnapshot[] = [
  { id: '1', codigoMaterial: 'TB-001', descricaoMaterial: 'Tubo' },
  { id: '2', codigoMaterial: 'EL-002', descricaoMaterial: 'Cabo' },
];

const payload: IsoSnapshotPayload = {
  recebimentos: [
    {
      id: 'r1',
      nota: 'NF-3365',
      itens: [{ codigo: 'TB-001', quantidade: 10 }],
    },
    {
      id: 'r2',
      nota: 'NF-9900',
      itens: [{ codigo: 'ZZ-999', quantidade: 1 }],
    },
  ],
};

describe('filtrarItensInventarioPorBusca', () => {
  it('filtra por codigo ou descricao', () => {
    expect(filtrarItensInventarioPorBusca(itens, 'tubo')).toHaveLength(1);
    expect(filtrarItensInventarioPorBusca(itens, 'EL-002')).toHaveLength(1);
  });

  it('filtra itens do inventario pela NF do recebimento', () => {
    const out = filtrarItensInventarioPorBusca(itens, '3365', payload);
    expect(out).toHaveLength(1);
    expect(out[0]?.codigoMaterial).toBe('TB-001');
  });

  it('nao devolve itens quando NF existe mas material nao esta no inventario', () => {
    expect(filtrarItensInventarioPorBusca(itens, '9900', payload)).toHaveLength(0);
  });
});

describe('codigosMaterialPorBuscaRecebimento', () => {
  it('extrai codigos das linhas dos recebimentos filtrados', () => {
    const recs = (payload.recebimentos ?? []).filter((r) => String(r.nota ?? '').includes('3365'));
    const codes = codigosMaterialPorBuscaRecebimento(recs, '3365');
    expect(codes.has('TB-001')).toBe(true);
    expect(codes.size).toBe(1);
  });
});

describe('recebimentoBuscaCombina', () => {
  it('detecta NF conhecida no snapshot', () => {
    expect(recebimentoBuscaCombina(payload, '3365')).toBe(true);
    expect(recebimentoBuscaCombina(payload, 'inexistente')).toBe(false);
  });
});

describe('encontrarIndiceItemInventarioPorLeitura', () => {
  const itensInv: InventarioItemSnapshot[] = [
    { id: '1', codigoMaterial: 'ATER0003', descricaoMaterial: 'Barra chata' },
    { id: '2', codigoMaterial: 'TB-01', descricaoMaterial: 'Tubo' },
  ];

  it('encontra por código alfanumérico', () => {
    expect(encontrarIndiceItemInventarioPorLeitura(itensInv, 'ATER0003')).toBe(0);
  });

  it('encontra por QR da etiqueta I.S.O PRO (COD:…)', () => {
    expect(
      encontrarIndiceItemInventarioPorLeitura(itensInv, 'NF:123|COD:ATER0003|ROM:|LOC:PATIO'),
    ).toBe(0);
  });

  it('encontra por código de barras 1D (hash numérico)', () => {
    const hash = gerarCodigoBarras('ATER0003');
    expect(encontrarIndiceItemInventarioPorLeitura(itensInv, hash)).toBe(0);
  });

  it('devolve -1 se material não está na lista do inventário', () => {
    expect(encontrarIndiceItemInventarioPorLeitura(itensInv, 'ZZ-999')).toBe(-1);
  });
});

describe('descreverLeituraInventarioParaErro', () => {
  it('formata código de barras numérico', () => {
    expect(descreverLeituraInventarioParaErro('123456789012')).toContain('código de barras');
  });
});

import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload, Material } from 'iso-pro-shared';
import {
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  garantirIdsDocumentosPlanejamento,
  gerarCodigoBarras,
  listarDocumentosComDemandaPendenteMaterial,
  resolverMaterialParaBaixaPorCodigo,
} from './registrarAtendimento';

describe('extrairCodigoMaterialDeTextoLeitura', () => {
  it('extrai COD do payload QR do recebimento', () => {
    expect(extrairCodigoMaterialDeTextoLeitura('NF:123|COD:TB-01|ROM:R1|LOC:A1')).toBe('TB-01');
  });

  it('extrai codigo de URL com query', () => {
    expect(extrairCodigoMaterialDeTextoLeitura('https://exemplo.local/?codigo=EL-99')).toBe('EL-99');
  });

  it('extrai de JSON e devolve texto simples', () => {
    expect(extrairCodigoMaterialDeTextoLeitura('{"codigo":"MEC-1"}')).toBe('MEC-1');
    expect(extrairCodigoMaterialDeTextoLeitura('  ABC  ')).toBe('ABC');
  });
});

describe('gerarCodigoBarras / encontrarMaterialPorCodigoOuBarras', () => {
  const materiais: Material[] = [{ codigo: 'TB-01', descricao: 'Tubo', unidade: 'UN' }];

  it('encontra por codigo ou hash 1D', () => {
    const hash = gerarCodigoBarras('TB-01');
    expect(encontrarMaterialPorCodigoOuBarras(materiais, 'TB-01')?.codigo).toBe('TB-01');
    expect(encontrarMaterialPorCodigoOuBarras(materiais, hash)?.codigo).toBe('TB-01');
  });
});

describe('garantirIdsDocumentosPlanejamento', () => {
  it('atribui ids a desenhos e linhas sem id', () => {
    const payload = {
      documentos: [
        {
          numero: 'PL-100',
          revisao: 'A',
          itens: [{ codigo: 'M1', quantidade: 5, quantidadeAtendida: 0 }],
        },
      ],
    } as IsoSnapshotPayload;
    garantirIdsDocumentosPlanejamento(payload);
    const doc = payload.documentos![0]!;
    expect(String(doc.id).length).toBeGreaterThan(0);
    expect(String(doc.itens![0]!.id).length).toBeGreaterThan(0);
  });
});

describe('listarDocumentosComDemandaPendenteMaterial', () => {
  it('lista desenhos com quantidade pendente para o codigo', () => {
    const payload: IsoSnapshotPayload = {
      documentos: [
        {
          id: 'd1',
          numero: 'PL-1',
          revisao: 'A',
          itens: [
            { id: 'i1', codigo: 'M1', quantidade: 10, quantidadeAtendida: 3, unidade: 'UN' },
            { id: 'i2', codigo: 'M2', quantidade: 5, quantidadeAtendida: 5, unidade: 'UN' },
          ],
        },
      ],
    };
    const lista = listarDocumentosComDemandaPendenteMaterial(payload, 'M1');
    expect(lista).toHaveLength(1);
    expect(lista[0]!.restanteMaterial).toBe(7);
  });
});

describe('resolverMaterialParaBaixaPorCodigo', () => {
  it('resolve pelo cadastro materiais', () => {
    const payload: IsoSnapshotPayload = {
      materiais: [{ codigo: 'X1', descricao: 'Item X', unidade: 'PC' }],
      documentos: [],
    };
    expect(resolverMaterialParaBaixaPorCodigo(payload, 'X1')?.codigo).toBe('X1');
  });

  it('sintetiza a partir da linha do planejamento se materiais vazio', () => {
    const payload: IsoSnapshotPayload = {
      materiais: [],
      documentos: [
        {
          id: 'd1',
          numero: 'PL-2',
          revisao: 'B',
          itens: [{ id: 'i1', codigo: 'Y2', descricao: 'Linha Y', quantidade: 1, quantidadeAtendida: 0, unidade: 'UN' }],
        },
      ],
    };
    expect(resolverMaterialParaBaixaPorCodigo(payload, 'Y2')?.descricao).toBe('Linha Y');
  });
});

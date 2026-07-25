import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload, Material } from 'iso-pro-shared';
import {
  avaliarLeituraScanAtendimento,
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  garantirIdsDocumentosPlanejamento,
  gerarCodigoBarras,
  listarDocumentosComDemandaPendenteMaterial,
  mensagemBloqueioBaixaPorCodigo,
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

describe('avaliarLeituraScanAtendimento', () => {
  const payload = {
    materiais: [{ codigo: 'TB-01', descricao: 'Tubo', unidade: 'UN' }],
    documentos: [],
  } as unknown as IsoSnapshotPayload;

  it('marca encontrado quando o codigo existe no cadastro', () => {
    const r = avaliarLeituraScanAtendimento(payload, 'TB-01');
    expect(r.encontrado).toBe(true);
    expect(r.codigo).toBe('TB-01');
    expect(r.vazio).toBe(false);
  });

  it('resolve pelo hash 1D e devolve o codigo canonico', () => {
    const hash = gerarCodigoBarras('TB-01');
    const r = avaliarLeituraScanAtendimento(payload, hash);
    expect(r.encontrado).toBe(true);
    expect(r.codigo).toBe('TB-01');
  });

  it('marca nao encontrado quando o codigo nao existe', () => {
    const r = avaliarLeituraScanAtendimento(payload, 'NAO-EXISTE-999');
    expect(r.encontrado).toBe(false);
    expect(r.vazio).toBe(false);
    expect(r.codigo).toBe('NAO-EXISTE-999');
  });

  it('marca vazio quando a leitura nao produz codigo', () => {
    expect(avaliarLeituraScanAtendimento(payload, '   ').vazio).toBe(true);
  });

  it('sem payload devolve nao encontrado mas com o codigo extraido', () => {
    const r = avaliarLeituraScanAtendimento(null, 'NF:1|COD:TB-01|ROM:R1');
    expect(r.encontrado).toBe(false);
    expect(r.codigo).toBe('TB-01');
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

  it('nao altera desenhos que ja tem ids completos', () => {
    const payload: IsoSnapshotPayload = {
      documentos: [
        {
          id: 'doc-fixo',
          numero: 'PL-200',
          revisao: 'B',
          itens: [{ id: 'item-fixo', codigo: 'M1', quantidade: 1, quantidadeAtendida: 0 }],
        },
      ],
    };
    garantirIdsDocumentosPlanejamento(payload);
    expect(payload.documentos![0]!.id).toBe('doc-fixo');
    expect(payload.documentos![0]!.itens![0]!.id).toBe('item-fixo');
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

  it('sintetiza a partir de recebimentos quando boot nao tem materiais nem docs', () => {
    const payload: IsoSnapshotPayload = {
      materiais: [],
      documentos: [],
      recebimentos: [
        {
          id: 'r1',
          modoRecebimento: 'direto',
          itens: [
            {
              codigo: 'EPRD10PVN4C_1_35',
              descricao: 'Perfil',
              unidade: 'PC',
              quantidade: 100,
            },
          ],
        },
      ],
    };
    const m = resolverMaterialParaBaixaPorCodigo(payload, 'EPRD10PVN4C_1_35');
    expect(m?.codigo).toBe('EPRD10PVN4C_1_35');
    expect(m?.descricao).toBe('Perfil');
    expect(avaliarLeituraScanAtendimento(payload, 'EPRD10PVN4C_1_35').encontrado).toBe(true);
  });

  it('reconhece hash 1D quando so existe o codigo no recebimento', () => {
    const codigo = 'C9LEI004009B00-8035207';
    const hash = gerarCodigoBarras(codigo);
    const payload: IsoSnapshotPayload = {
      materiais: [],
      documentos: [],
      recebimentos: [
        {
          id: 'rec-hash-1d',
          modoRecebimento: 'direto',
          itens: [{ codigo, descricao: 'Cabo', unidade: 'M', quantidade: 50 }],
        },
      ],
    };
    expect(resolverMaterialParaBaixaPorCodigo(payload, hash)?.codigo).toBe(codigo);
    expect(avaliarLeituraScanAtendimento(payload, hash).encontrado).toBe(true);
  });
});

describe('mensagemBloqueioBaixaPorCodigo', () => {
  it('null quando ha saldo e pendencia', () => {
    expect(
      mensagemBloqueioBaixaPorCodigo({
        codigo: 'TB-01',
        saldoEstoque: 10,
        temPendenciaPlanejamento: true,
      }),
    ).toBeNull();
  });

  it('explica sem saldo', () => {
    const m = mensagemBloqueioBaixaPorCodigo({
      codigo: 'TB-01',
      saldoEstoque: 0,
      temPendenciaPlanejamento: true,
    });
    expect(m?.titulo).toBe('Sem saldo');
    expect(m?.corpo).toMatch(/sem saldo em estoque/i);
    expect(m?.corpo).toMatch(/Não é possível efetuar atendimento/i);
  });

  it('explica sem pendencia no planejamento', () => {
    const m = mensagemBloqueioBaixaPorCodigo({
      codigo: 'TB-01',
      saldoEstoque: 5,
      temPendenciaPlanejamento: false,
    });
    expect(m?.titulo).toBe('Sem pendência no planejamento');
    expect(m?.corpo).toMatch(/não tem quantidade por atender/i);
  });

  it('combina sem saldo e sem pendencia', () => {
    const m = mensagemBloqueioBaixaPorCodigo({
      codigo: 'X',
      saldoEstoque: 0,
      temPendenciaPlanejamento: false,
    });
    expect(m?.titulo).toBe('Não pode dar baixa');
    expect(m?.corpo).toMatch(/sem saldo/i);
    expect(m?.corpo).toMatch(/sem quantidade pendente/i);
  });
});

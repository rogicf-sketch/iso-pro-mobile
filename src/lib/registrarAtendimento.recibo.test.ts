import { describe, expect, it } from 'vitest';
import {
  linhasReciboSessaoComFallbackHistorico,
  montarTextoReciboSessaoUnificada,
  type LinhaSessaoAtendimento,
} from './registrarAtendimento';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

describe('linhasReciboSessaoComFallbackHistorico', () => {
  it('completa itens a partir do historico quando a sessao em memoria perdeu linhas', () => {
    const payload = {
      atendimentoHistorico: [
        {
          id: 1,
          loteId: 100,
          loteNumero: 'ATD-20260705-00076',
          codigo: 'M1',
          quantidade: 1,
          unidade: 'PÇ',
          descricao: 'Item 1',
          documento: 'AD-3"-UT-116',
        },
        {
          id: 2,
          loteId: 100,
          loteNumero: 'ATD-20260705-00076',
          codigo: 'M2',
          quantidade: 1,
          unidade: 'PÇ',
          descricao: 'Item 2',
          documento: 'AD-3"-UT-116',
        },
      ],
    } as IsoSnapshotPayload;
    const sessao: LinhaSessaoAtendimento[] = [
      {
        tipo: 'codigo_barras',
        loteNumero: 'ATD-20260705-00076',
        material: { codigo: 'M1', descricao: 'Item 1', unidade: 'PÇ' },
        atendidoTotal: 1,
      },
    ];
    const linhas = linhasReciboSessaoComFallbackHistorico(payload, sessao, {
      loteId: 100,
      loteNumero: 'ATD-20260705-00076',
    });
    expect(linhas).toHaveLength(2);
  });
});

describe('montarTextoReciboSessaoUnificada (WhatsApp)', () => {
  it('separa blocos por desenho no mesmo protocolo (codigo de barras)', () => {
    const linhas: LinhaSessaoAtendimento[] = [
      {
        tipo: 'codigo_barras',
        loteNumero: 'ATD-20260705-00073',
        material: { codigo: 'M1', descricao: 'Mat A', unidade: 'PÇ' },
        atendidoTotal: 1,
        documentoPlanejamento: {
          numero: 'DOC-A',
          revisao: 'A',
          descricao: 'Desenho A',
        },
      },
      {
        tipo: 'codigo_barras',
        loteNumero: 'ATD-20260705-00073',
        material: { codigo: 'M2', descricao: 'Mat B', unidade: 'PÇ' },
        atendidoTotal: 1,
        documentoPlanejamento: {
          numero: 'DOC-B',
          revisao: 'A',
          descricao: 'Desenho B',
        },
      },
    ];
    const txt = montarTextoReciboSessaoUnificada(linhas, 'Op', 'Rec', '1');
    expect(txt).toContain('*DOC-A Rev. A*');
    expect(txt).toContain('*DOC-B Rev. A*');
  });

  it('usa blocos legíveis sem tabela ASCII', () => {
    const linhas: LinhaSessaoAtendimento[] = [
      {
        tipo: 'documento',
        loteNumero: 'ATD-20260705-00073',
        docNumero: 'AQ-6"-PT-050-SS1-IQ-PT',
        docRevisao: 'A',
        docDesc: 'Desenho teste',
        itens: [
          {
            codigo: 'PT-UT1-TC-TCP01-TIT170',
            qtd: 1,
            unidade: 'PÇ',
            descricao: 'TRANSMISSOR DE TEMPERATURA',
          },
        ],
      },
      {
        tipo: 'documento',
        loteNumero: 'ATD-20260705-00073',
        docNumero: 'FBL-16"-PT-177-SS8-IQ-PT',
        docRevisao: 'A',
        docDesc: '',
        itens: [
          {
            codigo: 'PT-AP1-BB-BBC02-PIT011',
            qtd: 1,
            unidade: 'PÇ',
            descricao: 'TRANSMISSOR DE PRESSÃO COM SELO',
          },
        ],
      },
    ];

    const txt = montarTextoReciboSessaoUnificada(
      linhas,
      'Administrador',
      'Yougou Lardes de Oliveira',
      'admin',
      {
        configuracoesSistema: {
          cliente: 'I.S.O PRO GESTAO DE MATERIAIS',
          projeto: 'GESTAO DE MATERIAIS',
        },
        identificacaoAssinaturas: {
          recebedorMatricula: '12911201',
          recebedorFuncao: 'Ajudante Geral',
        },
      },
    );

    expect(txt).toContain('*I.S.O PRO — Recibo de retirada de material*');
    expect(txt).toContain('*Protocolo:* ATD-20260705-00073');
    expect(txt).toContain('*Documentos no protocolo (2):*');
    expect(txt).toContain('1. AQ-6"-PT-050-SS1-IQ-PT');
    expect(txt).toContain('*AQ-6"-PT-050-SS1-IQ-PT Rev. A*');
    expect(txt).toContain('*1.* PT-UT1-TC-TCP01-TIT170 · *1 PÇ*');
    expect(txt).toContain('TRANSMISSOR DE TEMPERATURA');
    expect(txt).not.toContain('#  | UN | Qtd');
    expect(txt).not.toContain('▸ Documento');
    expect(txt).toContain('*Total:* 2 unidades');
  });
});

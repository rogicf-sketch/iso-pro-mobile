import { describe, expect, it } from 'vitest';
import { montarHtmlReciboSessaoUnificada } from './registrarAtendimento';

describe('montarHtmlReciboSessaoUnificada / layout PC', () => {
  it('usa classes e estrutura do recibo desktop', () => {
    const html = montarHtmlReciboSessaoUnificada(
      [
        {
          tipo: 'codigo_barras',
          loteNumero: 'ATD-20260609-00040',
          material: { id: 1, codigo: 'M1', descricao: 'Parafuso', unidade: 'PC' },
          atendidoTotal: 2,
          documentoPlanejamento: {
            numero: 'DOC-1',
            revisao: 'A',
            descricao: 'Obra teste',
            responsavel: 'Igor',
          },
        },
      ],
      'Administrador',
      'Joao Silva',
      'admin',
      {
        identificacaoAssinaturas: {
          atendenteFuncao: 'Administrador',
          recebedorMatricula: '123',
          recebedorFuncao: 'Mecanico',
        },
      },
    );

    expect(html).toContain('recibo-header-main--titulo-centro');
    expect(html).toContain('Recibo de retirada de material');
    expect(html).not.toContain('app móvel');
    expect(html).not.toContain('class="hdr"');
    expect(html).toContain('recibo-tabela-itens');
    expect(html).toContain('recibo-tipo-badge');
    expect(html).toContain('espaco-assinatura');
    expect(html).toContain('recibo-fechamento');
    expect(html).toMatch(/linha-ass[\s\S]*ass-nome-principal/);
    expect(html).toContain('CNPJ: 66.234.531/0001-57');
    expect(html).toContain('class="inst-logo-img"');
    expect(html).toContain('data:image/svg+xml;base64,');
  });

  it('recibo multi-doc com 4 desenhos exibe aviso e coluna Documento', () => {
    const linhas = (['DES-A', 'DES-B', 'DES-C', 'DES-D'] as const).map((doc, i) => ({
      tipo: 'codigo_barras' as const,
      loteNumero: 'ATD-SIM-4DOC',
      material: { id: i + 1, codigo: `M-${doc}`, descricao: `Mat ${doc}`, unidade: 'PC' },
      atendidoTotal: i + 1,
      documentoPlanejamento: {
        numero: doc,
        revisao: '1',
        descricao: `Obra ${doc}`,
        responsavel: `Resp ${doc}`,
      },
    }));

    const html = montarHtmlReciboSessaoUnificada(linhas, 'Operador', 'Recebedor', 'OP1');

    expect(html).toContain('recibo-aviso-multi-doc');
    expect(html).toContain('Varios desenhos neste protocolo');
    expect(html).toContain('DES-A');
    expect(html).toContain('DES-B');
    expect(html).toContain('DES-C');
    expect(html).toContain('DES-D');
    expect(html).toContain('col-doc');
  });
});

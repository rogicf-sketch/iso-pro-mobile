import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';
import { aplicarAtendimentoLote, gerarNumeroAtendimento } from './registrarAtendimento';

/** Snapshot mínimo: recebimento direto + uma linha de planejamento pendente (saldo operacional > 0). */
function payloadAtendimentoMinimo(sequenciaInicial = 0): IsoSnapshotPayload {
  return {
    recebimentos: [
      {
        id: 'rec-test-1',
        modoRecebimento: 'direto',
        itens: [{ codigo: 'M1', quantidade: 500 }],
      },
    ],
    documentos: [
      {
        id: 'doc-test-1',
        numero: 'PL-1',
        revisao: 'A',
        itens: [
          {
            id: 'item-test-0',
            codigo: 'M1',
            descricao: 'Material teste',
            quantidade: 100,
            quantidadeAtendida: 0,
            unidade: 'UN',
          },
        ],
      },
    ],
    materiais: [{ id: 'mat-test-1', codigo: 'M1', descricao: 'Material teste', unidade: 'UN' }],
    configuracoesSistema: { sequenciaAtendimento: sequenciaInicial },
    atendimentoHistorico: [],
    atendimentoLotes: [],
  };
}

describe('gerarNumeroAtendimento', () => {
  it('incrementa sequencia e gera prefixo ATD com sufixo de 5 digitos', () => {
    const cfg: Record<string, unknown> = { sequenciaAtendimento: 10 };
    const n = gerarNumeroAtendimento(cfg);
    expect(n).toMatch(/^ATD-\d{8}-00011$/);
    expect(cfg.sequenciaAtendimento).toBe(11);
  });
});

describe('aplicarAtendimentoLote', () => {
  it('persiste identificacao complementar nas linhas de historico e no lote', () => {
    const p = payloadAtendimentoMinimo(5);
    const res = aplicarAtendimentoLote(
      p,
      'doc-test-1',
      { 0: 3 },
      'Operador Teste',
      'Recebedor Teste',
      'MAT-OP',
      null,
      {
        atendenteFuncao: 'Supervisor',
        recebedorMatricula: '25800',
        recebedorFuncao: 'Mecânico',
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const hist = res.payload.atendimentoHistorico ?? [];
    expect(hist.length).toBeGreaterThanOrEqual(1);
    const linha = hist[hist.length - 1]!;
    expect(linha.matricula).toBe('MAT-OP');
    expect(linha.atendenteFuncao).toBe('Supervisor');
    expect(linha.recebedorMatricula).toBe('25800');
    expect(linha.recebedorFuncao).toBe('Mecânico');
    expect(linha.atendente).toBe('Operador Teste');
    expect(linha.recebedor).toBe('Recebedor Teste');
    expect(linha.origem).toBe('mobile');

    const lotes = res.payload.atendimentoLotes ?? [];
    expect(lotes).toHaveLength(1);
    const lote = lotes[0]!;
    expect(lote.atendenteFuncao).toBe('Supervisor');
    expect(lote.recebedorMatricula).toBe('25800');
    expect(lote.recebedorFuncao).toBe('Mecânico');
  });

  it('atualiza quantidadeAtendida no documento', () => {
    const p = payloadAtendimentoMinimo(0);
    const res = aplicarAtendimentoLote(p, 'doc-test-1', { 0: 4 }, 'A', 'B', '-', null, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const doc = (res.payload.documentos ?? []).find((d) => String(d.id) === 'doc-test-1');
    const it0 = doc?.itens?.[0] as { quantidadeAtendida?: number } | undefined;
    expect(it0?.quantidadeAtendida).toBe(4);
  });
});

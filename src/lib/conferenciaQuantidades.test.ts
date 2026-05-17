import { describe, expect, it } from 'vitest';
import type { RecebimentoItem } from 'iso-pro-shared';
import {
  analisarDivergenciasAposFinalizar,
  linhaComDivergenciaVisual,
  mensagemResumoDivergencias,
  parseQuantidadeNf,
  quantidadeConferidaEfetivaAposFinalizar,
} from './conferenciaQuantidades';

function item(partial: Partial<RecebimentoItem> = {}): RecebimentoItem {
  return {
    codigo: 'COD',
    quantidade: 10,
    quantidadeConferida: 10,
    ...partial,
  } as RecebimentoItem;
}

describe('parseQuantidadeNf', () => {
  it('aceita numero e string com virgula', () => {
    expect(parseQuantidadeNf(12)).toBe(12);
    expect(parseQuantidadeNf('8,5')).toBe(8.5);
    expect(parseQuantidadeNf('')).toBe(0);
  });
});

describe('linhaComDivergenciaVisual', () => {
  it('destaca parcial e ignora campo vazio', () => {
    expect(linhaComDivergenciaVisual(item({ quantidade: 10, quantidadeConferida: 4 }))).toBe(true);
    expect(linhaComDivergenciaVisual(item({ quantidade: 10, quantidadeConferida: '' }))).toBe(false);
    expect(linhaComDivergenciaVisual(item({ quantidade: 10, quantidadeConferida: 10 }))).toBe(false);
  });
});

describe('analisarDivergenciasAposFinalizar', () => {
  it('classifica nao recebido e parcial', () => {
    const r = analisarDivergenciasAposFinalizar({
      itens: [
        item({ codigo: 'NR', quantidade: 5, quantidadeConferida: 0 }),
        item({ codigo: 'P1', quantidade: 10, quantidadeConferida: 3 }),
        item({ codigo: 'OK', quantidade: 2, quantidadeConferida: 2 }),
      ],
    });
    expect(r.tem).toBe(true);
    expect(r.naoRecebidos).toBe(1);
    expect(r.parciais).toBe(1);
    expect(r.total).toBe(2);
  });

  it('campo vazio conta como NF na finalizacao', () => {
    const { qRec, qc } = quantidadeConferidaEfetivaAposFinalizar(item({ quantidade: 7, quantidadeConferida: '' }));
    expect(qRec).toBe(7);
    expect(qc).toBe(7);
    expect(analisarDivergenciasAposFinalizar({ itens: [item({ quantidade: 7, quantidadeConferida: '' })] }).tem).toBe(false);
  });
});

describe('mensagemResumoDivergencias', () => {
  it('inclui codigos na mensagem', () => {
    const msg = mensagemResumoDivergencias(
      analisarDivergenciasAposFinalizar({
        itens: [item({ codigo: 'ABC', quantidade: 1, quantidadeConferida: 0 })],
      }),
    );
    expect(msg).toMatch(/ABC/);
    expect(msg).toMatch(/não recebido/i);
  });
});

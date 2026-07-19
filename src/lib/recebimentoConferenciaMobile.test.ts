import { describe, expect, it } from 'vitest';
import type { Recebimento } from 'iso-pro-shared';
import {
  linhaEstadoConferenciaMobile,
  listarRecebimentosPendentesConferencia,
  recebimentoEmConferenciaAberta,
  recebimentoPermiteEditarConferencia,
  recebimentoTemConferenciaParcialGravada,
} from './recebimentoConferenciaMobile';

function recBase(partial: Partial<Recebimento> = {}): Recebimento {
  return {
    id: 'r1',
    modoRecebimento: 'aguardando_conferencia',
    statusConferencia: 'pendente',
    itens: [{ codigo: 'A1', quantidade: 10 }],
    ...partial,
  } as Recebimento;
}

describe('listarRecebimentosPendentesConferencia', () => {
  it('filtra só aguardando conferencia nao finalizados e prioriza em correcao', () => {
    const lista = listarRecebimentosPendentesConferencia([
      recBase({ id: 'r1', nota: '100', data: '2026-06-01' }),
      recBase({ id: 'r2', nota: '200', data: '2026-06-02', modoRecebimento: 'direto' }),
      recBase({ id: 'r3', nota: '300', data: '2026-06-03', statusConferencia: 'conferido' }),
      recBase({
        id: 'r4',
        nota: '400',
        data: '2026-06-04',
        itens: [{ codigo: 'X', quantidade: 10, quantidadeConferida: 8 }],
      }),
      recBase({ id: 'r5', nota: '500', data: '2026-06-05' }),
    ]);

    expect(lista.map((r) => String(r.id))).toEqual(['r4', 'r1', 'r5']);
  });
});

describe('recebimentoPermiteEditarConferencia', () => {
  it('permite editar quando pendente e aguardando conferencia', () => {
    expect(recebimentoPermiteEditarConferencia(recBase())).toBe(true);
    expect(recebimentoEmConferenciaAberta(recBase())).toBe(true);
  });

  it('bloqueia quando ja conferido', () => {
    expect(recebimentoPermiteEditarConferencia(recBase({ statusConferencia: 'conferido' }))).toBe(false);
  });

  it('bloqueia modo direto', () => {
    expect(recebimentoPermiteEditarConferencia(recBase({ modoRecebimento: 'direto' }))).toBe(false);
  });
});

describe('recebimentoTemConferenciaParcialGravada', () => {
  it('detecta quantidades ou observacoes preenchidas (cenario destravar PC)', () => {
    expect(
      recebimentoTemConferenciaParcialGravada(
        recBase({
          statusConferencia: 'pendente',
          itens: [
            { codigo: 'A', quantidade: 5, quantidadeConferida: 3 },
            { codigo: 'B', quantidade: 2, quantidadeConferida: 0, observacaoItem: 'Não veio' },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('false quando linhas vazias', () => {
    expect(
      recebimentoTemConferenciaParcialGravada(
        recBase({
          itens: [{ codigo: 'A', quantidade: 5, quantidadeConferida: undefined }],
        }),
      ),
    ).toBe(false);
  });
});

describe('linhaEstadoConferenciaMobile', () => {
  it('mostra concluida quando status conferido', () => {
    expect(
      linhaEstadoConferenciaMobile(recBase({ statusConferencia: 'conferido', dataConferencia: '2026-05-16' })),
    ).toBe('Conferência concluída');
  });

  it('mostra em correcao quando pendente com dados de conferencia', () => {
    expect(
      linhaEstadoConferenciaMobile(
        recBase({
          statusConferencia: 'pendente',
          itens: [{ codigo: 'X', quantidade: 10, quantidadeConferida: 8 }],
        }),
      ),
    ).toBe('Conferência em correção');
  });

  it('mostra aguardando quando pendente sem dados', () => {
    expect(linhaEstadoConferenciaMobile(recBase())).toBe('Aguardando conferência');
  });
});

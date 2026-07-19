import { describe, expect, it } from 'vitest';
import {
  statusConferenciaFromEscalaStatus,
  wireRecebimentoDetalheEscala,
  wireRecebimentoListaEscala,
} from './recebimentoEscalaWire';

describe('recebimentoEscalaWire', () => {
  it('mapeia status de escala para statusConferencia mobile', () => {
    expect(statusConferenciaFromEscalaStatus('conferido')).toBe('conferido');
    expect(statusConferenciaFromEscalaStatus('aguardando_conferencia')).toBe('pendente');
    expect(statusConferenciaFromEscalaStatus('parcialmente_conferido')).toBe('pendente');
  });

  it('wire lista com campos mobile', () => {
    const r = wireRecebimentoListaEscala({
      id: 'r1',
      notaFiscal: 'NF-9',
      fornecedor: 'Forn',
      modoRecebimento: 'aguardando_conferencia',
      status: 'aguardando_conferencia',
    });
    expect(r.nota).toBe('NF-9');
    expect(r.fornecedorNome).toBe('Forn');
    expect(r.statusConferencia).toBe('pendente');
  });

  it('wire detalhe normaliza itens codigo/quantidade', () => {
    const r = wireRecebimentoDetalheEscala({
      id: 'r2',
      notaFiscal: 'NF-2',
      status: 'conferido',
      modoRecebimento: 'aguardando_conferencia',
      itens: [{ codigoMaterial: 'M1', quantidadeRecebida: 3, quantidadeConferida: 2 }],
    });
    expect(r.statusConferencia).toBe('conferido');
    expect(r.itens?.[0]?.codigo).toBe('M1');
    expect(r.itens?.[0]?.quantidade).toBe(3);
    expect(r.itens?.[0]?.quantidadeConferida).toBe(2);
  });
});

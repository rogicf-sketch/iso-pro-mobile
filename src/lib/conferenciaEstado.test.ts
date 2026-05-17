import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload, Recebimento } from 'iso-pro-shared';
import { conferenciaLocalDifereDoSnapshot } from './conferenciaEstado';

function payloadComRec(rec: Recebimento): IsoSnapshotPayload {
  return { recebimentos: [rec] } as IsoSnapshotPayload;
}

describe('conferenciaLocalDifereDoSnapshot', () => {
  it('false quando conferido no servidor', () => {
    const server = {
      id: '1',
      modoRecebimento: 'aguardando_conferencia',
      statusConferencia: 'conferido',
      itens: [{ codigo: 'A', quantidade: 5, quantidadeConferida: 5 }],
    } as Recebimento;
    const local = { ...server, itens: [{ codigo: 'A', quantidade: 5, quantidadeConferida: 3 }] };
    expect(conferenciaLocalDifereDoSnapshot(local, payloadComRec(server))).toBe(false);
  });

  it('true quando quantidade local difere em pendente', () => {
    const server = {
      id: '1',
      modoRecebimento: 'aguardando_conferencia',
      statusConferencia: 'pendente',
      itens: [{ codigo: 'A', quantidade: 5, quantidadeConferida: 5 }],
    } as Recebimento;
    const local = {
      ...server,
      itens: [{ codigo: 'A', quantidade: 5, quantidadeConferida: 3, observacaoItem: 'Parcial' }],
    };
    expect(conferenciaLocalDifereDoSnapshot(local, payloadComRec(server))).toBe(true);
  });

  it('false apos destravar PC quando local alinhado ao snapshot (pendente com mesmas qty)', () => {
    const server = {
      id: '1',
      modoRecebimento: 'aguardando_conferencia',
      statusConferencia: 'pendente',
      itens: [
        { codigo: 'A', quantidade: 10, quantidadeConferida: 10 },
        { codigo: 'B', quantidade: 4, quantidadeConferida: 0, observacaoItem: 'Falta' },
      ],
    } as Recebimento;
    const local = structuredClone(server);
    expect(conferenciaLocalDifereDoSnapshot(local, payloadComRec(server))).toBe(false);
  });
});

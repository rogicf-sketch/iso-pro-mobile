import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload, Recebimento } from 'iso-pro-shared';
import { mergeRecebimentoConferido } from './conferenciaMerge';

function payloadCom(rec: Recebimento): IsoSnapshotPayload {
  return { recebimentos: [rec] } as IsoSnapshotPayload;
}

describe('mergeRecebimentoConferido', () => {
  it('casa quantidade conferida por codigo mesmo quando o servidor reordena as linhas', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [
        { codigo: 'A1', quantidade: 10, quantidadeConferida: 7 },
        { codigo: 'B2', quantidade: 5, quantidadeConferida: 5 },
      ],
    };
    // Servidor devolve as linhas na ordem inversa.
    const server = payloadCom({
      id: 'r1',
      itens: [
        { codigo: 'B2', quantidade: 5 },
        { codigo: 'A1', quantidade: 10 },
      ],
    });

    const merged = mergeRecebimentoConferido(draft, server);
    const a1 = merged.itens?.find((i) => i.codigo === 'A1');
    const b2 = merged.itens?.find((i) => i.codigo === 'B2');
    expect(a1?.quantidadeConferida).toBe(7);
    expect(b2?.quantidadeConferida).toBe(5);
  });

  it('nao propaga conferencia para o codigo errado quando o servidor insere uma linha nova no topo', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [{ codigo: 'A1', quantidade: 10, quantidadeConferida: 9 }],
    };
    const server = payloadCom({
      id: 'r1',
      itens: [
        { codigo: 'Z9', quantidade: 3 }, // nova linha no topo
        { codigo: 'A1', quantidade: 10 },
      ],
    });

    const merged = mergeRecebimentoConferido(draft, server);
    const z9 = merged.itens?.find((i) => i.codigo === 'Z9');
    const a1 = merged.itens?.find((i) => i.codigo === 'A1');
    expect(z9?.quantidadeConferida).toBeUndefined();
    expect(a1?.quantidadeConferida).toBe(9);
  });

  it('respeita a ordem quando ha o mesmo codigo em varias linhas', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [
        { codigo: 'A1', quantidade: 4, quantidadeConferida: 4 },
        { codigo: 'A1', quantidade: 6, quantidadeConferida: 2 },
      ],
    };
    const server = payloadCom({
      id: 'r1',
      itens: [
        { codigo: 'A1', quantidade: 4 },
        { codigo: 'A1', quantidade: 6 },
      ],
    });

    const merged = mergeRecebimentoConferido(draft, server);
    expect(merged.itens?.[0]?.quantidadeConferida).toBe(4);
    expect(merged.itens?.[1]?.quantidadeConferida).toBe(2);
  });

  it('preserva observacao e localizacao editadas por linha', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [{ codigo: 'A1', quantidade: 10, quantidadeConferida: 8, observacaoItem: ' avaria ', localizacao: 'RUA-01' }],
    };
    const server = payloadCom({ id: 'r1', itens: [{ codigo: 'A1', quantidade: 10 }] });

    const merged = mergeRecebimentoConferido(draft, server);
    expect(merged.itens?.[0]?.observacaoItem).toBe('avaria');
    expect(merged.itens?.[0]?.localizacao).toBe('RUA-01');
  });

  it('remove observacao/localizacao vazias em vez de gravar string vazia', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [{ codigo: 'A1', quantidade: 10, quantidadeConferida: 8, observacaoItem: '   ', localizacao: '' }],
    };
    const server = payloadCom({
      id: 'r1',
      itens: [{ codigo: 'A1', quantidade: 10, observacaoItem: 'antiga', localizacao: 'ANTIGA' }],
    });

    const merged = mergeRecebimentoConferido(draft, server);
    expect(merged.itens?.[0]?.observacaoItem).toBeUndefined();
    expect(merged.itens?.[0]?.localizacao).toBeUndefined();
  });

  it('devolve clone do rascunho quando o recebimento nao existe no servidor', () => {
    const draft: Recebimento = { id: 'r1', itens: [{ codigo: 'A1', quantidadeConferida: 5 }] };
    const merged = mergeRecebimentoConferido(draft, { recebimentos: [] } as IsoSnapshotPayload);
    expect(merged.itens?.[0]?.quantidadeConferida).toBe(5);
    expect(merged).not.toBe(draft);
  });

  it('casa linhas sem codigo por posicao (fallback)', () => {
    const draft: Recebimento = {
      id: 'r1',
      itens: [
        { descricao: 'sem codigo 1', quantidadeConferida: 1 },
        { descricao: 'sem codigo 2', quantidadeConferida: 2 },
      ],
    };
    const server = payloadCom({
      id: 'r1',
      itens: [{ descricao: 'sem codigo 1' }, { descricao: 'sem codigo 2' }],
    });

    const merged = mergeRecebimentoConferido(draft, server);
    expect(merged.itens?.[0]?.quantidadeConferida).toBe(1);
    expect(merged.itens?.[1]?.quantidadeConferida).toBe(2);
  });
});

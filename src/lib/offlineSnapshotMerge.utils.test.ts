import { describe, expect, it } from 'vitest';
import { mergeSnapshotForOfflineReplay } from './offlineSnapshotMerge.utils';

describe('mergeSnapshotForOfflineReplay', () => {
  it('anexa linhas novas do historico offline', () => {
    const fresh = {
      dataAtualizacao: 'a',
      atendimentoHistorico: [{ id: 1, loteNumero: 'L1', codigo: 'M1', quantidade: 1 }],
    };
    const queued = {
      dataAtualizacao: 'b',
      atendimentoHistorico: [
        { id: 1, loteNumero: 'L1', codigo: 'M1', quantidade: 1 },
        { id: 2, loteNumero: 'L2', codigo: 'M2', quantidade: 3 },
      ],
    };

    const merged = mergeSnapshotForOfflineReplay(fresh, queued);
    expect(merged.atendimentoHistorico).toHaveLength(2);
    expect(merged.atendimentoHistorico?.[1]).toMatchObject({ id: 2, codigo: 'M2' });
  });

  it('aplica quantidadeAtendida maior do documento offline', () => {
    const fresh = {
      documentos: [{ id: 'd1', itens: [{ id: 'i1', quantidadeAtendida: 5 }] }],
    };
    const queued = {
      documentos: [{ id: 'd1', itens: [{ id: 'i1', quantidadeAtendida: 12 }] }],
    };

    const merged = mergeSnapshotForOfflineReplay(fresh, queued);
    expect(merged.documentos?.[0]?.itens?.[0]?.quantidadeAtendida).toBe(12);
  });

  it('substitui inventarios offline por id', () => {
    const fresh = {
      inventarios: [
        { id: 'inv-1', status: 'aberto' as const, itens: [{ id: 'li-1', quantidadeContada: 1 }] },
        { id: 'inv-2', status: 'aberto' as const, itens: [{ id: 'li-2', quantidadeContada: 2 }] },
      ],
    };
    const queued = {
      inventarios: [{ id: 'inv-1', status: 'aberto' as const, itens: [{ id: 'li-1', quantidadeContada: 9 }] }],
    };
    const merged = mergeSnapshotForOfflineReplay(fresh, queued);
    expect(merged.inventarios).toHaveLength(2);
    expect(merged.inventarios?.[0]?.itens?.[0]?.quantidadeContada).toBe(9);
    expect(merged.inventarios?.[1]?.id).toBe('inv-2');
  });

  it('nao sobrescreve saldoAtual da nuvem quando offline diverge', () => {
    const fresh = {
      materiais: [{ codigo: 'M1', saldoAtual: 100 }],
    };
    const queued = {
      materiais: [{ codigo: 'M1', saldoAtual: 40 }],
    };
    const merged = mergeSnapshotForOfflineReplay(fresh, queued);
    expect(merged.materiais?.[0]?.saldoAtual).toBe(100);
  });

  it('aplica saldoAtual offline so se a nuvem nao tiver saldo', () => {
    const fresh = {
      materiais: [{ codigo: 'M1', saldoAtual: null }],
    };
    const queued = {
      materiais: [{ codigo: 'M1', saldoAtual: 40 }],
    };
    const merged = mergeSnapshotForOfflineReplay(fresh, queued);
    expect(merged.materiais?.[0]?.saldoAtual).toBe(40);
  });
});

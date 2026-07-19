import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';

import { mergeAtendimentoPayloadPreservandoLocal } from './mergeAtendimentoPayloadLocal';

describe('mergeAtendimentoPayloadPreservandoLocal', () => {
  it('mantem desenhos lazy-loaded que ainda nao vieram na fatia da nuvem', () => {
    const nuvem: IsoSnapshotPayload = {
      recebimentos: [{ id: 1 }],
      colaboradores: [{ id: 'c1', nome: 'A' }],
    };
    const local: IsoSnapshotPayload = {
      documentos: [
        {
          id: 'doc-fe',
          numero: 'FE-UT1-TQ-TQC04-FE',
          itens: [{ id: 'i1', codigo: 'LIT560', quantidade: 1, quantidadeAtendida: 1 }],
        },
      ],
      atendimentoHistorico: [{ id: 99, loteNumero: 'ATD-1', codigo: 'LIT560', quantidade: 1 }],
    };

    const merged = mergeAtendimentoPayloadPreservandoLocal(nuvem, local);
    expect(merged.documentos).toHaveLength(1);
    expect(merged.documentos?.[0]?.numero).toBe('FE-UT1-TQ-TQC04-FE');
    expect(merged.atendimentoHistorico).toHaveLength(1);
  });

  it('preserva quantidade atendida local maior que a da nuvem', () => {
    const nuvem: IsoSnapshotPayload = {
      documentos: [
        {
          id: 'doc-fe',
          itens: [{ id: 'i1', codigo: 'LIT560', quantidade: 1, quantidadeAtendida: 0 }],
        },
      ],
    };
    const local: IsoSnapshotPayload = {
      documentos: [
        {
          id: 'doc-fe',
          itens: [{ id: 'i1', codigo: 'LIT560', quantidade: 1, quantidadeAtendida: 1 }],
        },
      ],
    };

    const merged = mergeAtendimentoPayloadPreservandoLocal(nuvem, local);
    const item = merged.documentos?.[0]?.itens?.[0] as { quantidadeAtendida?: number };
    expect(item.quantidadeAtendida).toBe(1);
  });
});

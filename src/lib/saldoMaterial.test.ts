import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload, Recebimento } from 'iso-pro-shared';
import { buildSaldoOperacionalParaAtendimento, codigoMaterialKey, getSaldoCodigo } from './saldoMaterial';

describe('codigoMaterialKey', () => {
  it('normaliza para maiúsculas e trim', () => {
    expect(codigoMaterialKey('  ab-12  ')).toBe('AB-12');
  });
});

describe('buildSaldoOperacionalParaAtendimento', () => {
  it('soma recebimento direto e subtrai quantidade atendida no documento', () => {
    const payload: IsoSnapshotPayload = {
      recebimentos: [
        {
          id: 'r1',
          modoRecebimento: 'direto',
          statusConferencia: null,
          itens: [{ codigo: 'M1', quantidade: 100 }],
        },
      ],
      documentos: [
        {
          id: 'd1',
          numero: 'PL-1',
          revisao: 'A',
          itens: [{ id: 'i1', codigo: 'M1', descricao: 'X', quantidade: 50, quantidadeAtendida: 30, unidade: 'UN' }],
        },
      ],
      materiais: [{ id: 'm1', codigo: 'M1', descricao: 'X', unidade: 'UN' }],
    };
    const map = buildSaldoOperacionalParaAtendimento(payload);
    expect(map.get('M1')).toBe(70);
    expect(getSaldoCodigo(payload, 'm1')).toBe(70);
  });

  it('ignora recebimento cancelado', () => {
    const payload: IsoSnapshotPayload = {
      recebimentos: [
        {
          id: 'r1',
          modoRecebimento: 'direto',
          status: 'cancelado',
          itens: [{ codigo: 'M1', quantidade: 999 }],
        } as Recebimento,
      ],
      documentos: [],
      materiais: [],
    };
    const map = buildSaldoOperacionalParaAtendimento(payload);
    expect(map.get('M1') ?? 0).toBe(0);
  });

  it('em modo não direto só conta quantidade conferida quando status é conferido', () => {
    const base = {
      id: 'r1',
      modoRecebimento: 'aguardando_conferencia' as const,
      itens: [{ codigo: 'M1', quantidade: 10, quantidadeConferida: 8 }],
    };
    const sem: IsoSnapshotPayload = {
      recebimentos: [{ ...base, statusConferencia: 'pendente' }],
      documentos: [],
      materiais: [],
    };
    const com: IsoSnapshotPayload = {
      recebimentos: [{ ...base, statusConferencia: 'conferido' }],
      documentos: [],
      materiais: [],
    };
    expect(buildSaldoOperacionalParaAtendimento(sem).get('M1') ?? 0).toBe(0);
    expect(buildSaldoOperacionalParaAtendimento(com).get('M1')).toBe(8);
  });

  it('aplica estoqueAjustes e não devolve saldo negativo', () => {
    const payload: IsoSnapshotPayload = {
      recebimentos: [
        { id: 'r1', modoRecebimento: 'direto', itens: [{ codigo: 'M1', quantidade: 5 }] },
      ],
      documentos: [
        {
          id: 'd1',
          numero: 'PL-1',
          revisao: 'A',
          itens: [{ id: 'i1', codigo: 'M1', descricao: 'X', quantidade: 50, quantidadeAtendida: 20, unidade: 'UN' }],
        },
      ],
      estoqueAjustes: [{ codigo: 'M1', delta: -10 }],
      materiais: [],
    };
    expect(buildSaldoOperacionalParaAtendimento(payload).get('M1')).toBe(0);
  });
});

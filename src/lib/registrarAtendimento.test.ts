import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from 'iso-pro-shared';
import {
  aplicarAtendimentoLote,
  aplicarAtendimentoPorCodigoBarras,
  gerarNumeroAtendimento,
  listarDocumentosComDemandaPendenteMaterial,
} from './registrarAtendimento';

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
  it('usa reservaInicial quando fornecida (evita colisao com protocolo ja usado na nuvem)', () => {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const mo = String(hoje.getMonth() + 1).padStart(2, '0');
    const d = String(hoje.getDate()).padStart(2, '0');
    const stamp = `${y}${mo}${d}`;
    const numeroOcupado = `ATD-${stamp}-00073`;
    const numeroReservado = `ATD-${stamp}-00074`;

    const p = payloadAtendimentoMinimo(72);
    p.atendimentoHistorico = [
      {
        id: 1,
        loteNumero: numeroOcupado,
        loteId: 111,
        data: hoje.toISOString(),
        documentoId: 'doc-x',
        documento: 'PL-X',
        atendente: 'PC',
        recebedor: 'Outro',
        codigo: 'M1',
        descricao: 'Material teste',
        unidade: 'UN',
        quantidade: 70,
        origem: 'windows',
      },
    ];

    const res = aplicarAtendimentoLote(
      p,
      'doc-test-1',
      { 0: 1 },
      'Mobile',
      'Recebedor',
      '-',
      null,
      null,
      { loteNumero: numeroReservado, loteId: 999001 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.loteNumero).toBe(numeroReservado);
    expect(res.loteId).toBe(999001);
    expect(res.payload.atendimentoHistorico?.some((h) => h.loteNumero === numeroReservado)).toBe(true);
    expect(res.payload.atendimentoHistorico?.some((h) => h.loteNumero === numeroOcupado)).toBe(true);
  });

  it('incrementa sequencia local quando historico ja tem ATD do dia (sem reserva nuvem)', () => {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const mo = String(hoje.getMonth() + 1).padStart(2, '0');
    const d = String(hoje.getDate()).padStart(2, '0');
    const stamp = `${y}${mo}${d}`;
    const numeroOcupado = `ATD-${stamp}-00073`;

    const p = payloadAtendimentoMinimo(72);
    p.atendimentoHistorico = [
      {
        id: 1,
        loteNumero: numeroOcupado,
        data: hoje.toISOString(),
        documentoId: 'doc-x',
        documento: 'PL-X',
        atendente: 'PC',
        recebedor: 'Outro',
        codigo: 'M1',
        descricao: 'Material teste',
        unidade: 'UN',
        quantidade: 70,
        origem: 'windows',
      },
    ];

    const res = aplicarAtendimentoLote(p, 'doc-test-1', { 0: 1 }, 'Mobile', 'Recebedor', '-', null, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.loteNumero).toBe(`ATD-${stamp}-00074`);
  });

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

describe('aplicarAtendimentoPorCodigoBarras', () => {
  function payloadDoisDesenhos(): IsoSnapshotPayload {
    return {
      recebimentos: [
        {
          id: 'rec-1',
          modoRecebimento: 'direto',
          itens: [
            { codigo: 'M-BGC', quantidade: 100 },
            { codigo: 'M-OUT', quantidade: 100 },
          ],
        },
      ],
      documentos: [
        {
          id: 'doc-bgc',
          numero: 'BGC-18"-BT-044-SS1-NI',
          revisao: 'A',
          itens: [
            {
              id: 'i-bgc',
              codigo: 'M-BGC',
              descricao: 'Material BGC',
              quantidade: 10,
              quantidadeAtendida: 0,
              unidade: 'PC',
            },
          ],
        },
        {
          id: 'doc-out',
          numero: 'E.RAZN010-IE6-00002-ABOVE',
          revisao: 'C',
          itens: [
            {
              id: 'i-out',
              codigo: 'M-OUT',
              descricao: 'Material outro desenho',
              quantidade: 10,
              quantidadeAtendida: 0,
              unidade: 'PC',
            },
          ],
        },
      ],
      materiais: [
        { id: 'm1', codigo: 'M-BGC', descricao: 'Material BGC', unidade: 'PC' },
        { id: 'm2', codigo: 'M-OUT', descricao: 'Material outro desenho', unidade: 'PC' },
      ],
      configuracoesSistema: { sequenciaAtendimento: 41 },
      atendimentoHistorico: [],
      atendimentoLotes: [],
    };
  }

  it('rejeita baixa sem documento de referencia quando exigirDocumentoReferencia', () => {
    const res = aplicarAtendimentoPorCodigoBarras(payloadDoisDesenhos(), 'M-BGC', 1, 'Op', 'Rec', '-', null, {
      exigirDocumentoReferencia: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.erro).toMatch(/documento de referência/i);
  });

  it('rejeita material sem pendencia no desenho de referencia aberto', () => {
    const res = aplicarAtendimentoPorCodigoBarras(payloadDoisDesenhos(), 'M-OUT', 1, 'Op', 'Rec', '-', null, {
      apenasDocumentoId: 'doc-bgc',
      exigirDocumentoReferencia: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.erro).toMatch(/não possui pendência no desenho de referência/i);
  });

  it('grava documento correto por linha no historico quando desenho de referencia e valido', () => {
    const res = aplicarAtendimentoPorCodigoBarras(payloadDoisDesenhos(), 'M-BGC', 2, 'Op', 'Rec', '-', null, {
      apenasDocumentoId: 'doc-bgc',
      exigirDocumentoReferencia: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hist = res.payload.atendimentoHistorico ?? [];
    expect(hist).toHaveLength(1);
    expect(hist[0]?.documento).toBe('BGC-18"-BT-044-SS1-NI');
    expect(res.documentosGravados).toEqual(['BGC-18"-BT-044-SS1-NI']);
  });
});

describe('listarDocumentosComDemandaPendenteMaterial', () => {
  it('exclui desenhos com quantidade ja totalmente atendida para o codigo', () => {
    const p = payloadAtendimentoMinimo();
    const docAtendido = {
      id: 'doc-atendido',
      numero: 'PL-2',
      revisao: 'A',
      itens: [
        {
          id: 'item-2',
          codigo: 'M1',
          descricao: 'Material teste',
          quantidade: 10,
          quantidadeAtendida: 10,
          unidade: 'UN',
        },
      ],
    };
    const docPendente = {
      id: 'doc-pendente',
      numero: 'PL-3',
      revisao: 'A',
      itens: [
        {
          id: 'item-3',
          codigo: 'M1',
          descricao: 'Material teste',
          quantidade: 10,
          quantidadeAtendida: 3,
          unidade: 'UN',
        },
      ],
    };
    const payload = {
      ...p,
      documentos: [...(p.documentos ?? []), docAtendido, docPendente],
    };
    const lista = listarDocumentosComDemandaPendenteMaterial(payload, 'M1');
    expect(lista.map((x) => String(x.documento.id))).toEqual(['doc-test-1', 'doc-pendente']);
    expect(lista.every((x) => x.restanteMaterial > 0)).toBe(true);
  });
});

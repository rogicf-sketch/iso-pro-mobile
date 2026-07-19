import type { Recebimento, RecebimentoItem } from 'iso-pro-shared';
import type { RecebimentoListaEscala } from './escalaCloud';

/** Status das tabelas de escala → statusConferencia do app Campo. */
export function statusConferenciaFromEscalaStatus(status: string | undefined | null): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'conferido') return 'conferido';
  return 'pendente';
}

export function wireRecebimentoListaEscala(r: RecebimentoListaEscala): Recebimento {
  return {
    id: r.id,
    nota: r.notaFiscal,
    romaneio: r.romaneio,
    fornecedorNome: r.fornecedor,
    data: r.dataRecebimento,
    status: r.status,
    statusConferencia: statusConferenciaFromEscalaStatus(r.status),
    modoRecebimento: r.modoRecebimento || 'aguardando_conferencia',
    conferenteNome: r.conferente,
    dataConferencia: r.dataConferencia ?? undefined,
    itens: [],
  } as Recebimento;
}

/** Normaliza o JSON da RPC `iso_pro_read_recebimento` para o modelo mobile. */
export function wireRecebimentoDetalheEscala(
  raw: Record<string, unknown>,
  fallbackId?: string,
): Recebimento {
  const itensRaw = Array.isArray(raw.itens) ? raw.itens : [];
  const itens = itensRaw.map((it) => {
    const row = (it ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      codigo: String(row.codigo ?? row.codigoMaterial ?? ''),
      descricao: String(row.descricao ?? row.descricaoMaterial ?? ''),
      unidade: String(row.unidade ?? 'UN'),
      disciplina: row.disciplina != null ? String(row.disciplina) : undefined,
      localizacao: row.localizacao != null ? String(row.localizacao) : undefined,
      quantidade: Number(row.quantidade ?? row.quantidadeRecebida ?? 0) || 0,
      quantidadeConferida:
        row.quantidadeConferida === undefined || row.quantidadeConferida === null
          ? undefined
          : Number(row.quantidadeConferida),
      pesoUnitario: row.pesoUnitario != null ? Number(row.pesoUnitario) : undefined,
      pesoTotal: row.pesoTotal != null ? Number(row.pesoTotal) : undefined,
      certificado: row.certificado != null ? String(row.certificado) : undefined,
      observacaoItem: row.observacaoItem != null ? String(row.observacaoItem) : undefined,
    } as RecebimentoItem;
  });

  const status = String(raw.status ?? '');
  return {
    id: String(raw.id ?? fallbackId ?? ''),
    nota: String(raw.nota ?? raw.notaFiscal ?? ''),
    romaneio: raw.romaneio != null ? String(raw.romaneio) : undefined,
    fornecedorNome: String(raw.fornecedorNome ?? raw.fornecedor ?? ''),
    data: String(raw.data ?? raw.dataRecebimento ?? ''),
    status,
    statusConferencia:
      raw.statusConferencia != null
        ? String(raw.statusConferencia)
        : statusConferenciaFromEscalaStatus(status),
    modoRecebimento: String(raw.modoRecebimento ?? 'aguardando_conferencia'),
    conferenteNome:
      raw.conferenteNome != null
        ? String(raw.conferenteNome)
        : raw.conferente != null
          ? String(raw.conferente)
          : undefined,
    dataConferencia: raw.dataConferencia != null ? String(raw.dataConferencia) : undefined,
    observacoes: raw.observacoes != null ? String(raw.observacoes) : undefined,
    itens,
  } as Recebimento;
}

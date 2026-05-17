import type { Recebimento } from 'iso-pro-shared';

/**
 * Só nestes recebimentos o mobile deve usar vermelho para linhas com divergência
 * (evita «pendência» falsa em recebimento direto ou já conferido).
 */
export function recebimentoEmConferenciaAberta(r: Recebimento | null): boolean {
  return recebimentoPermiteEditarConferencia(r);
}

/** Recebimento ainda editável no ecrã de conferência (pendente + modo aguardando conferência). */
export function recebimentoPermiteEditarConferencia(r: Recebimento | null): boolean {
  if (!r) return false;
  if (String(r.statusConferencia || 'pendente') === 'conferido') return false;
  if ((r.modoRecebimento || 'direto') !== 'aguardando_conferencia') return false;
  return true;
}

/** Linha com quantidade conferida explícita ou observação (ex.: após destravar no PC). */
export function recebimentoTemConferenciaParcialGravada(r: Recebimento | null): boolean {
  if (!r?.itens?.length) return false;
  return r.itens.some((it) => {
    const temObs = Boolean(String(it.observacaoItem ?? '').trim());
    if (temObs) return true;
    const qc = it.quantidadeConferida;
    if (qc === undefined || qc === null) return false;
    if (typeof qc === 'string' && qc.trim() === '') return false;
    return true;
  });
}

/**
 * Uma linha curta para listas e detalhe (substitui «modo: … · conf.: …» técnico).
 */
export function linhaEstadoConferenciaMobile(r: Recebimento): string {
  const modo = r.modoRecebimento || 'direto';
  const conf = String(r.statusConferencia || 'pendente');

  if (modo === 'aguardando_conferencia' && conf === 'conferido') {
    return 'Conferência concluída';
  }
  if (modo === 'aguardando_conferencia') {
    if (conf === 'pendente' && recebimentoTemConferenciaParcialGravada(r)) {
      return 'Conferência em correção';
    }
    return conf === 'pendente' ? 'Aguardando conferência' : `Conferência: ${conf}`;
  }
  if (modo === 'direto') {
    return 'Recebimento direto';
  }
  return `Modo: ${modo} · Conferência: ${conf}`;
}

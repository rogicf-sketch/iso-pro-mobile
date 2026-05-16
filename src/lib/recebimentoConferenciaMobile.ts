import type { Recebimento } from 'iso-pro-shared';

/**
 * Só nestes recebimentos o mobile deve usar vermelho para linhas com divergência
 * (evita «pendência» falsa em recebimento direto ou já conferido).
 */
export function recebimentoEmConferenciaAberta(r: Recebimento | null): boolean {
  if (!r) return false;
  if (String(r.statusConferencia || 'pendente') === 'conferido') return false;
  if ((r.modoRecebimento || 'direto') !== 'aguardando_conferencia') return false;
  return true;
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
    return conf === 'pendente' ? 'Aguardando conferência' : `Conferência: ${conf}`;
  }
  if (modo === 'direto') {
    return 'Recebimento direto';
  }
  return `Modo: ${modo} · Conferência: ${conf}`;
}

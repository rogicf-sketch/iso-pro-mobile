import type { RecebimentoItem } from 'iso-pro-shared';

/** Alinhado ao campo texto do desktop (endereço / posição de estoque). */
export const MAX_LOCALIZACAO_ITEM = 256;

export function locLinhaNormalizada(it: RecebimentoItem | undefined): string {
  if (!it) return '';
  const v = it.localizacao;
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

export function normalizarTextoLocalizacaoItem(texto: string): string {
  return texto.trim().slice(0, MAX_LOCALIZACAO_ITEM);
}

export function aplicarLocalizacaoNoItem(row: RecebimentoItem, texto: string): void {
  const t = normalizarTextoLocalizacaoItem(texto);
  if (t === '') {
    delete row.localizacao;
  } else {
    row.localizacao = t;
  }
}

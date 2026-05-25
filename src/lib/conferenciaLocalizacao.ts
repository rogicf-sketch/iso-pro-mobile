import type { RecebimentoItem } from 'iso-pro-shared';

/** Alinhado ao campo texto do desktop (endereço / posição de estoque). */
export const MAX_LOCALIZACAO_ITEM = 256;

export function locLinhaNormalizada(it: RecebimentoItem | undefined): string {
  if (!it) return '';
  const v = it.localizacao;
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/** Durante a digitação: não usar trim (senão o espaço entre palavras some antes da próxima letra). */
export function limitarTextoLocalizacaoEmEdicao(texto: string): string {
  return texto.slice(0, MAX_LOCALIZACAO_ITEM);
}

/** Ao gravar / comparar com o previsto do PC. */
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

/** Mantém espaços enquanto o conferente escreve; use antes de guardar na nuvem. */
export function aplicarLocalizacaoEmEdicaoNoItem(row: RecebimentoItem, texto: string): void {
  const t = limitarTextoLocalizacaoEmEdicao(texto);
  if (t === '') {
    delete row.localizacao;
  } else {
    row.localizacao = t;
  }
}

export function normalizarLocalizacaoItensRecebimento(itens: RecebimentoItem[] | undefined): void {
  for (const it of itens ?? []) {
    if (!it) continue;
    const t = normalizarTextoLocalizacaoItem(String(it.localizacao ?? ''));
    if (t === '') delete it.localizacao;
    else it.localizacao = t;
  }
}

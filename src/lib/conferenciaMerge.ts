import type { IsoSnapshotPayload, Recebimento, RecebimentoItem } from 'iso-pro-shared';
import { locLinhaNormalizada } from './conferenciaLocalizacao';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Chave de identidade do item de recebimento: código normalizado (igual à agregação do servidor). */
export function chaveItemConferencia(item: RecebimentoItem | undefined): string {
  const codigo = String(item?.codigo ?? '').trim().toLowerCase();
  return codigo;
}

/** Aplica os campos editados na conferência (quantidade/observação/localização) de `origem` para `destino`. */
function aplicarCamposConferidos(destino: RecebimentoItem, origem: RecebimentoItem): void {
  destino.quantidadeConferida = origem.quantidadeConferida;

  const obs = origem.observacaoItem;
  if (obs !== undefined && obs !== null && String(obs).trim() !== '') {
    destino.observacaoItem = String(obs).trim();
  } else {
    delete destino.observacaoItem;
  }

  const loc = locLinhaNormalizada(origem);
  if (loc) {
    destino.localizacao = loc;
  } else {
    delete destino.localizacao;
  }
}

/**
 * Alinha o rascunho local com as linhas do servidor SEM depender da posição do array.
 *
 * O merge antigo casava `draft.itens[i]` com `server.itens[i]`; se o servidor
 * reordenava/insere/remove linhas, a quantidade conferida colava no código
 * errado (corrupção silenciosa de estoque). Aqui casamos por código; quando há
 * o mesmo código em várias linhas, respeitamos a ordem (fila por código).
 * Linhas sem código caem numa fila própria por posição (fallback).
 */
export function mergeRecebimentoConferido(draftRec: Recebimento, p: IsoSnapshotPayload): Recebimento {
  const server = p.recebimentos?.find((r) => String(r.id) === String(draftRec.id));
  if (!server) return deepClone(draftRec);

  const merged = deepClone(server);
  const draftItens = draftRec.itens ?? [];

  // Filas por chave de código (mantém a ordem original do rascunho).
  const filasPorCodigo = new Map<string, RecebimentoItem[]>();
  const filaSemCodigo: RecebimentoItem[] = [];
  for (const d of draftItens) {
    if (!d) continue;
    const chave = chaveItemConferencia(d);
    if (!chave) {
      filaSemCodigo.push(d);
      continue;
    }
    const fila = filasPorCodigo.get(chave) ?? [];
    fila.push(d);
    filasPorCodigo.set(chave, fila);
  }

  for (const it of merged.itens ?? []) {
    if (!it) continue;
    const chave = chaveItemConferencia(it);
    const fila = chave ? filasPorCodigo.get(chave) : filaSemCodigo;
    const d = fila?.shift();
    if (d) {
      aplicarCamposConferidos(it, d);
    }
  }

  return merged;
}

import type { IsoSnapshotPayload, Recebimento, RecebimentoItem } from 'iso-pro-shared';

function qcLinhaNormalizada(it: RecebimentoItem | undefined): string | null {
  if (!it) return null;
  const qc = it.quantidadeConferida;
  if (qc === undefined || qc === null) return null;
  if (typeof qc === 'string' && qc.trim() === '') return null;
  return String(qc).trim().replace(',', '.');
}

function obsLinhaNormalizada(it: RecebimentoItem | undefined): string {
  if (!it) return '';
  const o = it.observacaoItem;
  if (o === undefined || o === null) return '';
  return String(o).trim();
}

function itensConferenciaQuantidadesDiferem(
  a: RecebimentoItem[] | undefined | null,
  b: RecebimentoItem[] | undefined | null,
): boolean {
  const len = Math.max(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < len; i++) {
    if (qcLinhaNormalizada(a?.[i] ?? undefined) !== qcLinhaNormalizada(b?.[i] ?? undefined)) return true;
    if (obsLinhaNormalizada(a?.[i] ?? undefined) !== obsLinhaNormalizada(b?.[i] ?? undefined)) return true;
  }
  return false;
}

/**
 * `true` quando as quantidades conferidas editadas localmente diferem do último snapshot carregado da nuvem
 * (ainda não refletidas após «Guardar quantidades conferidas»).
 */
export function conferenciaLocalDifereDoSnapshot(
  local: Recebimento | null,
  payload: IsoSnapshotPayload | null,
): boolean {
  if (!local || !payload?.recebimentos?.length) return false;
  if (String(local.statusConferencia || 'pendente') === 'conferido') return false;
  if ((local.modoRecebimento || 'direto') !== 'aguardando_conferencia') return false;
  const server = payload.recebimentos.find((r) => String(r.id) === String(local.id));
  if (!server) return true;
  return itensConferenciaQuantidadesDiferem(local.itens, server.itens);
}

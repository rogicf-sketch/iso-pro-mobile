import type { SnapshotWriteOutcome } from './offlineSnapshotQueue';

export type { SnapshotWriteOutcome };

export function mensagemSucessoGravacaoSnapshot(result: SnapshotWriteOutcome): string {
  if (result.queued) {
    return 'Alteracoes guardadas neste aparelho e enfileiradas para sincronizar com a nuvem quando houver ligacao.';
  }
  return 'Alteracoes gravadas na nuvem.';
}

export function tituloSucessoGravacaoSnapshot(result: SnapshotWriteOutcome): string {
  return result.queued ? 'Guardado (pendente de sincronizacao)' : 'Guardado';
}

/** Texto do botão de confirmação (evita prometer «nuvem» quando pode ficar na fila offline). */
export function rotuloBotaoConfirmarGravacaoSnapshot(): string {
  return 'Guardar';
}

export function alertSnapshotWriteSuccess(
  result: SnapshotWriteOutcome,
  appAlertFn: (title: string, message: string) => void,
): void {
  appAlertFn(tituloSucessoGravacaoSnapshot(result), mensagemSucessoGravacaoSnapshot(result));
}

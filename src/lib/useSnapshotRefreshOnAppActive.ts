import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { appAlert } from './appDialog';
import { flushOfflineSnapshotQueue, type FlushOfflineQueueResult } from './offlineSnapshotQueue';

/**
 * Quando a app volta ao primeiro plano, recarrega o snapshot (baixa noutro dispositivo / browser).
 * `useFocusEffect` cobre troca de separadores; isto cobre alternar para outra app e voltar.
 */
function notifyFlushResult(result: FlushOfflineQueueResult): void {
  if (result.remaining > 0 && result.hadErrors) {
    void appAlert(
      'Sincronizacao pendente',
      `${result.remaining} alteracao(oes) na fila offline nao foram enviadas. Verifique a ligacao e abra o Inicio para atualizar.`,
    );
  } else if (result.flushed > 0 && result.remaining === 0) {
    void appAlert('Sincronizado', `${result.flushed} alteracao(oes) offline foram enviadas para a nuvem.`);
  }
}

export function useSnapshotRefreshOnAppActive(refresh: () => void | Promise<void>) {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void (async () => {
          const flush = await flushOfflineSnapshotQueue();
          notifyFlushResult(flush);
          await refresh();
        })();
      }
    });
    return () => sub.remove();
  }, [refresh]);
}

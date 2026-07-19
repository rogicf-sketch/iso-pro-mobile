import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { appAlert } from './appDialog';
import { flushOfflineSnapshotQueue, type FlushOfflineQueueResult } from './offlineSnapshotQueue';
import {
  flushAtendimentoComandoQueue,
  type FlushAtendimentoComandoResult,
} from './atendimentoComando';
import { reportMobileSyncHealthToCloud } from './mobileSyncHealth';

export function notifyOfflineFlushResult(result: FlushOfflineQueueResult): void {
  if (result.remaining > 0 && result.hadErrors) {
    void appAlert(
      'Sincronização pendente',
      `${result.remaining} alteração(ões) na fila offline não foram enviadas. Verifique a ligação e abra o Início para atualizar.`,
    );
  } else if (result.flushed > 0 && result.remaining === 0) {
    void appAlert('Sincronizado', `${result.flushed} alteração(ões) offline foram enviadas para a nuvem.`);
  }
}

export function notifyAtendimentoComandoFlushResult(result: FlushAtendimentoComandoResult): void {
  if (result.flushed > 0 && result.remaining === 0) {
    void appAlert('Sincronizado', `${result.flushed} baixa(s) de atendimento enviada(s) para a nuvem.`);
  }
}

/** Envia fila offline ao entrar nas tabs e quando a app volta ao primeiro plano. */
export function useOfflineSnapshotAutoFlush() {
  const flushing = useRef(false);

  useEffect(() => {
    const runFlush = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        const cmdResult = await flushAtendimentoComandoQueue();
        const snapResult = await flushOfflineSnapshotQueue();
        notifyAtendimentoComandoFlushResult(cmdResult);
        notifyOfflineFlushResult(snapResult);
        void reportMobileSyncHealthToCloud({ force: true });
      } finally {
        flushing.current = false;
      }
    };

    void runFlush();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void runFlush();
      }
    });
    return () => sub.remove();
  }, []);
}

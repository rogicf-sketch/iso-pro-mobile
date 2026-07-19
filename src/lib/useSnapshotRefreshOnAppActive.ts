import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Quando a app volta ao primeiro plano, recarrega o snapshot (baixa noutro dispositivo / browser).
 * A fila offline e enviada globalmente por `useOfflineSnapshotAutoFlush` no layout das tabs.
 */
export function useSnapshotRefreshOnAppActive(
  refresh: () => void | Promise<void>,
  debounceMs = 0,
) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (debounceMs <= 0) {
        void refresh();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, debounceMs);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [refresh, debounceMs]);
}

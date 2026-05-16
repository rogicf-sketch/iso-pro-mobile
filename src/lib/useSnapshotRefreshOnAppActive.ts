import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Quando a app volta ao primeiro plano, recarrega o snapshot (baixa noutro dispositivo / browser).
 * `useFocusEffect` cobre troca de separadores; isto cobre alternar para outra app e voltar.
 */
export function useSnapshotRefreshOnAppActive(refresh: () => void | Promise<void>) {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
}

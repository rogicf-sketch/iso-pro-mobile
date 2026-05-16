import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { platformGetItem, platformSetItem } from '@/src/lib/platformStorage';

/** Mesma ideia que `mostrarAjudaModulos` no I.S.O PRO desktop (Aparência). */
export const MOBILE_MOSTRAR_AJUDA_MODULOS_KEY = 'iso_pro_mobile_mostrar_ajuda_modulos';

type MobileUiPreferencesValue = {
  ready: boolean;
  /** Quando falso, escondem-se parágrafos longos de ajuda nos ecrãs operacionais. */
  mostrarTextosAjudaModulos: boolean;
  setMostrarTextosAjudaModulos: (v: boolean) => void;
};

const MobileUiPreferencesContext = createContext<MobileUiPreferencesValue | null>(null);

export function MobileUiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [mostrarTextosAjudaModulos, setMostrarTextosAjudaModulosState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await platformGetItem(MOBILE_MOSTRAR_AJUDA_MODULOS_KEY);
        if (!cancelled) {
          /** Ausente ou «1» = mostrar (comportamento anterior). «0» = interface mais limpa. */
          setMostrarTextosAjudaModulosState(raw !== '0');
        }
      } catch {
        /* default true */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMostrarTextosAjudaModulos = useCallback((v: boolean) => {
    setMostrarTextosAjudaModulosState(v);
    void platformSetItem(MOBILE_MOSTRAR_AJUDA_MODULOS_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  const value = useMemo<MobileUiPreferencesValue>(
    () => ({
      ready,
      mostrarTextosAjudaModulos,
      setMostrarTextosAjudaModulos,
    }),
    [ready, mostrarTextosAjudaModulos, setMostrarTextosAjudaModulos],
  );

  return <MobileUiPreferencesContext.Provider value={value}>{children}</MobileUiPreferencesContext.Provider>;
}

export function useMobileUiPreferences(): MobileUiPreferencesValue {
  const ctx = useContext(MobileUiPreferencesContext);
  if (!ctx) {
    throw new Error('useMobileUiPreferences must be used within MobileUiPreferencesProvider');
  }
  return ctx;
}

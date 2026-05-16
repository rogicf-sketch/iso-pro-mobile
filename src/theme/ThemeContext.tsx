import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { platformGetItem, platformSetItem } from '@/src/lib/platformStorage';
import { ThemeColors, ThemeId, THEME_STORAGE_KEY, themes } from './tokens';

type ThemeContextValue = {
  themeId: ThemeId;
  colors: ThemeColors;
  setThemeId: (id: ThemeId) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** IDs antigos (5 temas) → novos 4 temas */
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  dashboard: 'padraoEscuro',
  oceano: 'escuroSistema',
  grafite: 'padraoEscuro',
  claro: 'claroSistema',
  meiaNoite: 'escuroSistema',
};

function normalizeThemeId(raw: string | null): ThemeId {
  /** Primeira instalação: alinhar ao I.S.O PRO desktop (verde neon sobre escuro). */
  if (!raw) return 'neonVerde';
  if (raw in themes) return raw as ThemeId;
  return LEGACY_THEME_MAP[raw] ?? 'padraoEscuro';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('neonVerde');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await platformGetItem(THEME_STORAGE_KEY);
        if (!cancelled) {
          setThemeIdState(normalizeThemeId(raw));
        }
      } catch {
        /* usa default */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    void platformSetItem(THEME_STORAGE_KEY, id).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      colors: themes[themeId],
      setThemeId,
      ready,
    }),
    [themeId, setThemeId, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

import { type DependencyList, useEffect, useRef } from 'react';

/**
 * Executa `callback` após `delayMs` sem novas alterações nas dependências.
 * Útil para pesquisa ao digitar (debounce).
 */
export function useDebouncedEffect(callback: () => void, deps: DependencyList, delayMs: number): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const t = setTimeout(() => {
      cbRef.current();
    }, delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps vêm do chamador como lista explícita
  }, [...deps, delayMs]);
}

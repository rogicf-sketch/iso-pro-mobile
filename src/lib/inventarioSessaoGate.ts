export type InventarioSessaoGate = {
  temAlteracoesNaoGuardadasNaNuvem: () => boolean;
  guardarNaNuvem: () => Promise<boolean>;
  persistirRascunhoDispositivo: () => Promise<void>;
};

let gate: InventarioSessaoGate | null = null;

export function registerInventarioSessaoGate(next: InventarioSessaoGate | null) {
  gate = next;
}

export function getInventarioSessaoGate(): InventarioSessaoGate | null {
  return gate;
}

export type ConferenciaSessaoGate = {
  temAlteracoesNaoGuardadasNaNuvem: () => boolean;
  guardarNaNuvem: () => Promise<boolean>;
  persistirRascunhoDispositivo: () => Promise<void>;
};

let gate: ConferenciaSessaoGate | null = null;

export function registerConferenciaSessaoGate(next: ConferenciaSessaoGate | null) {
  gate = next;
}

export function getConferenciaSessaoGate(): ConferenciaSessaoGate | null {
  return gate;
}

/**
 * Liga o _layout dos tabs ao ecrã de atendimento: ao mudar de separador com sessão
 * aberta (comprovante ainda não finalizado), pede confirmação antes de sair.
 */
export type AtendimentoSessaoGate = {
  hasSessaoAberta: () => boolean;
  limparSessaoLocal: () => void;
};

let gate: AtendimentoSessaoGate | null = null;

export function registerAtendimentoSessaoGate(next: AtendimentoSessaoGate | null) {
  gate = next;
}

export function getAtendimentoSessaoGate(): AtendimentoSessaoGate | null {
  return gate;
}

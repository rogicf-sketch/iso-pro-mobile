import { describe, expect, it, vi } from 'vitest';
import {
  getAtendimentoSessaoGate,
  registerAtendimentoSessaoGate,
} from './atendimentoSessaoGate';

describe('atendimentoSessaoGate', () => {
  it('regista e devolve o gate activo', () => {
    const limpar = vi.fn();
    registerAtendimentoSessaoGate({
      hasSessaoAberta: () => true,
      limparSessaoLocal: limpar,
    });
    const g = getAtendimentoSessaoGate();
    expect(g?.hasSessaoAberta()).toBe(true);
    g?.limparSessaoLocal();
    expect(limpar).toHaveBeenCalledOnce();
  });

  it('limpa gate ao registar null', () => {
    registerAtendimentoSessaoGate(null);
    expect(getAtendimentoSessaoGate()).toBeNull();
  });
});

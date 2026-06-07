import { describe, expect, it } from 'vitest';
import {
  mensagemSucessoGravacaoSnapshot,
  rotuloBotaoConfirmarGravacaoSnapshot,
  tituloSucessoGravacaoSnapshot,
} from './snapshotWriteFeedback';

describe('snapshotWriteFeedback', () => {
  it('mensagem pendente quando queued', () => {
    const result = { error: null, conflict: false, updatedAt: null, queued: true };
    expect(mensagemSucessoGravacaoSnapshot(result)).toMatch(/enfileiradas/i);
    expect(tituloSucessoGravacaoSnapshot(result)).toMatch(/pendente/i);
  });

  it('mensagem nuvem quando sincronizado', () => {
    const result = { error: null, conflict: false, updatedAt: '2026-01-01T00:00:00.000Z' };
    expect(mensagemSucessoGravacaoSnapshot(result)).toMatch(/nuvem/i);
    expect(tituloSucessoGravacaoSnapshot(result)).toBe('Guardado');
  });

  it('rotulo de confirmacao neutro', () => {
    expect(rotuloBotaoConfirmarGravacaoSnapshot()).toBe('Guardar');
  });
});

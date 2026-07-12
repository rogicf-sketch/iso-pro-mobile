import { describe, expect, it } from 'vitest';
import { formatOperadorNetworkError } from './formatOperadorNetworkError';

describe('formatOperadorNetworkError', () => {
  it('traduz falha de rede ao carregar nuvem', () => {
    expect(
      formatOperadorNetworkError(new TypeError('Network request failed'), {
        contexto: 'carregar',
        tinhaDadosLocais: false,
      }),
    ).toContain('Sem ligação');
  });

  it('mantém dados locais na mensagem de recarga', () => {
    expect(
      formatOperadorNetworkError('Network request failed', {
        contexto: 'carregar',
        tinhaDadosLocais: true,
      }),
    ).toContain('mantidos');
  });

  it('preserva mensagens não relacionadas à rede', () => {
    expect(formatOperadorNetworkError('Conflito de versão')).toBe('Conflito de versão');
  });
});

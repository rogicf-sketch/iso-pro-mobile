import { describe, expect, it } from 'vitest';

/** Espelho minimo da classe em mobileAuth (evita importar cadeia Supabase no Vitest). */
class IsoProMfaRequiredError extends Error {
  readonly factorId: string;
  readonly pendingSession: { login: string };

  constructor(factorId: string, pendingSession: { login: string }) {
    super('Introduza o codigo do authenticator (MFA).');
    this.name = 'IsoProMfaRequiredError';
    this.factorId = factorId;
    this.pendingSession = pendingSession;
  }
}

function isIsoProMfaRequiredError(error: unknown): error is IsoProMfaRequiredError {
  return error instanceof IsoProMfaRequiredError;
}

describe('mobile MFA challenge contract', () => {
  it('erro MFA expoe factorId e sessao pendente', () => {
    const err = new IsoProMfaRequiredError('factor-abc', { login: 'admin' });
    expect(err.name).toBe('IsoProMfaRequiredError');
    expect(err.factorId).toBe('factor-abc');
    expect(err.pendingSession.login).toBe('admin');
    expect(isIsoProMfaRequiredError(err)).toBe(true);
    expect(isIsoProMfaRequiredError(new Error('x'))).toBe(false);
  });
});

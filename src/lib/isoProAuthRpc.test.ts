import { describe, expect, it } from 'vitest';
import { isIsoProAuthRpcMissing } from './isoProAuthRpcGuards';

describe('isoProAuthRpc (mobile)', () => {
  it('detecta funcao de autenticacao ausente', () => {
    expect(isIsoProAuthRpcMissing('iso_pro_autenticar_usuario not found')).toBe(true);
  });

  it('ignora falha de credenciais', () => {
    expect(isIsoProAuthRpcMissing('invalid credentials')).toBe(false);
  });
});

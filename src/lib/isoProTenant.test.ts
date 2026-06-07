import { describe, expect, it } from 'vitest';
import { ISO_PRO_DEFAULT_TENANT_ID } from './isoProTenantConstants';

describe('isoProTenantConstants', () => {
  it('tenant default alinhado ao desktop', () => {
    expect(ISO_PRO_DEFAULT_TENANT_ID).toBe('00000000-0000-0000-0000-000000000001');
  });
});

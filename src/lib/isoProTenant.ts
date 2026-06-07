import { ISO_PRO_DEFAULT_TENANT_ID } from './isoProTenantConstants';
import { platformGetItem, platformSetItem } from './platformStorage';

const TENANT_STORAGE_KEY = 'iso_pro_mobile_tenant_ativo_v1';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Tenant fixo no build (EAS secret / .env `EXPO_PUBLIC_ISO_PRO_TENANT_ID`). */
export function getBuildTimeTenantId(): string {
  const fromEnv = String(process.env.EXPO_PUBLIC_ISO_PRO_TENANT_ID ?? '').trim();
  if (isUuid(fromEnv)) return fromEnv;
  return ISO_PRO_DEFAULT_TENANT_ID;
}

let cachedTenantId: string = getBuildTimeTenantId();

export function getActiveTenantId(): string {
  return cachedTenantId;
}

export async function hydrateActiveTenantId(): Promise<string> {
  try {
    const raw = await platformGetItem(TENANT_STORAGE_KEY);
    if (raw && isUuid(raw)) {
      cachedTenantId = raw;
      return cachedTenantId;
    }
  } catch {
    /* ignore */
  }
  cachedTenantId = getBuildTimeTenantId();
  return cachedTenantId;
}

export async function setActiveTenantId(id: string): Promise<void> {
  if (!isUuid(id)) return;
  cachedTenantId = id;
  await platformSetItem(TENANT_STORAGE_KEY, id);
}

export type IsoProTenantListItem = {
  id: string;
  slug: string;
  name: string;
};

import Constants from 'expo-constants';
import type { MobileSession } from './mobileAuth';
import { platformGetItem, platformSetItem } from './platformStorage';

const DEVICE_KEY = 'iso_pro_mobile_device_v1';

export type MobileDeviceRecord = {
  deviceId: string;
  nomeAparelho: string;
  plataforma: 'android' | 'ios' | 'unknown';
  modelo: string;
  versaoApp: string;
  autorizado: boolean;
  bloqueado: boolean;
  usuarioLogin: string;
  ultimoAcessoEm: string;
};

async function getOrCreateDeviceId() {
  const existing = await platformGetItem(DEVICE_KEY);
  if (existing) return existing;

  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await platformSetItem(DEVICE_KEY, next);
  return next;
}

export async function registerDevice(session: MobileSession): Promise<MobileDeviceRecord> {
  const deviceId = await getOrCreateDeviceId();
  const record: MobileDeviceRecord = {
    deviceId,
    nomeAparelho: Constants.deviceName ?? 'Dispositivo mobile',
    plataforma:
      Constants.platform?.android != null ? 'android' : Constants.platform?.ios != null ? 'ios' : 'unknown',
    modelo: Constants.platform?.android?.model ?? Constants.platform?.ios?.model ?? 'Modelo nao identificado',
    versaoApp: Constants.expoConfig?.version ?? '—',
    /** Só passa a true quando o administrador autorizar no I.S.O PRO (Supabase). */
    autorizado: false,
    bloqueado: false,
    usuarioLogin: session.login,
    ultimoAcessoEm: new Date().toISOString(),
  };

  await saveDeviceRecord(record);
  return record;
}

export async function getStoredDeviceRecord(): Promise<MobileDeviceRecord | null> {
  const raw = await platformGetItem(`${DEVICE_KEY}_meta`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as MobileDeviceRecord;
  } catch {
    return null;
  }
}

export async function saveDeviceRecord(record: MobileDeviceRecord): Promise<void> {
  await platformSetItem(`${DEVICE_KEY}_meta`, JSON.stringify(record));
}

import Constants from 'expo-constants';

import { getAtendimentoComandoQueueSize } from './atendimentoComando';
import { getActiveTenantId } from './isoProTenant';
import { getStoredDeviceRecord } from './mobileDevice';
import { getOfflineSnapshotQueueSize } from './offlineSnapshotQueue';
import { getSupabase } from './supabase';

const REPORT_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastReportAt = 0;

/** Telemetria de fila offline para o painel admin do PC (migration 20260707200000). */
export async function reportMobileSyncHealthToCloud(options?: { force?: boolean }): Promise<void> {
  const now = Date.now();
  if (!options?.force && now - lastReportAt < REPORT_MIN_INTERVAL_MS) {
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const device = await getStoredDeviceRecord();
  if (!device?.deviceId) return;

  const [atendimentoQueue, offlineQueue] = await Promise.all([
    getAtendimentoComandoQueueSize(),
    getOfflineSnapshotQueueSize(),
  ]);

  try {
    await supabase.rpc('iso_pro_report_mobile_sync_health', {
      p_tenant_id: getActiveTenantId(),
      p_device_id: device.deviceId,
      p_app_version: Constants.expoConfig?.version ?? 'desconhecida',
      p_queue_size: atendimentoQueue + offlineQueue,
      p_device_label: device.nomeAparelho ?? null,
    });
    lastReportAt = now;
  } catch {
    /* telemetria best-effort — não bloqueia operação */
  }
}

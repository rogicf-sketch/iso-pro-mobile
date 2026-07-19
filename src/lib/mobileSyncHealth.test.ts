import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { version: '1.0.52' },
  },
}));

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(() => ({ rpc: rpcMock })),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => 'tenant-test'),
}));

vi.mock('./mobileDevice', () => ({
  getStoredDeviceRecord: vi.fn(async () => ({
    deviceId: 'dev-1',
    nomeAparelho: 'Pixel Teste',
  })),
}));

vi.mock('./atendimentoComando', () => ({
  getAtendimentoComandoQueueSize: vi.fn(async () => 2),
}));

vi.mock('./offlineSnapshotQueue', () => ({
  getOfflineSnapshotQueueSize: vi.fn(async () => 1),
}));

import { reportMobileSyncHealthToCloud } from './mobileSyncHealth';

describe('reportMobileSyncHealthToCloud', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('reporta fila combinada ao RPC de telemetria', async () => {
    await reportMobileSyncHealthToCloud({ force: true });
    expect(rpcMock).toHaveBeenCalledWith('iso_pro_report_mobile_sync_health', {
      p_tenant_id: 'tenant-test',
      p_device_id: 'dev-1',
      p_app_version: '1.0.52',
      p_queue_size: 3,
      p_device_label: 'Pixel Teste',
    });
  });
});

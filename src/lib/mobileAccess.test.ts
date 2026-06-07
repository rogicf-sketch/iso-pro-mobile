import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileSession } from './mobileAuth';
import type { MobileDeviceRecord } from './mobileDevice';
import { resolveMobileAccess } from './mobileAccess';
import { getSupabase } from './supabase';
import { getStoredDeviceRecord, registerDevice, saveDeviceRecord } from './mobileDevice';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));

vi.mock('./mobileDevice', () => ({
  getStoredDeviceRecord: vi.fn(),
  registerDevice: vi.fn(),
  saveDeviceRecord: vi.fn(),
}));

const session: MobileSession = {
  userId: 'u1',
  login: 'op@empresa.pt',
  nome: 'Operador',
  perfil: 'campo',
  tenantId: '00000000-0000-0000-0000-000000000001',
};

const device: MobileDeviceRecord = {
  deviceId: 'dev-test-1',
  nomeAparelho: 'Telemóvel teste',
  plataforma: 'android',
  modelo: 'Pixel',
  versaoApp: '1.0.0',
  autorizado: false,
  bloqueado: false,
  usuarioLogin: session.login,
  ultimoAcessoEm: new Date().toISOString(),
};

describe('resolveMobileAccess', () => {
  beforeEach(() => {
    vi.mocked(getStoredDeviceRecord).mockReset();
    vi.mocked(registerDevice).mockReset();
    vi.mocked(saveDeviceRecord).mockReset();
    vi.mocked(getSupabase).mockReset();

    vi.mocked(getStoredDeviceRecord).mockResolvedValue(device);
    vi.mocked(registerDevice).mockResolvedValue(device);
    vi.mocked(saveDeviceRecord).mockResolvedValue(undefined);
  });

  it('sem Supabase grava local e devolve source local', async () => {
    vi.mocked(getSupabase).mockReturnValue(null);

    const res = await resolveMobileAccess(session);

    expect(res.source).toBe('local');
    expect(res.offlineUnverified).toBe(true);
    expect(res.warning).toContain('Supabase');
    expect(res.device.deviceId).toBe(device.deviceId);
    expect(vi.mocked(saveDeviceRecord)).toHaveBeenCalled();
  });

  it('erro na leitura remota mantém local e preenche warning', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'Falha de rede / RLS' } }),
          }),
        }),
      }),
    } as never);

    const res = await resolveMobileAccess(session);

    expect(res.source).toBe('local');
    expect(res.offlineUnverified).toBe(true);
    expect(res.warning).toContain('offline');
  });

  it('erro no upsert mantém local e preenche warning', async () => {
    let dispositivosCalls = 0;
    vi.mocked(getSupabase).mockReturnValue({
      from: (table: string) => {
        if (table === 'mobile_logs_acesso') {
          return { insert: () => Promise.resolve({}) };
        }
        dispositivosCalls += 1;
        if (dispositivosCalls === 1) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { device_id: device.deviceId, autorizado: false, bloqueado: false },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: 'upsert falhou' } }),
            }),
          }),
        };
      },
    } as never);

    const res = await resolveMobileAccess(session);

    expect(res.source).toBe('local');
    expect(res.offlineUnverified).toBe(true);
    expect(res.warning).toContain('offline');
  });

  it('sucesso remoto grava dispositivo fundido e devolve source supabase', async () => {
    let dispositivosCalls = 0;
    vi.mocked(getSupabase).mockReturnValue({
      from: (table: string) => {
        if (table === 'mobile_logs_acesso') {
          return { insert: () => Promise.resolve({}) };
        }
        dispositivosCalls += 1;
        if (dispositivosCalls === 1) {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return {
            select: () => chain,
          };
        }
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  device_id: device.deviceId,
                  nome_aparelho: device.nomeAparelho,
                  plataforma: 'android',
                  modelo: device.modelo,
                  versao_app: device.versaoApp,
                  autorizado: true,
                  bloqueado: false,
                  usuario_login: session.login,
                  usuario_nome: session.nome,
                  ultimo_acesso_em: device.ultimoAcessoEm,
                },
                error: null,
              }),
            }),
          }),
        };
      },
    } as never);

    const res = await resolveMobileAccess(session);

    expect(res.source).toBe('supabase');
    expect(res.warning).toBeNull();
    expect(res.offlineUnverified).toBe(false);
    expect(res.state).toBe('authorized');
    expect(res.device.ultimaValidacaoRemotaEm).toBeTruthy();
    expect(res.device.autorizado).toBe(true);
    expect(vi.mocked(saveDeviceRecord)).toHaveBeenCalled();
  });
});

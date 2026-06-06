import { getSupabase } from './supabase';
import { getActiveTenantId } from './isoProTenant';
import { getStoredDeviceRecord, registerDevice, saveDeviceRecord, type MobileDeviceRecord } from './mobileDevice';
import type { MobileSession } from './mobileAuth';

export type MobileAccessState = 'authorized' | 'pending' | 'blocked';

export type MobileAccessResult = {
  state: MobileAccessState;
  device: MobileDeviceRecord;
  source: 'local' | 'supabase';
  warning: string | null;
  /** Supabase indisponível: controlo de aparelho não foi revalidado. */
  offlineUnverified: boolean;
};

type RemoteDeviceRow = {
  id?: string;
  device_id?: string;
  nome_aparelho?: string | null;
  plataforma?: string | null;
  modelo?: string | null;
  versao_app?: string | null;
  autorizado?: boolean | null;
  bloqueado?: boolean | null;
  usuario_login?: string | null;
  usuario_nome?: string | null;
  ultimo_acesso_em?: string | null;
};

function normalizeState(device: MobileDeviceRecord): MobileAccessState {
  if (device.bloqueado) return 'blocked';
  if (!device.autorizado) return 'pending';
  return 'authorized';
}

function mapRemoteRow(row: RemoteDeviceRow, fallback: MobileDeviceRecord): MobileDeviceRecord {
  return {
    ...fallback,
    deviceId: row.device_id ?? fallback.deviceId,
    nomeAparelho: row.nome_aparelho ?? fallback.nomeAparelho,
    plataforma:
      row.plataforma === 'android' || row.plataforma === 'ios' || row.plataforma === 'unknown'
        ? row.plataforma
        : fallback.plataforma,
    modelo: row.modelo ?? fallback.modelo,
    versaoApp: row.versao_app ?? fallback.versaoApp,
    autorizado: row.autorizado ?? fallback.autorizado,
    bloqueado: row.bloqueado ?? fallback.bloqueado,
    usuarioLogin: row.usuario_login ?? fallback.usuarioLogin,
    ultimoAcessoEm: row.ultimo_acesso_em ?? fallback.ultimoAcessoEm,
  };
}

export async function resolveMobileAccess(session: MobileSession): Promise<MobileAccessResult> {
  const localDevice = (await getStoredDeviceRecord()) ?? (await registerDevice(session));
  const supabase = getSupabase();

  if (!supabase) {
    await saveDeviceRecord(localDevice);
    return {
      state: normalizeState(localDevice),
      device: localDevice,
      source: 'local',
      warning: 'Supabase nao configurado — controlo de aparelho apenas local.',
      offlineUnverified: true,
    };
  }

  try {
    const tenantId = session.tenantId || getActiveTenantId();
    const remotePayload = {
      device_id: localDevice.deviceId,
      tenant_id: tenantId,
      nome_aparelho: localDevice.nomeAparelho,
      plataforma: localDevice.plataforma,
      modelo: localDevice.modelo,
      versao_app: localDevice.versaoApp,
      usuario_login: session.login,
      usuario_nome: session.nome,
      ultimo_acesso_em: new Date().toISOString(),
    };

    const { data: existing, error: fetchError } = await supabase
      .from('dispositivos_mobile')
      .select('id,device_id,nome_aparelho,plataforma,modelo,versao_app,autorizado,bloqueado,usuario_login,usuario_nome,ultimo_acesso_em')
      .eq('device_id', localDevice.deviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError) {
      const offlineDevice = applyOfflineDevicePolicy(localDevice);
      await saveDeviceRecord(offlineDevice);
      return {
        state: normalizeState(offlineDevice),
        device: offlineDevice,
        source: 'local',
        warning:
          'Modo offline: controlo de aparelho nao verificado na nuvem. Ligacao restabelecida atualiza autorizacao.',
        offlineUnverified: true,
      };
    }

    const remoteRow = existing as RemoteDeviceRow | null;

    /**
     * Primeiro registo: fica pendente (autorizado=false) até o administrador autorizar no desktop.
     * Linha já existente: respeita autorizado/bloqueado do Supabase (autorizar / bloquear / revogar).
     */
    const autorizadoUpsert = remoteRow != null ? (remoteRow.autorizado ?? false) : false;
    const bloqueadoUpsert = remoteRow != null ? (remoteRow.bloqueado ?? false) : false;

    const { data: saved, error: saveError } = await supabase
      .from('dispositivos_mobile')
      .upsert(
        {
          ...remotePayload,
          autorizado: autorizadoUpsert,
          bloqueado: bloqueadoUpsert,
        },
        { onConflict: 'device_id' },
      )
      .select('id,device_id,nome_aparelho,plataforma,modelo,versao_app,autorizado,bloqueado,usuario_login,usuario_nome,ultimo_acesso_em')
      .single();

    if (saveError) {
      const offlineDevice = applyOfflineDevicePolicy(localDevice);
      await saveDeviceRecord(offlineDevice);
      return {
        state: normalizeState(offlineDevice),
        device: offlineDevice,
        source: 'local',
        warning:
          'Modo offline: controlo de aparelho nao verificado na nuvem. Ligacao restabelecida atualiza autorizacao.',
        offlineUnverified: true,
      };
    }

    const savedRow = saved as RemoteDeviceRow;

    void supabase.from('mobile_logs_acesso').insert({
      device_id: localDevice.deviceId,
      usuario_login: session.login,
      evento: normalizeState(mapRemoteRow(savedRow ?? {}, localDevice)),
      detalhe: 'Acesso validado pelo app mobile',
    });

    const merged = mapRemoteRow(savedRow ?? {}, localDevice);
    const withRemoteStamp: MobileDeviceRecord = {
      ...merged,
      ultimaValidacaoRemotaEm: new Date().toISOString(),
      remotoAutorizado: merged.autorizado,
      remotoBloqueado: merged.bloqueado,
    };
    await saveDeviceRecord(withRemoteStamp);
    return {
      state: normalizeState(withRemoteStamp),
      device: withRemoteStamp,
      source: 'supabase',
      warning: null,
      offlineUnverified: false,
    };
  } catch {
    const offlineDevice = applyOfflineDevicePolicy(localDevice);
    await saveDeviceRecord(offlineDevice);
    return {
      state: normalizeState(offlineDevice),
      device: offlineDevice,
      source: 'local',
      warning:
        'Modo offline: controlo de aparelho nao verificado na nuvem. Ligacao restabelecida atualiza autorizacao.',
      offlineUnverified: true,
    };
  }
}

/** Em offline, respeita bloqueio/revogação conhecida da última validação remota. */
function applyOfflineDevicePolicy(device: MobileDeviceRecord): MobileDeviceRecord {
  if (device.remotoBloqueado === true) {
    return { ...device, bloqueado: true, autorizado: false };
  }
  if (device.remotoAutorizado === false) {
    return { ...device, autorizado: false };
  }
  return device;
}

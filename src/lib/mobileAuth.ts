import { hasSupabaseConfig } from './config';
import { getSupabase } from './supabase';
import { platformDeleteItem, platformGetItem, platformSetItem } from './platformStorage';

/** v2: builds antigos usavam v1 — assim forçamos novo login após atualizar o APK (resolve «entra direto» com sessão velha). */
const SESSION_KEY = 'iso_pro_mobile_session_v2';
const LEGACY_SESSION_KEY = 'iso_pro_mobile_session_v1';
/** Primeira abertura desta instalação: limpa sessão (backup/restauro pode trazer login automático). */
const INSTALL_FIRST_LAUNCH_KEY = 'iso_pro_mobile_install_first_launch_v1';

let sessionCache: MobileSession | null = null;

/** Apaga sessão antiga do armazenamento e chaves legadas (uma vez por arranque, idempotente). */
export async function runAuthStorageMigration(): Promise<void> {
  await platformDeleteItem(LEGACY_SESSION_KEY);
  sessionCache = null;
}

/**
 * Na primeira execução após instalar a app, faz logout para garantir ecrã de login/senha.
 * Não corre em cada abertura — só até gravar a chave.
 */
export async function clearSessionOnFirstLaunchAfterInstall(): Promise<void> {
  const done = await platformGetItem(INSTALL_FIRST_LAUNCH_KEY);
  if (done === '1') return;
  await platformDeleteItem(SESSION_KEY);
  sessionCache = null;
  await platformSetItem(INSTALL_FIRST_LAUNCH_KEY, '1');
}

export type MobileSession = {
  userId: string;
  login: string;
  nome: string;
  perfil: string;
};

function isValidMobileSession(s: unknown): s is MobileSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as MobileSession;
  const userId = String(o.userId ?? '').trim();
  const login = String(o.login ?? '').trim();
  return userId.length > 0 && login.length > 0;
}

type RemotePermissionRow = {
  modulo?: string | null;
  acao?: string | null;
  permitido?: boolean | null;
};

type RemoteProfileRow = {
  id?: string | null;
  nome?: string | null;
  codigo?: string | null;
  perfil_permissoes?: RemotePermissionRow[] | null;
};

type RemoteUserRow = {
  id?: string | null;
  login?: string | null;
  nome?: string | null;
  senha?: string | null;
  ativo?: boolean | null;
  perfis_acesso?: RemoteProfileRow | RemoteProfileRow[] | null;
  usuario_permissoes?: RemotePermissionRow[] | null;
};

type NormalizedRemoteUserRow = Omit<RemoteUserRow, 'perfis_acesso'> & {
  perfis_acesso?: RemoteProfileRow | null;
};

function normalizeRemoteRow(data: RemoteUserRow): NormalizedRemoteUserRow {
  const p = data.perfis_acesso;
  const perfis_acesso =
    p == null ? null : Array.isArray(p) ? p[0] ?? null : p;
  return { ...data, perfis_acesso };
}

function effectivePermissions(row: NormalizedRemoteUserRow): RemotePermissionRow[] {
  const perfil = row.perfis_acesso;
  const fromUser = row.usuario_permissoes;
  if (fromUser?.length) return fromUser;
  return perfil?.perfil_permissoes ?? [];
}

function hasMobileModuleAccess(row: NormalizedRemoteUserRow): boolean {
  return effectivePermissions(row).some((p) => p.modulo === 'mobile' && p.permitido === true);
}

function sessionFromRemoteUser(row: NormalizedRemoteUserRow): MobileSession {
  const perfil = row.perfis_acesso;
  const perfilLabel = String(perfil?.codigo ?? perfil?.id ?? perfil?.nome ?? '').trim() || 'perfil';
  return {
    userId: String(row.id ?? ''),
    login: String(row.login ?? ''),
    nome: String(row.nome ?? row.login ?? 'Utilizador'),
    perfil: perfilLabel,
  };
}

export async function getStoredMobileSession(): Promise<MobileSession | null> {
  if (sessionCache) return sessionCache;

  const raw = await platformGetItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidMobileSession(parsed)) {
      await platformDeleteItem(SESSION_KEY);
      sessionCache = null;
      return null;
    }
    sessionCache = parsed;
    return sessionCache;
  } catch {
    await platformDeleteItem(SESSION_KEY);
    sessionCache = null;
    return null;
  }
}

/**
 * Login alinhado ao I.S.O PRO desktop: valida `usuarios_sistema` no Supabase (mesma query e comparacao de senha).
 * Exige perfil com permissao ao modulo `mobile`.
 */
export async function loginMobile(login: string, senha: string): Promise<MobileSession> {
  const loginTrimmed = login.trim();
  const senhaTrimmed = senha.trim();

  if (!loginTrimmed || !senhaTrimmed) {
    throw new Error('Informe login e senha.');
  }

  if (!hasSupabaseConfig()) {
    throw new Error(
      'Supabase nao configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (EAS Secrets ou .env).',
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Nao foi possivel ligar ao Supabase.');
  }

  const loginKey = loginTrimmed.toLowerCase();

  let data: unknown;
  let error: { message?: string } | null;
  try {
    const res = await supabase
      .from('usuarios_sistema')
      .select(
        'id,login,nome,senha,ativo,perfis_acesso(id,codigo,nome,perfil_permissoes(modulo,acao,permitido)),usuario_permissoes(modulo,acao,permitido)',
      )
      .eq('login', loginKey)
      .eq('ativo', true)
      .maybeSingle();
    data = res.data;
    error = res.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNet = /network request failed|failed to fetch|networkerror|aborted|timeout|typeerror.*network/i.test(
      msg.toLowerCase(),
    );
    if (isNet) {
      throw new Error(
        'Sem ligação ao Supabase (rede ou URL). Confirme internet no telemóvel, projeto Supabase ativo, e no expo.dev variáveis EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY para o ambiente «preview» (depois gere novo build).',
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }

  if (error) {
    const em = error.message || '';
    if (/network request failed|failed to fetch/i.test(em)) {
      throw new Error(
        'Sem ligação ao Supabase. Verifique as variáveis no EAS (ambiente preview), URL https://…supabase.co e novo APK.',
      );
    }
    throw new Error(em || 'Falha ao consultar utilizadores.');
  }

  const rowRaw = data as RemoteUserRow | null;
  if (!rowRaw || String(rowRaw.senha ?? '') !== senhaTrimmed) {
    throw new Error('Login ou senha invalidos.');
  }

  const row = normalizeRemoteRow(rowRaw);

  if (!hasMobileModuleAccess(row)) {
    throw new Error('Seu perfil nao tem acesso ao aplicativo mobile. Peça ao administrador para incluir o modulo Mobile.');
  }

  const session = sessionFromRemoteUser(row);
  await platformSetItem(SESSION_KEY, JSON.stringify(session));
  sessionCache = session;
  return session;
}

export async function logoutMobile(): Promise<void> {
  await platformDeleteItem(SESSION_KEY);
  sessionCache = null;
}

export function getMobileSessionCache(): MobileSession | null {
  return sessionCache;
}

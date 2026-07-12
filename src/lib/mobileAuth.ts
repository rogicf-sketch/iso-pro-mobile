import { hasSupabaseConfig, getSupabaseHostHintForUser } from './config';
import {
  authenticateIsoProPreferJwt,
  clearIsoProJwtSession,
  verifyIsoProMfaChallenge,
} from './isoProJwtSession';
import { getActiveTenantId, hydrateActiveTenantId, setActiveTenantId } from './isoProTenant';
import { platformDeleteItem, platformGetItem, platformSetItem } from './platformStorage';

export type MobileSession = {
  userId: string;
  login: string;
  nome: string;
  perfil: string;
  tenantId: string;
};

export class IsoProMfaRequiredError extends Error {
  readonly factorId: string;
  readonly pendingSession: MobileSession;

  constructor(factorId: string, pendingSession: MobileSession) {
    super('Introduza o codigo do authenticator (MFA).');
    this.name = 'IsoProMfaRequiredError';
    this.factorId = factorId;
    this.pendingSession = pendingSession;
  }
}

export function isIsoProMfaRequiredError(error: unknown): error is IsoProMfaRequiredError {
  return error instanceof IsoProMfaRequiredError;
}

const LOGIN_RPC_TIMEOUT_MS = 20_000;

function mensagemFalhaRedeSupabase(): string {
  const host = getSupabaseHostHintForUser();
  if (!hasSupabaseConfig()) {
    return 'Supabase não configurado neste APK. Gere novo build com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no .env (ou EAS Secrets).';
  }
  return host
    ? `Sem ligação ao Supabase (${host}). Verifique Wi‑Fi/dados e tente novamente.`
    : 'Sem ligação ao Supabase. Verifique Wi‑Fi/dados e tente novamente.';
}

async function preferJwtComTimeout(
  loginTrimmed: string,
  senhaTrimmed: string,
): Promise<Awaited<ReturnType<typeof authenticateIsoProPreferJwt>>> {
  return await Promise.race([
    authenticateIsoProPreferJwt(loginTrimmed, senhaTrimmed, { requiredModule: 'mobile' }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_RPC_TIMEOUT_MS);
    }),
  ]);
}

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

function isValidMobileSession(s: unknown): s is MobileSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as MobileSession;
  const userId = String(o.userId ?? '').trim();
  const login = String(o.login ?? '').trim();
  const tenantId = String(o.tenantId ?? '').trim();
  return userId.length > 0 && login.length > 0 && tenantId.length > 0;
}

function sessionFromRpcUser(
  user: {
    id: string;
    login: string;
    nome: string;
    perfil: { nome: string; id: string };
  },
  tenantId: string,
): MobileSession {
  return {
    userId: user.id,
    login: user.login,
    nome: user.nome,
    perfil: user.perfil.nome || user.perfil.id || 'perfil',
    tenantId,
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
    await setActiveTenantId(parsed.tenantId);
    sessionCache = parsed;
    return sessionCache;
  } catch {
    await platformDeleteItem(SESSION_KEY);
    sessionCache = null;
    return null;
  }
}

/**
 * Login preferindo JWT (resolver + signIn); fallback RPC sem cutover.
 * Requer migration `iso_pro_resolver_auth_email_sessao` actualizada (user + jwtReady).
 */
export async function loginMobile(login: string, senha: string, tenantId?: string): Promise<MobileSession> {
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

  await hydrateActiveTenantId();
  const tenant = tenantId?.trim() || getActiveTenantId();
  await setActiveTenantId(tenant);

  try {
    const result = await preferJwtComTimeout(loginTrimmed, senhaTrimmed);

    if (result.ok) {
      const session = sessionFromRpcUser(result.user, tenant);
      if (result.jwt.kind === 'mfa_required') {
        throw new IsoProMfaRequiredError(result.jwt.factorId, session);
      }
      await platformSetItem(SESSION_KEY, JSON.stringify(session));
      sessionCache = session;
      return session;
    }

    if (result.rpcMissing) {
      throw new Error(
        'Servidor Supabase desatualizado: falta a funcao iso_pro_autenticar_usuario. Execute «npx supabase db push» no projeto desktop e tente novamente.',
      );
    }

    if (/network|fetch|timeout|failed to fetch/i.test(result.error)) {
      throw new Error(mensagemFalhaRedeSupabase());
    }

    throw new Error(result.error || 'Login ou senha invalidos.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNet = /network request failed|failed to fetch|networkerror|aborted|timeout|login_timeout|typeerror.*network/i.test(
      msg.toLowerCase(),
    );
    if (isNet) {
      throw new Error(mensagemFalhaRedeSupabase());
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function completeMobileLoginAfterMfa(
  factorId: string,
  code: string,
  pendingSession: MobileSession,
): Promise<MobileSession> {
  await verifyIsoProMfaChallenge(factorId, code);
  await platformSetItem(SESSION_KEY, JSON.stringify(pendingSession));
  sessionCache = pendingSession;
  return pendingSession;
}

export async function cancelMobileMfaLogin(): Promise<void> {
  await clearIsoProJwtSession();
}

export async function logoutMobile(): Promise<void> {
  await clearIsoProJwtSession();
  await platformDeleteItem(SESSION_KEY);
  sessionCache = null;
}

export function getMobileSessionCache(): MobileSession | null {
  return sessionCache;
}

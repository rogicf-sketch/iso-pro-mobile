import { autenticarUsuarioIsoProRpc, type IsoProAuthRpcUser } from './isoProAuthRpc';
import { getActiveTenantId } from './isoProTenant';
import { platformDeleteItem, platformGetItem, platformSetItem } from './platformStorage';
import { getSupabase, resetSupabaseClient } from './supabase';

const JWT_SESSION_FLAG_KEY = 'iso_pro_mobile_jwt_session_active_v1';

export type IsoProAuthPath = 'jwt' | 'rpc_fallback' | 'rpc_only';

export type IsoProJwtBootstrapResult =
  | { ok: true; email: string; authUserId: string; user?: IsoProAuthRpcUser; jwtReady: true }
  | { ok: true; jwtReady: false; user?: IsoProAuthRpcUser; reason: string }
  | { ok: false; jwtReady: false; reason: string }
  | { ok: false; jwtReady: true; reason: string };

export type JwtBootstrapOutcome =
  | { kind: 'skipped' }
  | { kind: 'ok' }
  | { kind: 'mfa_required'; factorId: string }
  | { kind: 'failed'; reason: string };

export type PreferJwtLoginResult =
  | {
      ok: true;
      user: IsoProAuthRpcUser;
      authPath: IsoProAuthPath;
      jwt: JwtBootstrapOutcome;
    }
  | { ok: false; error: string; rpcMissing?: boolean };

function isJwtAuthFeatureEnabled(): boolean {
  const envFlag = String(process.env.EXPO_PUBLIC_ISO_PRO_JWT_AUTH ?? '').trim().toLowerCase();
  if (envFlag === 'true' || envFlag === '1' || envFlag === 'yes') return true;
  if (envFlag === 'false' || envFlag === '0' || envFlag === 'no') return false;
  return true;
}

let jwtSessionActiveMemory = false;

export function isIsoProJwtSessionActive(): boolean {
  return jwtSessionActiveMemory;
}

export async function hydrateIsoProJwtSessionFlag(): Promise<boolean> {
  try {
    jwtSessionActiveMemory = (await platformGetItem(JWT_SESSION_FLAG_KEY)) === '1';
  } catch {
    jwtSessionActiveMemory = false;
  }
  return jwtSessionActiveMemory;
}

async function setJwtSessionActive(active: boolean): Promise<void> {
  jwtSessionActiveMemory = active;
  try {
    if (active) {
      await platformSetItem(JWT_SESSION_FLAG_KEY, '1');
    } else {
      await platformDeleteItem(JWT_SESSION_FLAG_KEY);
    }
  } catch {
    /* ignore */
  }
  // Nao resetar o cliente aqui: em RN destruia a sessao em memoria e, sem
  // AsyncStorage no createClient, o telemovel ficava authenticated/anon inconsistente
  // (Consulta com total desenhos = 0 apesar de 1000+ na nuvem).
}

function tenantIdFromAccessToken(accessToken: string): string | null {
  try {
    const payloadB64 = accessToken.split('.')[1];
    if (!payloadB64) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = globalThis.atob
      ? globalThis.atob(padded + '='.repeat(padLen))
      : Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
    const claims = JSON.parse(json) as {
      tenant_id?: string;
      app_metadata?: { tenant_id?: string };
      user_metadata?: { tenant_id?: string };
    };
    const raw =
      claims.tenant_id ?? claims.app_metadata?.tenant_id ?? claims.user_metadata?.tenant_id ?? '';
    const t = String(raw).trim();
    return t || null;
  } catch {
    return null;
  }
}

function parseUserFromResolverBody(body: Record<string, unknown>): IsoProAuthRpcUser | null {
  const raw = body.user;
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const perfil = (u.perfil && typeof u.perfil === 'object' ? u.perfil : {}) as Record<string, unknown>;
  return {
    id: String(u.id ?? ''),
    login: String(u.login ?? ''),
    nome: String(u.nome ?? u.login ?? 'Utilizador'),
    perfil: {
      id: String(perfil.id ?? ''),
      nome: String(perfil.nome ?? 'Perfil'),
    },
  };
}

export async function resolverAuthEmailSessao(
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<IsoProJwtBootstrapResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, jwtReady: false, reason: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_resolver_auth_email_sessao', {
    p_tenant_id: getActiveTenantId(),
    p_login: login.trim().toLowerCase(),
    p_senha: senha.trim(),
    p_requer_modulo: options?.requiredModule ?? 'mobile',
  });

  if (error) {
    const msg = error.message ?? 'Falha ao resolver email Auth.';
    const missing = /could not find the function|does not exist/i.test(msg);
    return {
      ok: false,
      jwtReady: false,
      reason: missing
        ? 'RPC iso_pro_resolver_auth_email_sessao em falta. Aplique migrations JWT no desktop.'
        : msg,
    };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  const user = parseUserFromResolverBody(body);

  if (body.ok === true && body.jwtReady === true) {
    const email = String(body.email ?? '').trim();
    const authUserId = String(body.authUserId ?? '').trim();
    if (!email || !authUserId) {
      return { ok: false, jwtReady: false, reason: 'Resposta Auth incompleta.' };
    }
    return { ok: true, jwtReady: true, email, authUserId, ...(user ? { user } : {}) };
  }

  if (body.ok === true && body.jwtReady === false && user) {
    return {
      ok: true,
      jwtReady: false,
      user,
      reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
    };
  }

  return {
    ok: false,
    jwtReady: body.jwtReady === true,
    reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
  };
}

async function detectMfaRequired(): Promise<{ required: true; factorId: string } | { required: false }> {
  const supabase = getSupabase();
  if (!supabase) return { required: false };
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || !aal.data) return { required: false };
  const needsAal2 = aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2';
  if (!needsAal2) return { required: false };
  const factors = await supabase.auth.mfa.listFactors();
  const totp = (factors.data?.totp ?? []).find((f) => f.status === 'verified');
  if (!totp?.id) return { required: false };
  return { required: true, factorId: totp.id };
}

async function signInResolvedEmail(email: string, senha: string): Promise<JwtBootstrapOutcome> {
  await setJwtSessionActive(true);
  const supabase = getSupabase();
  if (!supabase) {
    await setJwtSessionActive(false);
    return { kind: 'failed', reason: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha.trim(),
  });

  if (error) {
    await setJwtSessionActive(false);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    console.warn('[I.S.O PRO mobile] JWT bootstrap falhou; modo anon mantido:', error.message);
    return { kind: 'failed', reason: error.message };
  }

  const accessToken = data.session?.access_token ?? '';
  const jwtTenant = accessToken ? tenantIdFromAccessToken(accessToken) : null;
  const activeTenant = getActiveTenantId();
  if (!jwtTenant || jwtTenant !== activeTenant) {
    console.warn(
      '[I.S.O PRO mobile] JWT sem tenant_id alinhado; modo anon (rpc_fallback).',
      { jwtTenant, activeTenant },
    );
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    await setJwtSessionActive(false);
    return {
      kind: 'failed',
      reason: 'JWT sem claim tenant_id (hook/membership). Continua em modo anon.',
    };
  }

  const mfa = await detectMfaRequired();
  if (mfa.required) {
    return { kind: 'mfa_required', factorId: mfa.factorId };
  }

  return { kind: 'ok' };
}

/** Login preferindo JWT; fallback RPC sem cutover. */
export async function authenticateIsoProPreferJwt(
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<PreferJwtLoginResult> {
  const requiredModule = options?.requiredModule ?? 'mobile';

  if (!isJwtAuthFeatureEnabled()) {
    const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, {
      requiredModule,
    });
    if (!rpc.ok) return rpc;
    return { ok: true, user: rpc.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
  }

  const resolved = await resolverAuthEmailSessao(login, senha, { requiredModule });

  if (resolved.ok === true && resolved.jwtReady === true) {
    let user = resolved.user ?? null;
    if (!user) {
      const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, {
        requiredModule,
      });
      if (!rpc.ok) return rpc;
      user = rpc.user;
    }
    const jwt = await signInResolvedEmail(resolved.email, senha);
    if (jwt.kind === 'ok' || jwt.kind === 'mfa_required') {
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    return { ok: true, user, authPath: 'rpc_fallback', jwt };
  }

  if (resolved.ok === true && resolved.jwtReady === false && resolved.user) {
    return { ok: true, user: resolved.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
  }

  const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, { requiredModule });
  if (!rpc.ok) {
    if (resolved.ok === false && !/em falta|does not exist|could not find/i.test(resolved.reason)) {
      return { ok: false, error: resolved.reason || rpc.error, rpcMissing: rpc.rpcMissing };
    }
    return rpc;
  }

  // Aqui `resolved` nunca tem jwtReady=true (esse caminho já retornou acima) — segue rpc_only.
  return { ok: true, user: rpc.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
}

export async function tryBootstrapJwtSessionAfterLogin(
  login: string,
  senha: string,
): Promise<JwtBootstrapOutcome> {
  if (!isJwtAuthFeatureEnabled()) return { kind: 'skipped' };
  const resolved = await resolverAuthEmailSessao(login, senha);
  if (!(resolved.ok === true && resolved.jwtReady === true)) return { kind: 'skipped' };
  return signInResolvedEmail(resolved.email, senha);
}

export async function verifyIsoProMfaChallenge(factorId: string, code: string): Promise<void> {
  if (!isIsoProJwtSessionActive()) {
    throw new Error('Sessao JWT em falta para MFA.');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new Error(challenge.error.message);
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verify.error) throw new Error(verify.error.message);
}

export async function clearIsoProJwtSession(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  await setJwtSessionActive(false);
  resetSupabaseClient();
}

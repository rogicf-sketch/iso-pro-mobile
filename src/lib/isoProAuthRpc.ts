import { isIsoProAuthRpcMissing } from './isoProAuthRpcGuards';
import { getSupabase } from './supabase';

export type IsoProAuthRpcUser = {
  id: string;
  login: string;
  nome: string;
  perfil: { id: string; nome: string };
};

type AuthRpcResponse = {
  ok?: boolean;
  error?: string;
  user?: IsoProAuthRpcUser & { permissoes?: unknown };
};

export { isIsoProAuthRpcMissing } from './isoProAuthRpcGuards';

export async function autenticarUsuarioIsoProRpc(
  tenantId: string,
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<{ ok: true; user: IsoProAuthRpcUser } | { ok: false; error: string; rpcMissing?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Nao foi possivel ligar ao Supabase.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_autenticar_usuario', {
    p_tenant_id: tenantId,
    p_login: login.trim().toLowerCase(),
    p_senha: senha.trim(),
    p_requer_modulo: options?.requiredModule ?? 'mobile',
  });

  if (error) {
    const msg = error.message ?? 'Falha na autenticacao RPC.';
    return { ok: false, error: msg, rpcMissing: isIsoProAuthRpcMissing(msg) };
  }

  const body = data as AuthRpcResponse | null;
  if (!body?.ok || !body.user) {
    return { ok: false, error: String(body?.error ?? 'Login ou senha invalidos.') };
  }

  return {
    ok: true,
    user: {
      id: String(body.user.id ?? ''),
      login: String(body.user.login ?? ''),
      nome: String(body.user.nome ?? body.user.login ?? 'Utilizador'),
      perfil: {
        id: String(body.user.perfil?.id ?? ''),
        nome: String(body.user.perfil?.nome ?? 'Perfil'),
      },
    },
  };
}

import Constants from 'expo-constants';

/**
 * Credenciais Supabase — mesmas do I.S.O PRO (browser).
 * Em produção use EXPO_PUBLIC_* via .env ou EAS Environment Variables (ambiente **preview** para o perfil preview).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function normEnv(s: string | undefined): string {
  return String(s ?? '')
    .trim()
    .replace(/\r?\n/g, '')
    .replace(/\s{2,}/g, '');
}

export const SUPABASE_URL = normEnv(process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '');
export const SUPABASE_ANON_KEY = normEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '');

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Para mensagens de erro: host do Supabase ou indicação de URL em falta no APK. */
export function getSupabaseHostHintForUser(): string {
  const u = SUPABASE_URL;
  if (!u) return 'sem URL (EXPO_PUBLIC_SUPABASE_URL não entrou no build — configure no EAS para o ambiente preview)';
  try {
    return new URL(u).host;
  } catch {
    return 'URL inválida no build';
  }
}

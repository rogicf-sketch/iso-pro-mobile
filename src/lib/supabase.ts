import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;
let clientSignature = '';

/**
 * Cliente unico por URL/chave.
 * Sempre com AsyncStorage — em React Native, sem storage a sessao JWT perde-se
 * e/ou o cliente e recriado sem token, o que parte RLS (desenhos a 0) apos login Auth.
 */
export function getSupabase(): SupabaseClient | null {
  const url = SUPABASE_URL.trim();
  const key = SUPABASE_ANON_KEY.trim();
  if (!url || !key) return null;

  const nextSignature = `${url}::${key}`;
  if (!client || clientSignature !== nextSignature) {
    client = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    clientSignature = nextSignature;
  }
  return client;
}

export function resetSupabaseClient(): void {
  client = null;
  clientSignature = '';
}

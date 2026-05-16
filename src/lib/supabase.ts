import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = SUPABASE_URL.trim();
  const key = SUPABASE_ANON_KEY.trim();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}

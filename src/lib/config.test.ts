import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

describe('config', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('hasSupabaseConfig é false quando URL ou chave faltam', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const cfg = await import('./config');
    expect(cfg.hasSupabaseConfig()).toBe(false);
  });

  it('hasSupabaseConfig é true quando URL e chave existem (com trim)', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '  https://proj.supabase.co\n';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '  chave-anon\n';
    const cfg = await import('./config');
    expect(cfg.hasSupabaseConfig()).toBe(true);
  });

  it('getSupabaseHostHintForUser devolve o host quando a URL é válida', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'k';
    const cfg = await import('./config');
    expect(cfg.getSupabaseHostHintForUser()).toBe('abc.supabase.co');
  });

  it('getSupabaseHostHintForUser indica URL em falta', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const cfg = await import('./config');
    expect(cfg.getSupabaseHostHintForUser()).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('getSupabaseHostHintForUser indica URL inválida', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'não-é-url';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'k';
    const cfg = await import('./config');
    expect(cfg.getSupabaseHostHintForUser()).toBe('URL inválida no build');
  });
});

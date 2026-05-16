/**
 * Converte string do Supabase para Date.
 * Timestamps sem sufixo `Z`/offset em ISO são tratados como UTC (comum em APIs).
 */
export function parseInstanteSupabase(iso: string): Date {
  const t = iso.trim();
  if (!t) return new Date(NaN);
  const temFuso = /[zZ]$/.test(t) || /[+-]\d{2}:?\d{2}$/.test(t);
  const pareceIsoComHora = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t);
  if (pareceIsoComHora && !temFuso) {
    return new Date(t + 'Z');
  }
  return new Date(t);
}

/** Data/hora no fuso do telemóvel (Ajustes → data e hora). */
export function formatarDataHoraLocal(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseInstanteSupabase(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
}

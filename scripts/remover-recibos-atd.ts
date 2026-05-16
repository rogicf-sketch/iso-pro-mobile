/**
 * Remove protocolos ATD do snapshot na nuvem (`iso_pro_snapshot` id=default).
 *
 * Uso (na pasta do projeto, com `.env` contendo EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY):
 *   npx tsx scripts/remover-recibos-atd.ts
 *   npx tsx scripts/remover-recibos-atd.ts --all-atd
 *   npx tsx scripts/remover-recibos-atd.ts ATD-20260411-00002 ATD-20260411-00003
 *
 * Se a política RLS bloquear updates com a chave anon, use a service role no .env
 * (variável SUPABASE_SERVICE_ROLE_KEY) ou ajuste o JSON manualmente no Supabase.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IsoSnapshotPayload } from 'iso-pro-shared';
import { ISO_PRO_DEFAULT_TENANT_ID } from '../src/lib/isoProTenantConstants';
import {
  PROTOCOLOS_ATD_20260411_TESTE,
  removerRecibosDoPayload,
} from '../src/lib/removerRecibosAtendimento';

function coletarProtocolosAtdNoPayload(payload: IsoSnapshotPayload): string[] {
  const s = new Set<string>();
  for (const h of payload.atendimentoHistorico ?? []) {
    const n = String((h as { loteNumero?: unknown }).loteNumero ?? '').trim();
    if (n.startsWith('ATD-')) s.add(n);
  }
  for (const l of payload.atendimentoLotes ?? []) {
    const n = String((l as { numero?: unknown }).numero ?? '').trim();
    if (n.startsWith('ATD-')) s.add(n);
  }
  const raw = payload as IsoSnapshotPayload & {
    atendimentos?: Array<{ numero?: unknown }>;
  };
  const atends = Array.isArray(raw.atendimentos) ? raw.atendimentos : [];
  for (const a of atends) {
    const n = String((a as { numero?: unknown }).numero ?? '').trim();
    if (n.startsWith('ATD-')) s.add(n);
  }
  return [...s].sort();
}

function getSupabase(): SupabaseClient | null {
  const url = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const anon = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const key = service || anon;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const allAtd = raw.includes('--all-atd') || raw.includes('--all');
  const argv = raw.filter((a) => !a.startsWith('-'));

  const supabase = getSupabase();
  if (!supabase) {
    console.error(
      'Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no .env',
    );
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload,updated_at')
    .eq('id', 'default')
    .eq('tenant_id', ISO_PRO_DEFAULT_TENANT_ID)
    .maybeSingle();

  if (error) {
    console.error('Leitura:', error.message);
    process.exit(1);
  }
  if (!data?.payload || typeof data.payload !== 'object') {
    console.error('Snapshot vazio ou inválido.');
    process.exit(1);
  }

  const antes = data.payload as IsoSnapshotPayload;

  const protocolos = allAtd
    ? coletarProtocolosAtdNoPayload(antes)
    : argv.length > 0
      ? argv
      : [...PROTOCOLOS_ATD_20260411_TESTE];

  if (allAtd && protocolos.length === 0) {
    console.log('Nenhum protocolo ATD- no snapshot — nada a remover.');
    return;
  }

  const { payload: depois, removidosHistorico, removidosLotes, removidosAtendimentos } =
    removerRecibosDoPayload(antes, protocolos);

  console.log('Protocolos:', protocolos.join(', '));
  console.log(
    `Removidos: histórico ${removidosHistorico}, lotes ${removidosLotes}, atendimentos ${removidosAtendimentos}`,
  );

  if (
    removidosHistorico === 0 &&
    removidosLotes === 0 &&
    removidosAtendimentos === 0
  ) {
    console.log('Nada a gravar (nenhuma entrada encontrada com esses protocolos).');
    return;
  }

  const { error: upErr } = await supabase.from('iso_pro_snapshot').upsert(
    {
      id: 'default',
      tenant_id: ISO_PRO_DEFAULT_TENANT_ID,
      payload: depois,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id,tenant_id' },
  );

  if (upErr) {
    console.error('Gravação:', upErr.message);
    process.exit(1);
  }

  console.log('Snapshot atualizado com sucesso.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

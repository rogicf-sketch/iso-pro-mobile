# APK Campo 1.0.31 (build 32)

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Supabase (obrigatorio para dados moveis)

SQL Editor, nesta ordem:

1. `20260705140000_iso_pro_patch_snapshot_merge_keys.sql`
2. `20260705170000_iso_pro_registrar_atendimento_mobile.sql`

## O que mudou

- Removido aviso «gravacao lenta» (era diagnostico, nao solucao).
- App passa a usar RPC **iso_pro_registrar_atendimento_mobile** (payload minimo na rede).
- Pend. de atend. verde (desde 1.0.30).

## Verificar

- Inicio: **1.0.31 (Android 32)**
- Atendimento em 5G: meta **5–10 s** (com migrations); Wi-Fi tipicamente **3–5 s**

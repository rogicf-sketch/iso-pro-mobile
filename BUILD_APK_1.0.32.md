# APK Campo 1.0.32 (build 33)

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Supabase (obrigatório para performance em dados móveis)

SQL Editor, nesta ordem:

1. `20260705140000_iso_pro_patch_snapshot_merge_keys.sql`
2. `20260705170000_iso_pro_registrar_atendimento_mobile.sql`
3. `20260705180000_iso_pro_atendimento_comandos_arquitetura.sql`

## O que mudou

- **Gravação optimista:** UI responde na hora; sync com a nuvem em segundo plano.
- **Boot leve:** atendimento não baixa mais os ~1200 desenhos de uma vez — só o necessário (RPC por código ou por número).
- **Comandos idempotentes:** `iso_pro_submit_atendimento_comando` + fila offline no telemóvel.
- Faixa «Nuvem» mostra sync em curso ou fila offline.

## Verificar

- Início: **1.0.32 (Android 33)**
- Atendimento em 5G: meta **2–5 s** de sync (com as 3 migrations); Wi‑Fi tipicamente **1–3 s**
- Ecrã de atendimento: «Desenhos N carreg.» aumenta ao escanear código ou abrir desenho

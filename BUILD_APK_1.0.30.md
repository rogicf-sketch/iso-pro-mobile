# APK Campo 1.0.30 (build 31)

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Checklist (3 passos)

1. Fechar Explorador em `C:\IPB`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1`
3. Instalar `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.30.apk`

## O que mudou

- **Atendimento:** quadro «Pend. de atend.» em verde (destaque visual).
- **Atendimento:** aviso se a nuvem ainda usa gravacao lenta (falta migration merge_keys).
- **Atendimento:** menos trabalho no telemovel ao dar baixa por codigo (clone so do desenho alterado).

## Supabase (gravacao rapida)

Aplicar no SQL Editor:

`iso-pro-desktop/supabase/migrations/20260705140000_iso_pro_patch_snapshot_merge_keys.sql`

Sem isto, cada atendimento pode levar 15–30 s em dados moveis.

## Verificar no telemovel

- Inicio: **1.0.30 (Android 31)**.
- Pend. de atend. em verde na grelha de materiais.
- Apos migration Supabase: gravacao em poucos segundos (5G).

# APK Campo 1.0.29 (build 30)

Checklist rapido e troubleshooting: **[BUILD_APK.md](./BUILD_APK.md)**.

## Checklist (3 passos)

1. Fechar Explorador em `C:\IPB`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1`
3. Instalar `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.29.apk` apos **BUILD SUCCESSFUL**.

## Build local (off-path)

Build normal (reutiliza `android\` na cópia — mais rápido):

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

**Rebuild nativo** (só se mudou plugins/permissões):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1 -ForcePrebuild
```

Saída em `dist\android\`:
- `iso-pro-mobile-release-LATEST.apk`
- `iso-pro-mobile-release-YYYYMMDD-HHmmss.apk`
- `app-release.apk`

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.29.apk`

## Supabase (obrigatório para gravação rápida)

Aplicar a migration antes de testar atendimento em dados móveis:

`iso-pro-desktop/supabase/migrations/20260705140000_iso_pro_patch_snapshot_merge_keys.sql`

Sem isto, o app usa fallback (patch completo) — funciona, mas mais lento.

## O que mudou nesta versão

### Atendimento — performance
- Patch **delta** na nuvem (só documento alterado + linhas novas de histórico/lote).
- Menos clone do snapshot; histórico sem cópia repetida no loop.
- Gravação mais rápida em **dados móveis** (com migration aplicada).

### Atendimento — ecrã
- Unidade (**PC**, etc.) em **todos** os quadros (Projeto, Atendido, Pend., Estoque).
- Números mais compactos (≈ tamanho do código).
- Grelha 2×2 alinhada nos quadros por linha de material.

### Inventário
- Scan: QR `COD:…` e código de barras 1D (hash) — corrige «Código não pertence a este inventário».

## Erro «Filename longer than 260 characters»

O Gradle/NDK (New Architecture) exige caminho **curto**. O script usa por defeito **`C:\IPB\mob`**. Nao use subpastas longas tipo `work-20260705-161029\iso_pro_mobile`.

Se ainda falhar, defina uma pasta ainda mais curta: `-BuildRoot D:\B`

## Pasta de build (caminho curto)

Por defeito usa **`C:\IPB\mob`** (evita erro «Filename longer than 260 characters» no Gradle/NDK).

Pode definir outra pasta curta:
```powershell
$env:ISO_PRO_ANDROID_BUILD_ROOT = 'D:\B'
```

## Se der erro «pasta em uso» em android\

1. Feche o **Explorador de Ficheiros** na pasta `C:\IPB` (ou `C:\ISO-PRO-BUILD` se ainda usar a antiga).
2. Apague: `Remove-Item -Recurse -Force C:\IPB\mob\android -ErrorAction SilentlyContinue`
3. Volte a correr o script.

## Verificar no telemóvel

- Início: **1.0.29 (Android 30)**.
- Atendimento: quadros com unidade; gravação em ~poucos segundos (5G + migration).
- Inventário: scan de etiqueta com código legível no planejamento.

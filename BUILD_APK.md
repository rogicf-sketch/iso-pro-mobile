# Gerar APK Android (Campo)

Guia reutilizavel para qualquer revisao. Detalhes por versao: `BUILD_APK_1.0.XX.md`.

## Checklist (3 passos)

1. **Fechar** o Explorador de Ficheiros em `C:\IPB` (e Android Studio, se aberto).
2. **Correr** o build (copia off-path; nao compilar na pasta com acentos):
   ```powershell
   cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk-release.ps1
   ```
3. **Confirmar** `BUILD SUCCESSFUL` e instalar **`dist\android\iso-pro-mobile-release-<versao>.apk`** (ex.: `iso-pro-mobile-release-1.0.62.apk`). Nada e copiado para Downloads.

**Nao usar** `app-release.apk` generico — o nome nao traz a revisao. Ver `dist\android\ULTIMO-BUILD.json`.

Avisos amarelos (npm deprecated, Kotlin, manifest) sao normais. So pare se aparecer **BUILD FAILED** ou erro vermelho no PowerShell.

---

## Antes do build

Atualize a versao em `app.config.ts` e `package.json` (`version` + `versionCode` Android).

Opcional, se mudou codigo partilhado:

```powershell
.\scripts\sync-vendor-iso-pro-shared.ps1
```

Testes rapidos:

```powershell
npm test
```

## Comando principal

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk-release.ps1
```

**Rebuild nativo** (plugins, permissoes, `app.config` nativo):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk-release.ps1 -ForcePrebuild
```

**Saltar npm** (copia recente em `C:\IPB`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk-release.ps1 -SkipInstall
```

## Onde fica o APK (pasta do sistema — nunca Downloads)

```
iso_pro_mobile\dist\android\
  iso-pro-mobile-release-<versao>.apk   ← actual
  iso-pro-mobile-release-LATEST.apk     ← atalho = mesma build
  ULTIMO-BUILD.json
  versoes-anteriores\                   ← builds antigos arquivados
```

| Local | Ficheiro |
|-------|----------|
| Actual (principal) | `dist\android\iso-pro-mobile-release-<versao>.apk` |
| Actual (atalho) | `dist\android\iso-pro-mobile-release-LATEST.apk` |
| Arquivo (timestamp) | `dist\android\versoes-anteriores\iso-pro-mobile-release-YYYYMMDD-HHmmss.apk` |
| Metadados | `dist\android\ULTIMO-BUILD.json` |

O script `publish-apk-dist.ps1` arquiva sozinho as versoes antigas e **nao** grava em Downloads. Copia opcional so com `-AlsoCopyToDownloads`.

Build ja compilado? Só publicar nomes com revisao:

```powershell
npm run build:android:publish-apk
```

A pasta `C:\IPB` e so oficina de compilacao. O codigo mestre continua na pasta com acentos.

## Porque off-path?

O caminho `C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\...` tem caracteres nao-ASCII. Gradle/NDK falham ou geram erros estranhos ai. O script copia para **`C:\IPB\mob`** (caminho curto, sem acentos).

## Problemas comuns

### «Filename longer than 260 characters»

Caminho demasiado longo para CMake/ninja. O script ja usa `C:\IPB\mob`. Se falhar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-apk-release.ps1 -BuildRoot D:\B
```

Nao use pastas longas tipo `C:\ISO-PRO-BUILD\work-...\iso_pro_mobile`.

### «Pasta android\ em uso» / sem gradlew

1. Feche Explorador em `C:\IPB`.
2. Apague a pasta nativa e volte a correr:
   ```powershell
   Remove-Item -Recurse -Force C:\IPB\mob\android -ErrorAction SilentlyContinue
   ```
3. O script copia `android\` da pasta mestre ou corre `expo prebuild`.

### Outra pasta de build

```powershell
$env:ISO_PRO_ANDROID_BUILD_ROOT = 'D:\B'
```

## Supabase (performance atendimento em rede movel)

Execute **nesta ordem** no SQL Editor do Supabase:

1. `iso-pro-desktop/supabase/migrations/20260705140000_iso_pro_patch_snapshot_merge_keys.sql`
2. `iso-pro-desktop/supabase/migrations/20260705170000_iso_pro_registrar_atendimento_mobile.sql`

O app (1.0.31+) usa a funcao 2 para enviar **so o desenho alterado** (nao 1200+ documentos). Sem isto, dados moveis continuam lentos.

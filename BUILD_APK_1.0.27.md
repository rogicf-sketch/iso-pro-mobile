# APK Campo 1.0.27 (build 28)

## Build local (off-path)

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

Saída em `dist\android\`:
- `iso-pro-mobile-release-LATEST.apk`
- `iso-pro-mobile-release-YYYYMMDD-HHmmss.apk`
- `app-release.apk`

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.27.apk`

## O que mudou nesta versão

- **Atendimento (scan):** ao escanear código de material, a lista de desenhos mostra **só** os que ainda têm «Disponível p/ atend.» > 0; desenhos já atendidos deixam de ficar abertos ou reaparecer na pesquisa.

## Verificar no telemóvel

- Início: **1.0.27 (Android 28)**.
- Atendimento: escanear um código com vários desenhos — só aparecem os com pendência; desenho com 0 não abre sozinho nem fica selecionado após baixa.

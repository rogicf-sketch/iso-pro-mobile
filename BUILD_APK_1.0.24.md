# APK Campo 1.0.24 (build 25)

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

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.24.apk`

## O que mudou nesta versão

- CNPJ no rodapé do recibo (formato igual ao PC, fallback `66.234.531/0001-57`).
- Logo padrão I.S.O PRO embutido no recibo (chapa verde, igual desktop).
- Logo personalizado: vem do snapshot após gravar Configurações no PC e «Carregar dados da nuvem» no telemóvel.

## Verificar no telemóvel

- Ecrã login: **Build 1.0.24 (25)**.
- Recibo: CNPJ no rodapé + logo igual ao PC.
- Após alterar logo no PC: gravar Configurações → no telemóvel «Carregar dados da nuvem» → novo recibo.

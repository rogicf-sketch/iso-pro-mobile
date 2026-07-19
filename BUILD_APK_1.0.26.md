# APK Campo 1.0.26 (build 27)

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

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.26.apk`

## O que mudou nesta versão

- **Performance:** leitura/gravação por fatias do snapshot (Conferência, Atendimento, Consulta, Inventário) + patches parciais na nuvem.
- **Conferência:** carrega a nuvem ao abrir; lista automática de NFs **aguardando conferência** (sem precisar filtrar NF).
- **Polimento visual:** cabeçalhos, faixa de sync, cartões e blocos Início / Atendimento / Consulta / Inventário.
- **Inventário PC→mobile:** requer desktop **0.1.64+** com fix de sync (gravar inventário no PC com contagem mobile).

## Verificar no telemóvel

- Início: **1.0.26 (Android 27)**.
- Conferência: ao abrir, ver lista «Aguardando conferência (N)» após sync.
- Atendimento / Inventário: «Carregar nuvem» mais rápido com muito planejamento.

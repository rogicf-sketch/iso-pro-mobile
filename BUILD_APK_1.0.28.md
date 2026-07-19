# APK Campo 1.0.28 (build 29)

## Build local (off-path)

Build normal (reutiliza `android\` na cópia — mais rápido):

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

**Rebuild nativo alinhado ao `app.config.ts`** (apaga e regera `android\` com `expo prebuild` — use após mudar plugins, permissões ou versão):

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1 -ForcePrebuild
```

Saída em `dist\android\`:
- `iso-pro-mobile-release-LATEST.apk`
- `iso-pro-mobile-release-YYYYMMDD-HHmmss.apk`
- `app-release.apk`

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.28.apk`

## O que mudou nesta versão

### Inventário (Fase 1 + Fase 2)
- **Iniciar / Continuar contagem** na lista de inventários abertos.
- Contagem mobile: **pesquisa** (código, descrição, local), **scan**, qtd + **local da contagem**, rascunho local.
- **Saldo operacional** por linha: Recebido · Atendido · Estoque (alinhado ao atendimento).
- **Pesquisa por NF/romaneio** — filtra itens cujo material veio na nota.
- Divergências vs saldo do inventário e vs estoque operacional.
- PC: tabela resumo com **Local contagem** e **Estoque actual**; CSV com coluna `local_contagem`.

### Atendimento
- **Guardar** mais rápido em dados móveis (snapshot em memória).
- Recibo WhatsApp reformatado; pílulas **Projeto / Atendido / Pend. de atend. / Estoque** mais visíveis.
- Botão **Imprimir** no recibo com contraste legível.

## Verificar no telemóvel

- Início: **1.0.28 (Android 29)**.
- Inventário: abrir inventário aberto → ver Recebido/Atendido/Estoque; pesquisar por NF.
- Atendimento: confirmar pílulas e tempo de gravação.

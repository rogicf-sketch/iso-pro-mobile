# APK Campo 1.0.25 (build 26)

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

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.25.apk`

## O que mudou nesta versão

- **Fila offline:** sincronização automática ao abrir o app e ao voltar ao primeiro plano (todas as abas, incluindo Conferência).
- **Flush inteligente:** re-aplica alterações offline sobre o snapshot fresco da nuvem (menos conflitos e perda de dados).
- **Atendimento multi-doc:** validação por desenho, `documentoNumero` por item, recibo com coluna Documento.
- Alinhado ao desktop **0.1.64** (estorno e export ZIP existem só no PC/web).

## Verificar no telemóvel

- Ecrã login / Início: **Build 1.0.25 (26)**.
- Offline: fazer baixa ou conferência sem rede → badge de fila no Início → voltar online → puxar para atualizar no Início ou reabrir app → fila deve zerar.
- Recibo multi-doc: coluna Documento quando o protocolo agrupa vários desenhos.

## Escopo deliberado (Campo vs PC)

| Recurso | Mobile | PC/Web |
|---------|--------|--------|
| Retirada / leitor | Sim | Sim |
| Estorno + log Excel | Não | Sim |
| RIR / RNC / Etiquetas | Não | Sim |
| Conferência NF | Sim | Sim |

Estorno e devolução ao estoque são **apenas no PC ou na web** (auditoria e perfil admin).

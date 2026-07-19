# APK Campo 1.0.33 (build 34) — correcção sync

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## O que foi corrigido (1.0.33)

- **Erro «Aplique migrations Supabase»** — removido; a app volta a gravar via `iso_pro_patch_snapshot` quando as RPC novas ainda não existem.
- **Baixa «fantasma»** — se a sync falhar, a baixa é **desfeita** no telemóvel (não fica «já atendido» localmente).
- **Aviso «0 materiais»** — removido (cadastro vazio é normal; códigos vêm das linhas do desenho).
- **Contadores** — «Desenhos: sob demanda» + dica explicativa.

## Supabase (recomendado para performance)

SQL Editor, nesta ordem (opcional mas acelera muito em 5G):

1. `20260705140000_iso_pro_patch_snapshot_merge_keys.sql`
2. `20260705170000_iso_pro_registrar_atendimento_mobile.sql`
3. `20260705180000_iso_pro_atendimento_comandos_arquitetura.sql`

**Sem as migrations a app funciona** (fallback patch); **com migrations** fica mais rápida.

## Gerar APK

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

## Verificar

- Início: **1.0.33 (Android 34)**
- Atendimento: após «Dar baixa», **não** deve aparecer popup de migrations
- Se falhar rede: fila offline; se falhar servidor: baixa revertida + mensagem clara

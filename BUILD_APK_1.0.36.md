# APK Campo 1.0.36 (build 37) — busca de desenhos no atendimento

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Corrigido

1. **Desenho não encontrado** — a busca «AQ», «SPD», etc. falhava porque a RPC na nuvem só aceitava número **exacto**.
2. **Busca parcial na nuvem** — nova RPC `iso_pro_search_documentos_planejamento` (segmentos do número).
3. **Fallback** — se a RPC ainda não estiver aplicada, carrega a fatia `documentos[]` do snapshot e filtra localmente.

## Migration Supabase (recomendada)

`iso-pro-desktop/supabase/migrations/20260705200000_iso_pro_search_documentos_planejamento.sql`

Sem ela, o fallback funciona mas pode demorar mais na 1.ª busca.

## Gerar APK

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

## Verificar

- **1.0.36 (Android 37)** no Início
- Atendimento → «Desenho de referência» → digitar `AQ` → **Buscar documento** → lista ou abre o desenho correto

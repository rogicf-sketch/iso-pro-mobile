# APK Campo 1.0.38 (build 39) — lista de desenhos mais rápida no atendimento

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Melhorado

1. **Prefetch em background** — ao abrir Atendimento, a lista «Todos os desenhos neste telemóvel» começa a carregar logo (em paralelo com o boot leve).
2. **RPC resumo leve** — `iso_pro_list_documentos_planejamento_resumo` traz ~1200 cabeçalhos sem `itens[]` (muito mais rápido que a fatia completa).
3. **Fallback** — se a RPC ainda não estiver aplicada, usa a fatia `documentos[]` do snapshot (como antes, mas já no prefetch automático).
4. **Inventário aberto (1.0.37)** — scan/pesquisa inclui material do cadastro; saldo zero permitido.

## Migrations Supabase (recomendadas)

1. `20260705200000_iso_pro_search_documentos_planejamento.sql` (busca parcial)
2. `20260705210000_iso_pro_list_documentos_planejamento_resumo.sql` (**prefetch rápido**)

Sem a migration de resumo, o fallback funciona mas a 1.ª carga pode demorar mais.

## Gerar APK

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

## Verificar

- **1.0.38 (Android 39)** no Início
- Atendimento → após «Carregar dados da nuvem», ver «Desenhos: a carregar…» → lista com contagem (ex. 1201) em segundos
- Toque num desenho da lista → abre com itens (lazy load na nuvem)

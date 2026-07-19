# APK Campo 1.0.35 (build 36) — protocolo ATD único

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Corrigido

1. **Colisão de protocolo** — mobile e PC deixam de gerar o mesmo `ATD-YYYYMMDD-NNNNN` com sequências locais desatualizadas.
2. **Reserva na nuvem** — antes da 1.ª baixa de uma sessão nova, a app reserva protocolo via RPC `iso_pro_reservar_numero_atendimento`.
3. **Sequência local segura** — fallback offline considera o máximo já usado no snapshot (histórico + lotes + atendimentos).
4. **PC agrupa por sessão** — histórico agrupa por `loteNumero::loteId`, não mistura sessões diferentes no mesmo número.

## Pré-requisito Supabase

Aplicar a migration:

`iso-pro-desktop/supabase/migrations/20260705190000_iso_pro_reservar_numero_atendimento.sql`

(junto com as migrations anteriores desta série, se ainda não aplicadas)

## Gerar APK

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

## Verificar

- **1.0.35 (Android 36)** no Início
- Nova sessão de atendimento → protocolo diferente do último ATD do dia (mesmo após atendimento no PC)
- Baixa por código **e** por linhas do documento usam a mesma reserva na sessão
- No PC: dois atendimentos com o mesmo número mas `loteId` distinto aparecem como **dois lotes** separados

## Nota sobre dados antigos

O `ATD-20260705-00073` já misturado na nuvem continua no histórico; novos atendimentos não colidem. Corrigir o registo antigo manualmente no PC se necessário (estorno ou ajuste).

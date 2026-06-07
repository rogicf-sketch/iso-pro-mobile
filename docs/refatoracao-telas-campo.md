# Refatoração das telas mobile (roadmap)

Telas alvo: `app/(tabs)/atendimento.tsx`, `conferencia.tsx`, `consulta.tsx`.

## Fase 1 (feito)

- Gravações críticas usam `commitDefaultSnapshotWriteResilient` + fila offline.
- Testes de domínio permanecem em `src/lib/`.

## Fase 2 (próximo sprint)

1. Extrair hooks: `useAtendimentoSnapshot`, `useConferenciaSnapshot`.
2. Componentes puros: lista de itens, teclado numérico, diálogos.
3. Testes Vitest nos hooks (sem RNTL na primeira iteração).

## Fase 3

- Detox ou Maestro em CI com credenciais de staging.

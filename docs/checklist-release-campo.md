# Checklist de release — I.S.O PRO Campo (mobile)

Use antes de distribuir APK/EAS a obra. Tempo estimado: **15–20 minutos** (1 dispositivo + 1 PC com a mesma nuvem).

## Pré-requisitos

- [ ] Supabase acessível (mesmo projecto que o desktop/web).
- [ ] Dispositivo **autorizado** no desktop: Módulo **Dispositivos Mobile** → estado *Autorizado*.
- [ ] Utilizador de teste com permissões de conferência e atendimento.
- [ ] Versão do app: anotar `version` em `package.json` (ex.: 1.0.20) e `versionCode` em `app.config.ts`.

---

## 1. Ligação e snapshot

- [ ] Abrir o app → login OK.
- [ ] Ecrã inicial carrega sem “Supabase não configurado”.
- [ ] Puxar para atualizar / reabrir app → dados recentes do PC aparecem (ex.: material ou NF criada no desktop).

---

## 2. Conferência (crítico)

- [ ] Buscar NF de teste (número ou romaneio).
- [ ] Preencher **qtd conferida** em 2 linhas (uma parcial, uma zero + **observação**).
- [ ] **Guardar quantidades conferidas** na nuvem → mensagem de sucesso.
- [ ] No **PC**: mesma NF mostra divergências / observações.
- [ ] **Destravar** no PC (se aplicável) → no telemóvel deve mostrar **“Conferência em correção”** (ou pendente) **com quantidades mantidas**.
- [ ] Corrigir 1 linha no PC → gravar → mobile após sync reflete a alteração.
- [ ] **Finalizar conferência** no mobile → estado “Conferência concluída”.

---

## 3. Atendimento

- [ ] Ler código (teclado ou câmara/QR `COD:...` de etiqueta).
- [ ] Saldo coerente com o PC (material com recebimento conferido).
- [ ] Dar baixa parcial num desenho → **guardar na nuvem**.
- [ ] PC: planejamento atualizado (`quantidadeAtendida`).
- [ ] Sair do separador com sessão aberta → app pede confirmação (não perder comprovante).

---

## 4. Inventário e consulta (rápido)

- [ ] Abrir um inventário existente ou criar rascunho → guardar.
- [ ] Consulta: buscar código → resultado plausível.

---

## 5. Conflito e rede fraca

- [ ] Com NF aberta no mobile, gravar alteração **no PC** na mesma obra → mobile ao guardar deve avisar **conflito** ou pedir recarregar (não sobrescrever em silêncio).
- [ ] Modo avião breve → mensagem de erro compreensível (não crash).

---

## 6. Regressão visual

- [ ] Textos de ajuda (se activos nas configurações do desktop) aparecem nos módulos.
- [ ] Tema escuro legível em exterior (brilho médio).

---

## Após release

- [ ] Comunicar versão à equipa.
- [ ] Manter 1 dispositivo de reserva autorizado.
- [ ] Se algo falhar: anotar hora, utilizador, NF/código, captura de ecrã → Sentry (se configurado) ou suporte.

---

## Automático (CI local antes do build)

```bash
cd iso_pro_mobile
npm run ci
```

Deve passar: typecheck, testes Vitest, lint, audit high.

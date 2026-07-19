# Checklist homologação — Mobile 1.0.52 (10/10)

Use após instalar `iso-pro-mobile-release-1.0.52.apk` com PC **0.1.78+** e Supabase actualizado.

Tempo estimado: **30–45 minutos** (1 operador + 1 administrador TI).

---

## Pré-requisitos

- [ ] APK confirma **1.0.52 (Android 53)** no ecrã Início.
- [ ] PC **0.1.78** ligado à mesma nuvem.
- [ ] Dispositivo **autorizado** em Dispositivos mobile.
- [ ] Migration `20260707200000` aplicada (telemetria fila).

---

## A. Caminho único de escrita (comando + fila)

- [ ] Dar baixa **online** → sucesso imediato; PC reflecte em ≤30 s.
- [ ] Modo avião → dar baixa → mensagem **«Guardado (pendente de sincronização)»** ou fila visível.
- [ ] Voltar online → Início mostra fila a descer; alerta «Sincronizado» se aplicável.
- [ ] **Dispositivos mobile → Sincronização**: dispositivo aparece com fila >0 durante offline; volta a 0 após sync.

---

## B. Prova sessão = nuvem = PC (10 baixas)

Registar **10 baixas** (materiais/desenhos diferentes). Para cada uma:

| # | Mobile regista | PC saldo OK | Histórico OK | Recibo OK |
|---|----------------|-------------|--------------|-----------|
| 1 | [ ] | [ ] | [ ] | [ ] |
| 2 | [ ] | [ ] | [ ] | [ ] |
| 3 | [ ] | [ ] | [ ] | [ ] |
| 4 | [ ] | [ ] | [ ] | [ ] |
| 5 | [ ] | [ ] | [ ] | [ ] |
| 6 | [ ] | [ ] | [ ] | [ ] |
| 7 | [ ] | [ ] | [ ] | [ ] |
| 8 | [ ] | [ ] | [ ] | [ ] |
| 9 | [ ] | [ ] | [ ] | [ ] |
| 10 | [ ] | [ ] | [ ] | [ ] |

**Critério:** 10/10 sem divergência de quantidade atendida.

---

## C. Conflito OCC (hotspot humano)

- [ ] Operador A e B no **mesmo material/desenho** — um guarda primeiro; o segundo vê **«Conflito — recarregue a lista»**.
- [ ] Após «Carregar dados da nuvem», segundo operador consegue baixa sem duplicar.

---

## D. Auditoria admin (PC)

- [ ] **Dispositivos mobile → Sincronização**: comandos com origem **mobile**, colunas ATDs/Estornos preenchidas.
- [ ] Nenhum comando **Pendente** >1 h sem acção (reprocessar se necessário).

---

## E. Testes automáticos (TI — staging/produção)

```powershell
cd iso-pro-desktop
npm run test:load:atendimento:hotspot -- --operators 10
npm run test:load:atendimento:canteiro -- --mode avalanche --operators 20
npm run test:load:atendimento:canteiro -- --mode flush-burst --operators 20
```

- [ ] Hotspot: 100% sucesso (ou conflitos resolvidos por retry).
- [ ] Avalanche + flush-burst: ≥95% sucesso, zero duplicatas no histórico.

---

## F. Regressão rápida

- [ ] Conferência: guardar qty → PC reflecte.
- [ ] Inventário: guardar contagem.
- [ ] Consulta: buscar código.

---

## Assinaturas

| Papel | Nome | Data | OK |
|-------|------|------|-----|
| Operador campo | | | [ ] |
| Admin TI | | | [ ] |
| Gestão obra | | | [ ] |

---

## CI antes do build

```bash
cd iso_pro_mobile
npm test
npm run build:android:local-apk
```

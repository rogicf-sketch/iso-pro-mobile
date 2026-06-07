# I.S.O PRO — App Campo (Android / iOS)

Cliente **Expo + TypeScript** para conferência, atendimento, consulta e vínculo do aparelho com o I.S.O PRO.

Este repositório convive no mesmo monorepo local que **`iso-pro-desktop`**, **`iso-pro-shared`** e os scripts SQL em **`supabase/`** (na raiz do desktop ou cópia da pasta `supabase` — são só migrações SQL, não são a app móvel).

## Requisitos

- **Node.js ≥ 22** (ver `.nvmrc`). Alinhamos com o projeto desktop para evitar surpresas entre máquinas e CI.

## Instalação

Na **raiz deste projeto** (`iso_pro_mobile`):

```powershell
npm ci
npx expo start
```

Para desenvolvimento com rede local estável: `npm run start:phone`. Para rede difícil: `npm run start:tunnel`.

## Variáveis Supabase

Há um modelo em `.env.example`. Copie para `.env` na raiz (o `.gitignore` ignora `.env`):

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
```

## Builds Android

O output é **APK** (perfil `preview`) ou **AAB** (perfil `production`) via EAS — não existe ficheiro `.exe`; builds Windows nativas estão no projeto **desktop** separado.

### APK local (Windows, pasta sem acentos)

`npm run build:android:local-apk` corre `scripts/build-android-off-path.ps1`: compila **`iso-pro-shared`** na pasta mestre, copia o monorepo para `C:\ISO-PRO-BUILD`, e gera `dist\android\app-release.apk`.

Se alterou o pacote `iso-pro-shared` e o app ainda mostra erros de validação antigos, confirme que o script terminou com sucesso ou execute manualmente `npm run build` dentro de `iso-pro-shared` antes do APK.

Em desenvolvimento com `expo start`, após atualizar `iso-pro-shared`: `npm run build --prefix ../iso-pro-shared` e reinicie o Metro com cache limpo (`npx expo start --clear`).

## Qualidade (local / CI)

- `npm run typecheck` — TypeScript (`tsc --noEmit`)
- `npm run test` — Vitest (`src/**/*.test.ts`)
- `npm run lint` — ESLint (Expo), **falha se houver avisos** (`--max-warnings 0`)
- `npm run ci` — typecheck + testes + lint + `npm audit` (nível high)

Com GitHub Actions, o fluxo em [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre `npm ci` e `npm run ci` em pushes/PRs para `main` ou `master` (e manualmente em **Actions → CI → Run workflow**). O job usa `vendor/iso-pro-shared` (cópia do contrato Zod) ou a pasta irmã `../iso-pro-shared` no monorepo local.

Depois de alterar `iso-pro-shared` na pasta mestre, atualize o vendor antes de commitar o mobile:

```powershell
.\scripts\sync-vendor-iso-pro-shared.ps1
```

## Release para obra (APK / EAS)

Antes de distribuir build a campo (**versão atual: 1.0.22**, `android.versionCode` **23** em `app.config.ts`):

1. `npm run ci` nesta pasta.
2. Seguir o checklist manual: [`docs/checklist-release-campo.md`](docs/checklist-release-campo.md) (sync, conferência com destravar, atendimento, recibos — ~15–20 min com telemóvel + PC na mesma nuvem).
3. Gerar APK/AAB (`build:android:preview` / EAS) e confirmar a versão no ecrã de login do app.

## E2E mobile (Maestro)

Fluxos em [Maestro](https://maestro.mobile.dev/) na pasta **`.maestro/`** — ver [`.maestro/README.md`](.maestro/README.md). Smoke sem credenciais: `maestro test .maestro/login-validacao.yaml`.

## SQL necessário no Supabase

Use as **migrações** do repositório **`iso-pro-desktop`** em `supabase/migrations/`, por ordem de nome:

1. `20260205120000_iso_pro_multi_tenant.sql`
2. `20260207130000_iso_pro_auth_membership_auto_sync.sql`
3. `20260208120000_perfis_acesso_codigo_unique_per_tenant.sql`
4. `20260503120000_iso_pro_usuarios_colaborador_id.sql`
5. `20260503120100_iso_pro_usuario_admin_rpcs.sql`

A migração multi-tenant inclui tabelas de snapshot, dispositivos mobile e cadastros partilhados com o desktop. Com isso, o módulo **Dispositivos Mobile** no desktop consegue listar, autorizar, bloquear e revogar aparelhos; o app campo persiste vínculo em `dispositivos_mobile` e logs em `mobile_logs_acesso`.

Sem essas migrações, o app mobile continua em modo local, mas vínculo, bloqueio e autorização remotos não ficam persistidos no Supabase.

## Abrir no Cursor / VS Code

**File → Open Folder** → escolha a pasta **`iso_pro_mobile`** (a raiz deste repositório).

## Observabilidade (opcional)

- **`EXPO_PUBLIC_SENTRY_DSN`**: SDK **`@sentry/react-native`** (`initSentryMobile`, `Sentry.wrap` no layout). Após pull, correr `npm install` no mobile e commitar o lockfile — ver `../iso-pro-desktop/docs/sentry-sdk-opcional.md`.
- **`src/lib/errorReporting.ts`**: ponto único para erros; consola continua a ser usada para diagnóstico local.


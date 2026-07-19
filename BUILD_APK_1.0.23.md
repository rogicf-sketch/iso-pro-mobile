# APK Campo 1.0.23 (build 24)

## Build local (off-path, usado nesta versão)

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

Saída em `dist\android\`:
- `iso-pro-mobile-release-LATEST.apk`
- `iso-pro-mobile-release-YYYYMMDD-HHmmss.apk`
- `app-release.apk`

Cópia para instalar: `%USERPROFILE%\Downloads\iso-pro-mobile-release-1.0.23.apk`

## EAS (alternativa)

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
.\scripts\sync-vendor-iso-pro-shared.ps1
npm run ci
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Confirme no [expo.dev](https://expo.dev) que o perfil **preview** tem:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- (opcional) `EXPO_PUBLIC_ISO_PRO_TENANT_ID` para outra empresa

### Se falhar em «Bundle JavaScript»

Causas comuns (já corrigidas no repo):
1. **`iso-pro-shared` fora do upload** — dependência deve ser `file:./vendor/iso-pro-shared` (não `../iso-pro-shared`).
2. **`vendor/iso-pro-shared/dist` ausente no build off-path** — correr `sync-vendor-iso-pro-shared.ps1` antes; o script de build não deve excluir `vendor/.../dist`.
3. **Upload gigante (~750 MB)** — `.easignore` deve excluir `android/.gradle/`, `android/build/`, `android/app/build/`.
4. Ver log completo no link do build no expo.dev → fase **Bundle JavaScript**.

## O que mudou nesta versão

- Recibo de atendimento padronizado com o PC/web (layout, tabela, assinaturas, cabeçalho com logo à esquerda e título centrado).
- Layout partilhado em `src/lib/reciboAtendimentoLayout.ts` (regenerável via `scripts/gen-recibo-layout.mjs`).

## Verificar no telemóvel

- Ecrã login mostra **Build 1.0.23 (24)**.
- Login com utilizador que tem módulo **Mobile**.
- Atendimento → finalizar sessão → imprimir/visualizar recibo (comparar com PDF do PC).
- Atendimento: mensagem «pendente de sincronização» quando offline.

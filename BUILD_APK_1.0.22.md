# APK Campo 1.0.22 (build 23)

## EAS (recomendado)

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
2. **Upload gigante (~750 MB)** — `.easignore` deve excluir `android/.gradle/`, `android/build/`, `android/app/build/`.
3. Ver log completo no link do build no expo.dev → fase **Bundle JavaScript**.

## Se `unable to verify the first certificate`

- Proxy corporativo / antivírus a interceptar HTTPS: adicionar certificado raiz ou testar outra rede.
- Ou build local com Android Studio após `npx expo prebuild`.

## Verificar no telemóvel

- Ecrã login mostra **Build 1.0.22 (23)**.
- Login com utilizador que tem módulo **Mobile**.
- Atendimento: mensagem «pendente de sincronização» quando offline.

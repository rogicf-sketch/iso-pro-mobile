import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

/** Fundo alinhado ao logo (azul muito escuro). */
const brandBackground = '#0B1426';

const config: ExpoConfig = {
  name: 'I.S.O PRO Campo',
  slug: 'iso-pro-mobile',
  /** Organizacao Expo (EAS); obrigatorio para builds na nuvem com conta de equipa. */
  owner: 'isopros-organization',
  /** Subir quando gerar APK/AAB novo (confirma no telemóvel que não é build antigo). */
  version: '1.0.20',
  orientation: 'portrait',
  scheme: 'isopromobile',
  userInterfaceStyle: 'automatic',
  /** Quadrado 1024² — gerado com `npm run generate:icon` (não usar logo.png horizontal aqui). */
  icon: './assets/app-icon.png',
  /**
   * Splash nativo: cor de marca + imagem quadrada (obrigatório no Android: sem `image` o prebuild
   * não gera `splashscreen_logo` e o Gradle falha em `:app:processReleaseResources`).
   * O ecrã React pode continuar a ser o único sítio com o logo “completo” se escondermos cedo.
   */
  splash: {
    backgroundColor: brandBackground,
    resizeMode: 'contain',
    image: './assets/app-icon.png',
  },
  android: {
    package: 'com.isopro.campo',
    /** Evita que o Android restaure dados (ex.: sessão no SecureStore) após reinstalar — exigia login e parecia «entrar direto». */
    allowBackup: false,
    versionCode: 21,
    adaptiveIcon: {
      foregroundImage: './assets/app-icon.png',
      backgroundColor: brandBackground,
    },
  },
  ios: {
    bundleIdentifier: 'com.isopro.campo',
    supportsTablet: true,
    infoPlist: {
      LSApplicationQueriesSchemes: ['whatsapp', 'whatsapp-business'],
    },
  },
  plugins: [
    './plugins/withAndroidPathCheck.js',
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: brandBackground,
        image: './assets/app-icon.png',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'O I.S.O PRO Campo precisa da camara para ler codigos de barras no atendimento.',
        microphonePermission: false,
      },
    ],
  ],
  /**
   * Em EAS Build, defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (Secrets do projeto ou env do perfil).
   * Sem isto no APK, o snapshot não carrega e «Dar baixa» fica sempre indisponível.
   */
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    eas: {
      projectId: '921d3c04-b6df-434f-8234-4a9a90658d00',
    },
  },
};

export default config;

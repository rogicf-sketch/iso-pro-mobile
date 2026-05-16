import 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import {
  clearSessionOnFirstLaunchAfterInstall,
  getStoredMobileSession,
  runAuthStorageMigration,
} from '@/src/lib/mobileAuth';
import { captureException } from '@/src/lib/errorReporting';
import { resolveMobileAccess } from '@/src/lib/mobileAccess';
import { initSentryMobile, Sentry } from '@/src/lib/sentryRN';
import { AppDialogHost } from '@/src/components/AppDialogHost';
import { MobileUiPreferencesProvider } from '@/src/theme/MobileUiPreferencesContext';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeContext';

void SplashScreen.preventAutoHideAsync();

initSentryMobile();

/**
 * Garante que o URL inicial do router é `/login` (evita `(tabs)` por defeito do Expo Router).
 * O Stack **sempre** monta com `login` — sessão válida redireciona depois.
 */
export const unstable_settings = {
  initialRouteName: 'login',
};

function RootLayoutInner() {
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const rootNav = useRootNavigationState();
  const splashHidden = useRef(false);

  const hideSplashOnce = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync();
  };

  /**
   * Sempre login como 1º ecrã. Só depois de validar sessão + dispositivo é que se vai para tabs / pendente / bloqueado.
   * Antes: `initialRouteName` era `(tabs)` com sessão — o utilizador «instalava» e entrava direto no sistema.
   */
  useEffect(() => {
    if (!rootNav?.key) return;

    let cancelled = false;

    void (async () => {
      try {
        await runAuthStorageMigration();
        await clearSessionOnFirstLaunchAfterInstall();
        const session = await getStoredMobileSession();
        if (cancelled) return;

        if (!session) {
          hideSplashOnce();
          return;
        }

        const access = await resolveMobileAccess(session);
        if (cancelled) return;

        const dest =
          access.state === 'blocked'
            ? '/device-blocked'
            : access.state === 'pending'
              ? '/device-pending'
              : '/(tabs)';
        router.replace(dest);
        hideSplashOnce();
      } catch (err) {
        captureException(err, { where: 'RootLayoutInner/session-bootstrap' });
        hideSplashOnce();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rootNav?.key, router]);

  /**
   * Restauro de estado / backup pode abrir `(tabs)` sem sessão — força login.
   */
  useEffect(() => {
    const seg0 = segments[0];
    if (!seg0) return;

    void (async () => {
      const session = await getStoredMobileSession();
      if (!session && seg0 === '(tabs)') {
        router.replace('/login');
      }
    })();
  }, [segments, router]);

  /**
   * Ao voltar ao primeiro plano: revalida acesso (bloqueio/pendência no servidor).
   * Importante: com acesso OK **não** fazer `replace('/(tabs)')` — isso repunha o separador inicial
   * e tirava o utilizador do Atendimento/Conferência só por desbloquear o ecrã.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        try {
          const session = await getStoredMobileSession();
          if (!session) return;
          const access = await resolveMobileAccess(session);
          if (access.state === 'blocked') {
            router.replace('/device-blocked');
            return;
          }
          if (access.state === 'pending') {
            router.replace('/device-pending');
            return;
          }
          const top = segments[0];
          if (top === 'device-blocked' || top === 'device-pending') {
            router.replace('/(tabs)');
          }
        } catch (err) {
          captureException(err, { where: 'RootLayoutInner/appstate-access' });
        }
      })();
    });
    return () => sub.remove();
  }, [router, segments]);

  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <Stack
        initialRouteName="login"
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="device-pending" options={{ headerShown: false }} />
        <Stack.Screen name="device-blocked" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <ThemeProvider>
      <MobileUiPreferencesProvider>
        <AppDialogHost />
        <RootLayoutInner />
      </MobileUiPreferencesProvider>
    </ThemeProvider>
  );
});

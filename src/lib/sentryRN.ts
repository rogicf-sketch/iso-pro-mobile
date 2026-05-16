import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let inited = false;

export function initSentryMobile(): void {
  if (inited) return;
  inited = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;

  const version = Constants.expoConfig?.version ?? '0.0.0';
  const dist =
    Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : undefined;

  Sentry.init({
    dsn,
    release: `iso-pro-mobile@${version}`,
    dist,
    tracesSampleRate: 0.05,
    enableAutoSessionTracking: true,
    sendDefaultPii: false,
  });
}

export { Sentry };

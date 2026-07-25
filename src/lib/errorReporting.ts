import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Erros e eventos operacionais para o Sentry (`EXPO_PUBLIC_SENTRY_DSN` / extra.sentryDsn).
 * Sem DSN: só console. info/warning → captureMessage; error → captureException.
 */

function sentryEnabled(): boolean {
  if (process.env.VITEST) return false;
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const fromExtra = String(
    (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn ?? '',
  ).trim();
  return Boolean(fromEnv || fromExtra);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const tag = '[iso-pro-mobile]';
  if (sentryEnabled()) {
    const err =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    Sentry.captureException(err, { extra: context });
  }

  if (context && Object.keys(context).length > 0) {
    console.warn(tag, context, error);
  } else {
    console.warn(tag, error);
  }
}

export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' = 'warning',
): void {
  if (sentryEnabled()) {
    if (level === 'error') {
      Sentry.captureException(new Error(message), { extra: { ...context, operationalMessage: true } });
    } else {
      Sentry.captureMessage(message, { level, extra: { ...context, operationalMessage: true } });
    }
  }

  const tag = '[iso-pro-mobile]';
  if (level === 'error') {
    console.error(tag, message, context ?? {});
  } else {
    console.warn(tag, message, context ?? {});
  }
}

export function captureOperationalEvent(
  event: string,
  context?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' = 'warning',
): void {
  captureMessage(`iso.${event}`, { ...context, event }, level);
}

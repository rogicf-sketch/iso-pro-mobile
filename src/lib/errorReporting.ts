import * as Sentry from '@sentry/react-native';

/**
 * Erros para o Sentry via SDK (`@sentry/react-native`) quando `EXPO_PUBLIC_SENTRY_DSN` está definido.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const tag = '[iso-pro-mobile]';
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (dsn && !process.env.VITEST) {
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

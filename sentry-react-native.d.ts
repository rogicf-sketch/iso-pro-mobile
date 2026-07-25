/** Tipagem mínima / fallback se `@sentry/react-native` ainda não estiver instalado. */
declare module '@sentry/react-native' {
  export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

  export function init(config: Record<string, unknown>): void;
  export function captureException(
    exception: unknown,
    captureContext?: { extra?: Record<string, unknown> },
  ): string;
  export function captureMessage(
    message: string,
    captureContext?:
      | SeverityLevel
      | {
          level?: SeverityLevel;
          extra?: Record<string, unknown>;
        },
  ): string;
  export function captureEvent(event: {
    message?: string;
    level?: SeverityLevel;
    extra?: Record<string, unknown>;
  }): string;
  export function wrap<P>(component: P): P;
}

/** Até `npm install` trazer `@sentry/react-native`. */
declare module '@sentry/react-native' {
  export function init(config: Record<string, unknown>): void;
  export function captureException(
    exception: unknown,
    captureContext?: { extra?: Record<string, unknown> },
  ): string;
  export function wrap<P>(component: P): P;
}

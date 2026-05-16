export function init(options?: unknown): void {
  void options;
}

export function captureException(): void {}

export function wrap<T>(c: T): T {
  return c;
}

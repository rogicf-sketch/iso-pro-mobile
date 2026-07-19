/** Fusão por id para gravações parciais no iso_pro_snapshot (concorrência PC / web / Campo). */

export function idKeyString(value: unknown): string {
  return String(value ?? '').trim();
}

export function mergeSnapshotRowsById<T extends { id?: unknown }>(
  current: T[],
  patch: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of current) {
    const key = idKeyString(row.id);
    if (key) byId.set(key, row);
  }
  for (const row of patch) {
    const key = idKeyString(row.id);
    if (!key) continue;
    byId.set(key, row);
  }
  return Array.from(byId.values());
}

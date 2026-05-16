import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'iso_pro_inventario_rascunho_v1_';

export type InventarioRascunhoPersistido = {
  inventarioId: string;
  /** Quantidade contada por id de linha (texto livre como na conferência). */
  qtdTextoPorItemId: Record<string, string>;
  updatedAt: string;
};

function keyFor(id: string) {
  return `${PREFIX}${id}`;
}

export async function salvarRascunhoInventario(data: InventarioRascunhoPersistido): Promise<void> {
  await AsyncStorage.setItem(keyFor(data.inventarioId), JSON.stringify(data));
}

export async function lerRascunhoInventario(inventarioId: string): Promise<InventarioRascunhoPersistido | null> {
  const raw = await AsyncStorage.getItem(keyFor(inventarioId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InventarioRascunhoPersistido;
  } catch {
    return null;
  }
}

export async function limparRascunhoInventario(inventarioId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(inventarioId));
}

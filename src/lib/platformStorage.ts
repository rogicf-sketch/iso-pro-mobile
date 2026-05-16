import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * No browser, `expo-secure-store` usa um stub (sem `getValueWithKeyAsync`).
 * Usamos localStorage com a mesma API assíncrona para sessão, tema e IDs de dispositivo.
 */
function isWeb(): boolean {
  return Platform.OS === 'web';
}

export async function platformGetItem(key: string): Promise<string | null> {
  if (isWeb()) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function platformSetItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      /* quota / modo privado */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function platformDeleteItem(key: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

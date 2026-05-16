import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recebimento } from 'iso-pro-shared';

const KEY = 'iso_pro_conferencia_rascunho_v1';

export type ConferenciaRascunhoPersistido = {
  recebimentoId: string;
  nfBusca: string;
  rec: Recebimento;
  qtdConfTextoPorLinha: Record<string, string>;
  updatedAt: string;
};

export async function salvarRascunhoConferencia(data: ConferenciaRascunhoPersistido): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function lerRascunhoConferencia(): Promise<ConferenciaRascunhoPersistido | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConferenciaRascunhoPersistido;
  } catch {
    return null;
  }
}

export async function limparRascunhoConferencia(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { buildInventarioStyles } from '@/src/theme/buildInventarioStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchDefaultSnapshot } from '@/src/lib/snapshot';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatarDataHoraLocal } from '@/src/lib/formatData';
import type { InventarioSnapshot, IsoSnapshotPayload } from 'iso-pro-shared';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function inventariosDisponiveisMobile(payload: IsoSnapshotPayload | null): InventarioSnapshot[] {
  const list = payload?.inventarios;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (inv) => String(inv.status ?? '') === 'aberto' && Boolean(inv.contagemMobileHabilitada),
  );
}

export default function InventarioListScreen() {
  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildInventarioStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);

  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);

  const carregarNuvem = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const { payload: p, updatedAt, error } = await fetchDefaultSnapshot();
      if (error) {
        setLoadErr(error);
        setPayload(null);
        return;
      }
      setPayload(p ? deepClone(p) : null);
      setNuvemAt(updatedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregarNuvem();
    }, [carregarNuvem]),
  );

  useSnapshotRefreshOnAppActive(carregarNuvem);

  const lista = useMemo(() => inventariosDisponiveisMobile(payload), [payload]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void carregarNuvem()} />}
      style={styles.scroll}
    >
      <Text style={styles.title}>Inventário</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hint}>
          Lista inventários <Text style={{ fontWeight: '800' }}>abertos</Text> no I.S.O PRO (PC) com a opção «contagem pelo mobile». O inventário tem de ser criado no
          computador primeiro; depois aparece aqui para os operadores. Toque num cartão para contar quantidades. Contagem por código de barras e sincronização em tempo real
          virão nas próximas versões.
        </Text>
      ) : null}

      {!configured ? (
        <Text style={styles.err}>Configure o Supabase (EXPO_PUBLIC_SUPABASE_…) para carregar dados da nuvem.</Text>
      ) : null}

      {loadErr ? <Text style={styles.err}>{loadErr}</Text> : null}
      {nuvemAt ? (
        <Text style={styles.meta}>Snapshot nuvem: {formatarDataHoraLocal(nuvemAt)}</Text>
      ) : configured && !loadErr ? (
        <Text style={styles.meta}>A carregar dados…</Text>
      ) : null}

      {loading && !payload ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : lista.length === 0 ? (
        <Text style={styles.hintSmall}>
          Nenhum inventário aberto com mobile habilitado. No PC, crie ou edite um inventário e marque «Permitir contagem pelo app mobile».
        </Text>
      ) : (
        lista.map((item, index) => (
          <Pressable
            key={String(item.id ?? index)}
            onPress={() => {
              if (item.id != null) router.push(`/inventario/${encodeURIComponent(String(item.id))}`);
            }}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{String(item.codigo ?? '—')}</Text>
            <Text style={styles.cardSub}>{String(item.descricao ?? '—')}</Text>
            <Text style={styles.rowMeta}>
              Responsável: {String(item.responsavel ?? '—')} · Data: {String(item.dataInventario ?? '—')}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Aberto · mobile</Text>
            </View>
          </Pressable>
        ))
      )}

      <Pressable disabled={loading} onPress={() => void carregarNuvem()} style={[styles.btn, loading && { opacity: 0.7 }]}>
        <Text style={styles.btnText}>Atualizar lista</Text>
      </Pressable>
    </ScrollView>
  );
}

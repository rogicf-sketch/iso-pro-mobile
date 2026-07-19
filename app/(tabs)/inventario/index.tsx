import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { EmptyStatePanel } from '@/src/components/mobile/EmptyStatePanel';
import { EntityListCard } from '@/src/components/mobile/EntityListCard';
import { ModuleScreenHeader } from '@/src/components/mobile/ModuleScreenHeader';
import { PrimaryActionButton } from '@/src/components/mobile/PrimaryActionButton';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { listInventariosPageFromCloud } from '@/src/lib/escalaCloud';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { inventarioTemContagemIniciada } from '@/src/lib/inventarioContagem';
import { lerRascunhoInventario } from '@/src/lib/inventarioRascunhoStorage';
import type { InventarioSnapshot } from 'iso-pro-shared';

function inventariosMobileDaLista(rows: Array<Record<string, unknown>>): InventarioSnapshot[] {
  return rows
    .filter(
      (inv) =>
        String(inv.status ?? '') === 'aberto' &&
        (inv.contagemMobileHabilitada === true || String(inv.contagemMobileHabilitada) === 'true'),
    )
    .map(
      (inv) =>
        ({
          id: inv.id,
          codigo: inv.codigo,
          descricao: inv.descricao,
          responsavel: inv.responsavel,
          dataInventario: inv.dataInventario,
          status: inv.status,
          contagemMobileHabilitada: true,
          itens: [],
        }) as InventarioSnapshot,
    );
}

export default function InventarioListScreen() {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const configured = useMemo(() => hasSupabaseConfig(), []);

  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [lista, setLista] = useState<InventarioSnapshot[]>([]);
  const [totalNuvem, setTotalNuvem] = useState(0);
  const [contagemIniciada, setContagemIniciada] = useState<Record<string, boolean>>({});

  const carregarNuvem = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const page = await listInventariosPageFromCloud({
        status: 'aberto',
        offset: 0,
        limit: 100,
      });
      if (page.error && page.missing) {
        setLoadErr(
          'Lista paginada de inventário indisponível. Active a estrutura de escala no PC (Configurações).',
        );
        setLista([]);
        setTotalNuvem(0);
        return;
      }
      if (page.error) {
        setLoadErr(page.error);
      }
      setLista(inventariosMobileDaLista(page.inventarios));
      setTotalNuvem(page.total);
      setNuvemAt(new Date().toISOString());
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const flags: Record<string, boolean> = {};
      for (const inv of lista) {
        const invId = String(inv.id ?? '');
        if (!invId) continue;
        const draft = await lerRascunhoInventario(invId);
        flags[invId] = inventarioTemContagemIniciada(inv.itens ?? [], draft?.qtdTextoPorItemId ?? {});
      }
      if (!cancelled) setContagemIniciada(flags);
    })();
    return () => {
      cancelled = true;
    };
  }, [lista]);

  return (
    <ScrollView
      contentContainerStyle={shell.screenPad}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void carregarNuvem()} />}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ModuleScreenHeader
        kicker="Operação de campo"
        subtitle="Inventários abertos no PC com contagem mobile activa."
        helpText="Crie o inventário no PC com «Permitir contagem pelo app mobile». A lista vem paginada da nuvem (sem baixar o snapshot inteiro)."
        showHelp={mostrarTextosAjudaModulos}
      />

      <CloudSyncStrip configured={configured} error={loadErr} loading={loading && lista.length === 0} updatedAt={nuvemAt} />

      <StatPillRow
        items={[
          { label: 'Disponíveis', value: lista.length },
          { label: 'Abertos (nuvem)', value: totalNuvem },
        ]}
      />

      {loading && lista.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : lista.length === 0 ? (
        <EmptyStatePanel
          title="Nenhum inventário para contar"
          message="No PC, crie ou edite um inventário aberto e marque «Permitir contagem pelo app mobile». Depois toque em Atualizar lista."
        />
      ) : (
        lista.map((item, index) => {
          const invId = String(item.id ?? index);
          const emCurso = contagemIniciada[invId] === true;
          return (
            <EntityListCard
              key={invId}
              actionLabel={emCurso ? 'Continuar contagem' : 'Iniciar contagem'}
              badgeLabel="Aberto · mobile"
              meta={`Responsável: ${String(item.responsavel ?? '—')} · Data: ${String(item.dataInventario ?? '—')}`}
              onPress={() => {
                if (item.id != null) router.push(`/inventario/${encodeURIComponent(String(item.id))}`);
              }}
              subtitle={String(item.descricao ?? '—')}
              title={String(item.codigo ?? '—')}
            />
          );
        })
      )}

      <PrimaryActionButton disabled={loading} label="Atualizar lista" loading={loading} onPress={() => void carregarNuvem()} />
    </ScrollView>
  );
}

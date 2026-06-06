import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BrandLogoPanel } from '@/src/components/BrandLogoPanel';
import { neonPrimaryButtonExtras } from '@/src/theme/neonButtonExtras';
import { hasSupabaseConfig } from '@/src/lib/config';
import { fetchSnapshotDiagnostics, type SnapshotDiagnostics } from '@/src/lib/snapshot';
import { getOfflineSnapshotQueueSize } from '@/src/lib/offlineSnapshotQueue';
import { resolveMobileAccess, type MobileAccessResult } from '@/src/lib/mobileAccess';
import { getStoredMobileSession, logoutMobile, type MobileSession } from '@/src/lib/mobileAuth';
import { getStoredDeviceRecord, type MobileDeviceRecord } from '@/src/lib/mobileDevice';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { THEME_ORDER, themes } from '@/src/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const W = Dimensions.get('window').width;
const PAD = 20;
const GAP = 12;
const cardW = (W - PAD * 2 - GAP) / 2;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { themeId, setThemeId, colors } = useTheme();
  const { mostrarTextosAjudaModulos, setMostrarTextosAjudaModulos } = useMobileUiPreferences();
  /** Ecrãs mais baixos: logo menos alto para ganhar espaço útil. */
  const logoCompact = windowHeight < 720;
  /** Versão do binário instalado (app.config) — não confundir com `device.versaoApp`, que fica «congelada» no primeiro registo. */
  const versaoBinario = useMemo(() => {
    const v = Constants.expoConfig?.version ?? '?';
    const vc = Constants.expoConfig?.android?.versionCode;
    return vc != null ? `${v} (Android ${vc})` : v;
  }, []);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [device, setDevice] = useState<MobileDeviceRecord | null>(null);
  const [accessInfo, setAccessInfo] = useState<MobileAccessResult | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [vinculoFeedback, setVinculoFeedback] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<SnapshotDiagnostics | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [offlineQueueSize, setOfflineQueueSize] = useState(0);

  const refreshSessionAndDevice = useCallback(async (): Promise<MobileAccessResult | null> => {
    const nextSession = await getStoredMobileSession();
    const nextDevice = await getStoredDeviceRecord();
    setSession(nextSession);
    setDevice(nextDevice);
    if (nextSession) {
      const access = await resolveMobileAccess(nextSession);
      setAccessInfo(access);
      setDevice(access.device);
      if (access.state === 'blocked') router.replace('/device-blocked');
      if (access.state === 'pending') router.replace('/device-pending');
      return access;
    }
    setAccessInfo(null);
    return null;
  }, [router]);

  const refreshOfflineQueueSize = useCallback(async () => {
    setOfflineQueueSize(await getOfflineSnapshotQueueSize());
  }, []);

  useEffect(() => {
    void refreshSessionAndDevice().finally(() => setBootReady(true));
    void refreshOfflineQueueSize();
  }, [refreshSessionAndDevice, refreshOfflineQueueSize]);

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refreshSessionAndDevice();
      await refreshOfflineQueueSize();
      if (hasSupabaseConfig()) {
        const nextDiag = await fetchSnapshotDiagnostics();
        setDiag(nextDiag);
      }
    } finally {
      setPullRefreshing(false);
    }
  }, [refreshSessionAndDevice, refreshOfflineQueueSize]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.bg },
        container: { paddingBottom: 36 },
        /** Logo + kicker ficam fora do scroll — só o conteúdo abaixo desliza. */
        homeHeader: {
          paddingHorizontal: PAD,
          paddingBottom: 12,
          backgroundColor: colors.bg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        padH: { paddingHorizontal: PAD },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          marginBottom: 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        kicker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, flex: 1 },
        paletteBtn: { padding: 6 },
        sub: {
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 22,
          marginTop: 18,
          marginBottom: 6,
        },
        code: { fontFamily: 'monospace', color: colors.accent },
        sectionTit: {
          color: colors.accent,
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 2,
          marginBottom: 12,
          marginTop: 22,
        },
        sectionSub: {
          fontSize: 12,
          color: colors.textMuted,
          marginTop: -6,
          marginBottom: 12,
          lineHeight: 18,
        },
        themeList: { gap: 10, marginBottom: 20 },
        themeOption: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          gap: 12,
        },
        themeOptionOn: {
          borderColor: colors.accent,
          borderWidth: 2,
          backgroundColor: colors.card,
        },
        themeSwatch: {
          width: 40,
          height: 40,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.borderStrong,
        },
        themeOptionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
        themeOptionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
        card: {
          width: cardW,
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          minHeight: 118,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 6,
            },
            android: { elevation: 2 },
          }),
        },
        cardIconWrap: { marginBottom: 10 },
        cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 6 },
        cardHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
        footer: { marginTop: 24, fontSize: 12, color: colors.textMuted },
        sessionCard: {
          marginTop: 20,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          backgroundColor: colors.card,
          padding: 0,
          overflow: 'hidden',
          borderLeftWidth: 4,
          borderLeftColor: colors.accent,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.14,
              shadowRadius: 8,
            },
            android: { elevation: 3 },
          }),
        },
        sessionCardInner: { padding: 16, gap: 0 },
        sessionKicker: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 1.6,
          color: colors.textMuted,
          marginBottom: 4,
        },
        sessionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
        sessionRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          paddingVertical: 9,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sessionRowLast: { borderBottomWidth: 0 },
        sessionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', flex: 0.42 },
        sessionValue: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 0.58, textAlign: 'right' },
        sessionText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
        sessionWarn: { color: '#f59e0b', fontSize: 12, lineHeight: 18 },
        logoutButton: {
          marginTop: 12,
          alignSelf: 'stretch',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          alignItems: 'center',
        },
        logoutText: { color: colors.text, fontSize: 13, fontWeight: '700' },
        refreshButton: {
          marginTop: 16,
          alignSelf: 'stretch',
          borderRadius: 12,
          backgroundColor: colors.primaryBtn,
          paddingVertical: 14,
          paddingHorizontal: 16,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          ...neonPrimaryButtonExtras(colors),
        },
        refreshText: { color: colors.primaryBtnText, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
        feedbackBox: {
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.cardNested,
        },
        feedbackText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
        diagBox: {
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.cardNested,
          gap: 4,
        },
        diagLine: { color: colors.textSecondary, fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
        diagWarn: { color: '#f59e0b', fontSize: 12, lineHeight: 18, marginTop: 6 },
        modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
        modalBackdrop: { flex: 1 },
        modalSheet: {
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderWidth: 1,
          borderBottomWidth: 0,
          maxHeight: '88%',
          paddingHorizontal: PAD,
          paddingTop: 16,
          paddingBottom: 12,
        },
        modalHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        },
        modalTitle: {
          color: colors.accent,
          fontSize: 15,
          fontWeight: '800',
        },
        modalScroll: { maxHeight: 420 },
        modalCloseBtn: { padding: 6 },
        helpToggleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          paddingHorizontal: 4,
          marginTop: 8,
          marginBottom: 4,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        helpToggleTextWrap: { flex: 1, paddingRight: 12 },
        helpToggleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
        helpToggleHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
        bootPlaceholder: {
          minHeight: 200,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 48,
          paddingHorizontal: PAD,
        },
        bootHint: { marginTop: 14, fontSize: 13, color: colors.textMuted },
      }),
    [colors]
  );

  const supabaseOk = hasSupabaseConfig();

  return (
    <>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.homeHeader, { paddingTop: insets.top + 4 }]}>
        <View style={styles.topBar}>
          <Text style={styles.kicker}>I.S.O PRO · CAMPO</Text>
          <Pressable
            onPress={() => setAppearanceOpen(true)}
            style={styles.paletteBtn}
            accessibilityRole="button"
            accessibilityLabel="Abrir aparência e temas"
            hitSlop={10}
          >
            <MaterialCommunityIcons name="palette-outline" size={24} color={colors.accent} />
          </Pressable>
        </View>
        <BrandLogoPanel
          accent={colors.accent}
          accentMuted={colors.accentMuted}
          compact={logoCompact}
          variant="card"
          widthMode="fill"
          marginBottom={0}
        />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void onPullRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View style={styles.padH}>
        {!bootReady ? (
          <View style={styles.bootPlaceholder}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.bootHint}>A carregar sessão e dispositivo…</Text>
          </View>
        ) : (
          <>
        <Text style={styles.sub}>
        {supabaseOk
          ? 'Conferência, atendimento, inventário (contagem) e consulta a documentos e recebimentos — ligado ao Supabase.'
          : 'Conferência, atendimento e consulta ao planejamento. Crie um ficheiro .env na raiz do projeto com '}
        {!supabaseOk ? (
          <>
            <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_URL</Text> e{' '}
            <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> (como no I.S.O PRO web) e reinicie o Expo (
            <Text style={styles.code}>npx expo start</Text>).
          </>
        ) : null}
      </Text>

      <Text style={[styles.sectionTit, { marginTop: 8 }]}>FUNÇÕES</Text>
      <Text style={styles.sectionSub}>
        Atalhos para conferência, atendimento, inventário e consulta — documentos cadastrados e recebimentos (só leitura).
      </Text>
      <View style={styles.grid}>
        <Link href="/(tabs)/conferencia" asChild>
          <Pressable style={styles.card}>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Conferência</Text>
            <Text style={styles.cardHint}>NF e contagem no depósito</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/atendimento" asChild>
          <Pressable style={styles.card}>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="check-decagram-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Atendimento</Text>
            <Text style={styles.cardHint}>Código, documento, recibo</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/inventario" asChild>
          <Pressable style={styles.card}>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Inventário</Text>
            <Text style={styles.cardHint}>Contagem no depósito (PC + mobile)</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/consulta?sec=documentos" asChild>
          <Pressable style={styles.card}>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="file-document-multiple-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Documentos cadastrados</Text>
            <Text style={styles.cardHint}>Desenhos no planejamento</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/consulta?sec=recebimento" asChild>
          <Pressable style={styles.card}>
            <View style={styles.cardIconWrap}>
              <MaterialCommunityIcons name="truck-delivery-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Recebimento</Text>
            <Text style={styles.cardHint}>Materiais recebidos (NF)</Text>
          </Pressable>
        </Link>
      </View>

      <View style={[styles.sessionCard, { marginTop: 22 }]}>
        <View style={styles.sessionCardInner}>
          <Text style={styles.sessionKicker}>CONTA E ACESSO</Text>
          <Text style={styles.sessionTitle}>Sessão ativa</Text>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionLabel}>Usuário</Text>
            <Text style={styles.sessionValue}>{session?.nome ?? '—'}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionLabel}>Login</Text>
            <Text style={styles.sessionValue}>{session?.login ?? '—'}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionLabel}>Dispositivo</Text>
            <Text style={styles.sessionValue}>{device?.nomeAparelho ?? '—'}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionLabel}>Versão instalada</Text>
            <Text style={styles.sessionValue}>{versaoBinario}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionLabel}>Status do acesso</Text>
            <Text style={styles.sessionValue}>{accessInfo?.state ?? 'local'}</Text>
          </View>
          <View style={[styles.sessionRow, styles.sessionRowLast]}>
            <Text style={styles.sessionLabel}>Origem da validação</Text>
            <Text style={styles.sessionValue}>{accessInfo?.source ?? 'local'}</Text>
          </View>
          {offlineQueueSize > 0 ? (
            <Text style={[styles.sessionWarn, { marginTop: 10 }]}>
              Fila offline: {offlineQueueSize} alteracao(oes) aguardam sincronizacao com a nuvem.
            </Text>
          ) : null}
          {accessInfo?.offlineUnverified ? (
            <Text style={[styles.sessionWarn, { marginTop: 10 }]}>
              Modo offline: controlo de aparelho nao verificado no servidor.
            </Text>
          ) : null}
          {accessInfo?.warning ? (
            <Text style={[styles.sessionWarn, { marginTop: 10 }]}>Aviso: {accessInfo.warning}</Text>
          ) : null}
          <Pressable
            onPress={() => {
              if (!session) return;
              setRefreshingAccess(true);
              void refreshSessionAndDevice()
                .then((access) => {
                  if (access) {
                    setVinculoFeedback(
                      `Origem: ${access.source} · Estado: ${access.state}${access.warning ? ` · ${access.warning}` : ''}`,
                    );
                  }
                })
                .finally(() => {
                  setRefreshingAccess(false);
                });
            }}
            disabled={refreshingAccess}
            style={styles.refreshButton}
          >
            {refreshingAccess ? (
              <ActivityIndicator color={colors.primaryBtnText} />
            ) : (
              <Text style={styles.refreshText}>Atualizar vínculo do aparelho</Text>
            )}
          </Pressable>
          {vinculoFeedback ? (
            <View style={[styles.feedbackBox, { marginTop: 12 }]}>
              <Text style={styles.feedbackText}>{vinculoFeedback}</Text>
            </View>
          ) : null}
          {supabaseOk ? (
            <>
              <Text style={[styles.sessionKicker, { marginTop: 18 }]}>PLANEJAMENTO</Text>
              <Pressable
                onPress={() => {
                  setDiagLoading(true);
                  void fetchSnapshotDiagnostics()
                    .then(setDiag)
                    .finally(() => setDiagLoading(false));
                }}
                disabled={diagLoading}
                style={[styles.logoutButton, { backgroundColor: colors.surfaceElevated, marginTop: 6 }]}
              >
                {diagLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.logoutText}>Verificar leitura do snapshot</Text>
                )}
              </Pressable>
              {diag ? (
                <View style={[styles.diagBox, { marginTop: 10 }]}>
                  <Text style={styles.diagLine}>Servidor: {diag.host}</Text>
                  <Text style={styles.diagLine}>Linha default: {diag.rowFound ? 'sim' : 'não'}</Text>
                  <Text style={styles.diagLine}>updated_at: {diag.updatedAt ?? '—'}</Text>
                  <Text style={styles.diagLine}>
                    documentos: {diag.documentos} · materiais: {diag.materiais} · receb.: {diag.recebimentos} · colab.: {diag.colaboradores}
                  </Text>
                  {diag.primeiroNumeroDocumento ? (
                    <Text style={styles.diagLine}>1.º nº desenho: {diag.primeiroNumeroDocumento}</Text>
                  ) : null}
                  {diag.payloadKeys.length > 0 ? (
                    <Text style={styles.diagLine}>chaves no JSON: {diag.payloadKeys.join(', ')}</Text>
                  ) : null}
                  {diag.error ? <Text style={styles.diagWarn}>Erro: {diag.error}</Text> : null}
                  {!diag.error && diag.rowFound && diag.documentos === 0 ? (
                    <Text style={styles.diagWarn}>
                      O app lê o Supabase, mas o snapshot não tem desenhos (`documentos`). Colaboradores podem aparecer na mesma. É preciso gravar o
                      planejamento na nuvem pelo I.S.O PRO no navegador (não é ajuste neste ecrã).
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
          <Pressable
            onPress={() => {
              void logoutMobile().then(() => router.replace('/login'));
            }}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Sair do app</Text>
          </Pressable>
        </View>
      </View>
          </>
        )}
      </View>
      </ScrollView>
    </View>

    <Modal
      visible={appearanceOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setAppearanceOpen(false)}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAppearanceOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.bg,
              borderColor: colors.border,
              paddingBottom: Math.max(12, insets.bottom + 8),
            },
          ]}
        >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>APARÊNCIA</Text>
              <Pressable
                onPress={() => setAppearanceOpen(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Fechar aparência"
              >
                <MaterialCommunityIcons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.themeList}>
                {THEME_ORDER.map((id) => {
                  const on = themeId === id;
                  const t = themes[id];
                  return (
                    <Pressable
                      key={id}
                      style={[styles.themeOption, on && styles.themeOptionOn]}
                      onPress={() => setThemeId(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[styles.themeSwatch, { backgroundColor: t.accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.themeOptionTitle}>{t.displayName}</Text>
                        <Text style={styles.themeOptionHint}>{t.themeHint}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.helpToggleRow}>
                <View style={styles.helpToggleTextWrap}>
                  <Text style={styles.helpToggleTitle}>Mostrar textos de ajuda nos módulos</Text>
                  <Text style={styles.helpToggleHint}>
                    Igual à opção em Aparência no I.S.O PRO no PC. Desligue para ecrãs operacionais mais limpos (menos parágrafos explicativos).
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Mostrar textos de ajuda nos módulos"
                  value={mostrarTextosAjudaModulos}
                  onValueChange={setMostrarTextosAjudaModulos}
                  trackColor={{ false: colors.borderStrong, true: colors.accentMuted }}
                  thumbColor={mostrarTextosAjudaModulos ? colors.primaryBtn : colors.textSecondary}
                />
              </View>
              <Text style={styles.footer}>Tema e preferência de ajuda guardados neste dispositivo.</Text>
            </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

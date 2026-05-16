import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { AuthScreenLayout } from '@/src/components/AuthScreenLayout';
import { StatusHero } from '@/src/components/StatusHero';
import { resolveMobileAccess } from '@/src/lib/mobileAccess';
import { getStoredDeviceRecord, type MobileDeviceRecord } from '@/src/lib/mobileDevice';
import { getStoredMobileSession, logoutMobile } from '@/src/lib/mobileAuth';
import { neonPrimaryButtonExtras } from '@/src/theme/neonButtonExtras';
import { useTheme } from '@/src/theme/ThemeContext';

export default function DevicePendingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [checking, setChecking] = useState(false);
  const [device, setDevice] = useState<MobileDeviceRecord | null>(null);

  useEffect(() => {
    void getStoredDeviceRecord().then(setDevice);
  }, []);

  const styles = StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 22,
      gap: 14,
    },
    text: { color: colors.textSecondary, lineHeight: 22, fontSize: 15 },
    strong: { fontWeight: '800', color: colors.text },
    steps: {
      marginTop: 4,
      gap: 10,
      paddingVertical: 4,
    },
    stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.accentMuted + '33',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNum: { color: colors.accent, fontSize: 13, fontWeight: '800' },
    stepText: { flex: 1, color: colors.textSecondary, lineHeight: 21, fontSize: 14 },
    idBox: {
      marginTop: 4,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    idLabel: { color: colors.formLabel, fontSize: 11, fontWeight: '700', marginBottom: 6 },
    idValue: { color: colors.accentCode, fontFamily: 'monospace', fontSize: 13, lineHeight: 18 },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    buttonText: { color: colors.text, fontWeight: '700', fontSize: 15 },
    primary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.primaryBtn,
      paddingVertical: 16,
      ...neonPrimaryButtonExtras(colors),
    },
    primaryText: { color: colors.primaryBtnText, fontWeight: '800', fontSize: 16 },
    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: 14,
      backgroundColor: colors.surfaceElevated,
    },
    secondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  });

  async function verificarDeNovo() {
    setChecking(true);
    try {
      const session = await getStoredMobileSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const access = await resolveMobileAccess(session);
      setDevice(access.device);
      if (access.state === 'authorized') router.replace('/(tabs)');
      else if (access.state === 'blocked') router.replace('/device-blocked');
    } finally {
      setChecking(false);
    }
  }

  async function handleExit() {
    await logoutMobile();
    router.replace('/login');
  }

  async function enviarDeviceId() {
    const id = device?.deviceId;
    if (!id) return;
    try {
      await Share.share({
        message: `Device ID (I.S.O PRO): ${id}`,
        title: 'Device ID',
      });
    } catch {
      /* utilizador cancelou */
    }
  }

  return (
    <AuthScreenLayout backgroundColor={colors.bg}>
      <StatusHero
        tone="pending"
        icon="clock-outline"
        title="Aguardando autorizacao"
        textColor={colors.text}
      />
      <View style={styles.card}>
        <Text style={styles.text}>
          Este aparelho esta registado, mas{' '}
          <Text style={styles.strong}>ainda nao foi autorizado</Text> no I.S.O PRO. Ate o administrador aprovar, as funcoes do
          app ficam bloqueadas.
        </Text>

        <View style={styles.steps}>
          <Text style={[styles.text, { fontWeight: '800', color: colors.text, marginBottom: 2 }]}>O que fazer</Text>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>1</Text>
            </View>
            <Text style={styles.stepText}>No computador: Administracao → Dispositivos mobile.</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>2</Text>
            </View>
            <Text style={styles.stepText}>Localize este aparelho na lista e toque em Autorizar.</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>3</Text>
            </View>
            <Text style={styles.stepText}>Volte aqui e use Verificar de novo.</Text>
          </View>
        </View>

        {device?.deviceId ? (
          <View style={styles.idBox}>
            <Text style={styles.idLabel}>ID do aparelho (para o administrador)</Text>
            <Text selectable style={styles.idValue}>
              {device.deviceId}
            </Text>
            <Pressable onPress={() => void enviarDeviceId()} style={[styles.secondary, { marginTop: 12 }]}>
              <Text style={styles.secondaryText}>Partilhar ID</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable disabled={checking} onPress={() => void verificarDeNovo()} style={styles.primary}>
          {checking ? (
            <ActivityIndicator color={colors.primaryBtnText} />
          ) : (
            <Text style={styles.primaryText}>Verificar de novo</Text>
          )}
        </Pressable>
        <Pressable onPress={handleExit} style={styles.button}>
          <Text style={styles.buttonText}>Voltar ao login</Text>
        </Pressable>
      </View>
    </AuthScreenLayout>
  );
}

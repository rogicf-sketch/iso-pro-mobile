import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthScreenLayout } from '@/src/components/AuthScreenLayout';
import { StatusHero } from '@/src/components/StatusHero';
import { logoutMobile } from '@/src/lib/mobileAuth';
import { useTheme } from '@/src/theme/ThemeContext';

export default function DeviceBlockedScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 22,
      gap: 16,
    },
    text: { color: colors.textSecondary, lineHeight: 22, fontSize: 15 },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 16,
    },
    buttonText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  });

  async function handleExit() {
    await logoutMobile();
    router.replace('/login');
  }

  return (
    <AuthScreenLayout backgroundColor={colors.bg}>
      <StatusHero tone="blocked" icon="lock-alert-outline" title="Dispositivo bloqueado" textColor={colors.text} />
      <View style={styles.card}>
        <Text style={styles.text}>
          O acesso deste aparelho foi bloqueado pelo administrador. Nao e possivel continuar a usar o app neste estado.
        </Text>
        <Text style={styles.text}>
          Se precisar de voltar a operar, peça ao administrador para{' '}
          <Text style={{ fontWeight: '800', color: colors.text }}>desbloquear ou autorizar novamente</Text> no I.S.O PRO
          (Dispositivos mobile).
        </Text>
        <Pressable onPress={handleExit} style={styles.button}>
          <Text style={styles.buttonText}>Voltar ao login</Text>
        </Pressable>
      </View>
    </AuthScreenLayout>
  );
}

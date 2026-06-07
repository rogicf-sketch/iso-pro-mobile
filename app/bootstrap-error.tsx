import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/theme/ThemeContext';

export default function BootstrapErrorScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Erro ao iniciar' }} />
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Nao foi possivel iniciar a aplicacao</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Ocorreu um erro ao validar a sessao ou o dispositivo. Feche a app completamente e abra de novo. Se
          persistir, termine sessao e entre novamente com login e senha.
        </Text>
        <Link href="/login" asChild>
          <Pressable style={[styles.btn, { backgroundColor: colors.accent }]}>
            <Text style={styles.btnText}>Ir para o login</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  copy: { fontSize: 15, lineHeight: 22 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#0b1220', fontWeight: '800', fontSize: 16 },
});

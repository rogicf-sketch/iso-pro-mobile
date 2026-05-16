import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthScreenLayout } from '@/src/components/AuthScreenLayout';
import { BrandLogoPanel } from '@/src/components/BrandLogoPanel';
import { loginMobile } from '@/src/lib/mobileAuth';
import { resolveMobileAccess } from '@/src/lib/mobileAccess';
import { neonPrimaryButtonExtras } from '@/src/theme/neonButtonExtras';
import { useTheme } from '@/src/theme/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const buildLabel = useMemo(() => {
    const v = Constants.expoConfig?.version ?? '?';
    const vc = Constants.expoConfig?.android?.versionCode;
    return vc != null ? `Build ${v} (${vc})` : `Build ${v}`;
  }, []);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 22,
      gap: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 6,
    },
    kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    title: { color: colors.text, fontSize: 24, fontWeight: '800' },
    hint: { color: colors.textSecondary, lineHeight: 21, fontSize: 14 },
    label: { color: colors.formLabel, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
      color: colors.text,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
    },
    senhaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    senhaInput: {
      flex: 1,
      color: colors.text,
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingRight: 8,
      fontSize: 16,
    },
    senhaOlho: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      justifyContent: 'center',
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.primaryBtn,
      paddingVertical: 16,
      marginTop: 4,
      ...neonPrimaryButtonExtras(colors),
    },
    buttonText: { color: colors.primaryBtnText, fontWeight: '800', fontSize: 16 },
    error: { color: colors.err, lineHeight: 20, fontSize: 14 },
    buildInfo: { color: colors.textMuted, fontSize: 11, marginTop: 12, textAlign: 'center' },
  });

  async function handleLogin() {
    setSaving(true);
    setError('');
    try {
      const session = await loginMobile(login.trim(), senha);
      const access = await resolveMobileAccess(session);

      if (access.state === 'blocked') {
        router.replace('/device-blocked');
        return;
      }

      if (access.state === 'pending') {
        router.replace('/device-pending');
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel entrar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthScreenLayout backgroundColor={colors.bg} keyboard>
      <View style={styles.card}>
        <BrandLogoPanel
          accent={colors.accent}
          accentMuted={colors.accentMuted}
          compact
          widthMode="fill"
          marginBottom={10}
        />
        <Text style={styles.kicker}>I.S.O PRO MOBILE</Text>
        <Text style={styles.title} testID="mobile-login-title">
          Acesso do operador
        </Text>
        <Text style={styles.hint}>
          Utilize o mesmo login e senha criados no I.S.O PRO (Utilizadores). O perfil precisa de permissao no modulo Mobile. O aparelho fica
          pendente ate o administrador autorizar em Dispositivos mobile.{'\n\n'}
          Se aparecer «network request failed» ou erro de rede, a senha nem e verificada: falta ligação ao Supabase (variáveis EXPO_PUBLIC_* no EAS,
          ambiente preview, e novo APK). Não existe login «admin/admin» por defeito na app — tem de existir em Utilizadores na base de dados.
        </Text>

        <View>
          <Text style={styles.label}>Login</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setLogin}
            placeholder="Utilizador"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            testID="mobile-login-usuario"
            value={login}
          />
        </View>
        <View>
          <Text style={styles.label}>Senha</Text>
          <View style={styles.senhaRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSenha}
              placeholder="Senha"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!senhaVisivel}
              style={styles.senhaInput}
              testID="mobile-login-senha"
              value={senha}
            />
            <Pressable
              accessibilityLabel={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setSenhaVisivel((v) => !v)}
              style={({ pressed }) => [styles.senhaOlho, pressed && { opacity: 0.65 }]}
            >
              <MaterialCommunityIcons
                color={colors.textSecondary}
                name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'}
                size={22}
              />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleLogin}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }]}
          testID="mobile-login-submit"
        >
          {saving ? <ActivityIndicator color={colors.primaryBtnText} /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
        <Text style={styles.buildInfo}>{buildLabel}</Text>
      </View>
    </AuthScreenLayout>
  );
}

import { Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  accent: string;
  accentMuted: string;
  compact?: boolean;
  hero?: boolean;
};

/**
 * Marca I.S.O PRO em texto — evita o `logo.png` recortado (bordas pretas / fundo errado).
 * Alinhado ao painel do sistema desktop (I.S.O | PRO + GESTÃO DE MATERIAIS).
 */
export function BrandLogoWordmark({ accent, accentMuted, compact = false, hero = false }: Props) {
  /** Tamanhos ligeiramente reduzidos para alinhar ao cartão «Sessão ativa» sem dominar o ecrã. */
  const iso = compact ? 18 : hero ? 24 : 22;
  const pro = compact ? 22 : hero ? 28 : 26;
  const sub = compact ? 8.5 : hero ? 10 : 9.5;
  const barH = Math.round(pro * 0.72);

  const glow =
    Platform.OS === 'android'
      ? { textShadowColor: accent, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }
      : { textShadowColor: accent, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 };

  return (
    <View style={styles.wrap} accessibilityLabel="I.S.O PRO, gestão de materiais">
      <View style={styles.row}>
        <Text style={[styles.iso, { fontSize: iso }]}>I.S.O</Text>
        <View style={[styles.sep, { height: barH }]} />
        <Text style={[styles.pro, { fontSize: pro, color: accent }, glow]}>PRO</Text>
      </View>
      <Text style={[styles.sub, { fontSize: sub, color: accentMuted }]}>GESTÃO DE MATERIAIS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iso: {
    color: '#f8fafc',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sep: {
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(248, 250, 252, 0.35)',
  },
  pro: {
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sub: {
    marginTop: 8,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
});

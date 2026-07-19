import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  titulo: string;
  mensagem: string;
  colors: ThemeColors;
};

export function AtendimentoOperacaoOverlay({ visible, titulo, mensagem, colors }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}>
        <View style={[styles.card, { backgroundColor: colors.modalCard, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.titulo, { color: colors.accent }]}>{titulo}</Text>
          <Text style={[styles.mensagem, { color: colors.textSecondary }]}>{mensagem}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
  },
  titulo: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  mensagem: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});

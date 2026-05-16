import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerAppDialog, type AppDialogButton, type AppDialogPayload } from '@/src/lib/appDialog';
import { useTheme } from '@/src/theme/ThemeContext';

export function AppDialogHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [payload, setPayload] = useState<AppDialogPayload | null>(null);
  const visible = payload !== null;

  const show = useCallback((p: AppDialogPayload) => {
    setPayload(p);
  }, []);

  useEffect(() => {
    registerAppDialog(show);
    return () => registerAppDialog(null);
  }, [show]);

  const close = useCallback(() => setPayload(null), []);

  const handlePress = useCallback(
    (btn: AppDialogButton) => {
      const fn = btn.onPress;
      close();
      if (fn) {
        setTimeout(() => {
          void Promise.resolve(fn()).catch(() => {});
        }, 0);
      }
    },
    [close],
  );

  const cardMaxW = Math.min(width - 36, 420);
  const messageMaxH = Math.min(height * 0.42, 320);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: colors.modalOverlay,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        },
        card: {
          width: cardMaxW,
          maxWidth: '100%',
          backgroundColor: colors.modalCard,
          borderRadius: 22,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.28,
              shadowRadius: 20,
            },
            android: { elevation: 14 },
            default: {},
          }),
        },
        body: {
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: 8,
        },
        title: {
          color: colors.accent,
          fontSize: 17,
          fontWeight: '800',
          textAlign: 'center',
          letterSpacing: 0.2,
          marginBottom: 10,
        },
        message: {
          color: colors.modalText,
          fontSize: 15,
          lineHeight: 22,
          textAlign: 'left',
        },
        scroll: {
          maxHeight: messageMaxH,
        },
        actionsTopRule: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginTop: 6,
        },
        btnRow: {
          minHeight: 50,
          justifyContent: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
        },
        btnRowBorder: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        btnDefault: {
          color: colors.accent,
          fontSize: 16,
          fontWeight: '700',
          textAlign: 'center',
        },
        btnCancel: {
          color: colors.textSecondary,
          fontSize: 16,
          fontWeight: '600',
          textAlign: 'center',
        },
        btnDestructive: {
          color: colors.err,
          fontSize: 16,
          fontWeight: '700',
          textAlign: 'center',
        },
      }),
    [cardMaxW, colors, insets.bottom, insets.top, messageMaxH],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      {payload ? (
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.body}>
              <Text style={styles.title} accessibilityRole="header">
                {payload.title}
              </Text>
              {payload.message ? (
                <ScrollView
                  style={styles.scroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={payload.message.length > 280}
                >
                  <Text style={styles.message}>{payload.message}</Text>
                </ScrollView>
              ) : null}
            </View>
            <View style={styles.actionsTopRule} />
            {payload.buttons.map((btn, i) => {
              const variant = btn.style ?? 'default';
              const txtStyle =
                variant === 'destructive'
                  ? styles.btnDestructive
                  : variant === 'cancel'
                    ? styles.btnCancel
                    : styles.btnDefault;
              return (
                <Pressable
                  key={`${btn.text ?? 'btn'}-${i}`}
                  accessibilityRole="button"
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    styles.btnRow,
                    i > 0 ? styles.btnRowBorder : null,
                    pressed ? { backgroundColor: colors.surfaceElevated } : null,
                  ]}
                >
                  <Text style={txtStyle}>{btn.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

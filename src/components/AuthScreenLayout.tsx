import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  backgroundColor: string;
  /** Usar em ecrãs com campos de texto (evita teclado a tapar inputs). */
  keyboard?: boolean;
};

export function AuthScreenLayout({ children, backgroundColor, keyboard }: Props) {
  const insets = useSafeAreaInsets();

  const scroll = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 24,
          backgroundColor,
        },
      ]}
    >
      {children}
    </ScrollView>
  );

  if (keyboard) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[styles.flex, { backgroundColor }]}>{scroll}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
});

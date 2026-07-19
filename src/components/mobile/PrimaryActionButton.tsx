import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Texto exibido ao lado do spinner enquanto `loading` (ex.: «A carregar…»). */
  loadingLabel?: string;
  variant?: 'primary' | 'secondary';
  children?: ReactNode;
};

export function PrimaryActionButton({
  label,
  onPress,
  disabled,
  loading,
  loadingLabel,
  variant = 'primary',
  children,
}: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const isPrimary = variant === 'primary';
  const spinnerColor = isPrimary ? colors.primaryBtnText : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
      style={({ pressed }) => [
        isPrimary ? shell.primaryBtn : shell.secondaryBtn,
        (disabled || loading) && shell.primaryBtnDisabled,
        pressed && !disabled && !loading && { opacity: 0.65, transform: [{ scale: 0.98 }] },
      ]}
    >
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={spinnerColor} />
          <Text style={isPrimary ? shell.primaryBtnText : shell.secondaryBtnText}>
            {loadingLabel ?? label}
          </Text>
        </View>
      ) : children ? (
        children
      ) : (
        <Text style={isPrimary ? shell.primaryBtnText : shell.secondaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

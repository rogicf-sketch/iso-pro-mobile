import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/mobile/StatusBadge';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  badgeLabel?: string;
  actionLabel?: string;
  onPress?: () => void;
  selected?: boolean;
};

export function EntityListCard({ title, subtitle, meta, badgeLabel, actionLabel, onPress, selected }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        shell.entityCard,
        selected && { borderColor: colors.accent, backgroundColor: colors.surfaceElevated },
        pressed && shell.entityCardPressed,
      ]}
    >
      <Text style={shell.entityTitle}>{title}</Text>
      {subtitle ? <Text style={shell.entitySubtitle}>{subtitle}</Text> : null}
      {meta ? <Text style={[shell.entitySubtitle, { marginTop: 8, fontSize: 12, color: colors.textMuted }]}>{meta}</Text> : null}
      {badgeLabel ? (
        <View style={{ marginTop: 8 }}>
          <StatusBadge label={badgeLabel} tone="success" />
        </View>
      ) : null}
      {actionLabel && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            shell.entityActionBtn,
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={shell.entityActionBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

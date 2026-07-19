import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { buildMobileShellStyles, statusBadgeColors, type StatusBadgeTone } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  label: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ label, tone = 'neutral' }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const palette = statusBadgeColors(colors, tone);

  return (
    <View style={[shell.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[shell.badgeText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

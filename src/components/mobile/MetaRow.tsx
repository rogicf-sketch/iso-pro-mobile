import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  label: string;
  value: string;
  isLast?: boolean;
};

export function MetaRow({ label, value, isLast }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  return (
    <View style={[shell.metaRow, isLast && shell.metaRowLast]}>
      <Text style={shell.metaLabel}>{label}</Text>
      <Text style={shell.metaValue}>{value}</Text>
    </View>
  );
}

import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  message: string;
};

export function EmptyStatePanel({ icon = 'clipboard-text-off-outline', title, message }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  return (
    <View style={shell.emptyPanel}>
      <MaterialCommunityIcons name={icon} size={36} color={colors.textMuted} />
      <Text style={shell.emptyTitle}>{title}</Text>
      <Text style={shell.emptyText}>{message}</Text>
    </View>
  );
}

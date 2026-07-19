import { useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  title?: string;
  children: ReactNode;
};

export function SectionCard({ title, children }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  return (
    <View style={shell.sectionCard}>
      {title ? <Text style={shell.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

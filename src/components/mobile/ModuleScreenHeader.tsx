import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  kicker?: string;
  title?: string;
  subtitle?: string;
  helpText?: string;
  showHelp?: boolean;
};

export function ModuleScreenHeader({ kicker, title, subtitle, helpText, showHelp = false }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  return (
    <View style={{ marginBottom: 4 }}>
      {kicker ? <Text style={shell.kicker}>{kicker}</Text> : null}
      {title ? <Text style={shell.screenTitle}>{title}</Text> : null}
      {subtitle ? <Text style={shell.screenSubtitle}>{subtitle}</Text> : null}
      {showHelp && helpText ? (
        <View style={shell.helpCard}>
          <Text style={shell.helpText}>{helpText}</Text>
        </View>
      ) : null}
    </View>
  );
}

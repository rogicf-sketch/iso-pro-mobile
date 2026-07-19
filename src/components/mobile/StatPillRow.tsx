import { useMemo } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

export type StatPillTone = 'default' | 'emphasis' | 'success' | 'warn' | 'muted';

export type StatPillItem = {
  label: string;
  value: string | number;
  tone?: StatPillTone;
};

type Props = {
  items: StatPillItem[];
  /** Menor — para linhas de lista (ex.: itens do desenho no Atendimento). */
  dense?: boolean;
  /** Grelha 2 colunas com quadros alinhados (ex.: 4 métricas por linha de material). */
  columns?: 2;
  style?: StyleProp<ViewStyle>;
};

export function StatPillRow({ items, dense = false, columns, style }: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  if (!items.length) return null;

  const grid2 = dense && columns === 2;

  return (
    <View style={[dense ? shell.statRowDense : shell.statRow, grid2 && shell.statRowGrid2, style]}>
      {items.map((item) => {
        const tone = item.tone ?? 'default';
        return (
          <View
            key={item.label}
            style={[
              dense ? shell.statPillDense : shell.statPill,
              grid2 && shell.statPillGrid2,
              tone === 'emphasis' && shell.statPillEmphasis,
              tone === 'success' && shell.statPillSuccess,
              tone === 'warn' && shell.statPillWarn,
              tone === 'muted' && shell.statPillMuted,
            ]}
          >
            <Text
              style={[
                dense ? shell.statPillValueDense : shell.statPillValue,
                grid2 && shell.statPillValueGrid2,
                tone === 'emphasis' && shell.statPillValueEmphasis,
                tone === 'success' && shell.statPillValueSuccess,
                tone === 'warn' && shell.statPillValueWarn,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {String(item.value)}
            </Text>
            <Text
              style={[
                dense ? shell.statPillLabelDense : shell.statPillLabel,
                grid2 && shell.statPillLabelGrid2,
                tone === 'success' && shell.statPillLabelSuccess,
              ]}
              numberOfLines={2}
            >
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

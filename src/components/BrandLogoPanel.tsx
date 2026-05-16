import { Image, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BrandLogoWordmark } from '@/src/components/BrandLogoWordmark';

/** Azul de marca / splash / desktop — fundo do painel (sem “preto de recorte”). */
const LOGO_PANEL_BG = '#0B1426';

/** Alinhado ao cartão «Sessão ativa» / cartões principais (index). */
const PANEL_RADIUS = 16;
const HORIZONTAL_INSET = 20;

type Props = {
  accent: string;
  accentMuted: string;
  compact?: boolean;
  marginBottom?: number;
  variant?: 'card' | 'hero';
  /**
   * `inset` — largura = ecrã − 2×margem (uso isolado na página).
   * `fill` — largura 100% do contentor pai (login dentro do cartão, início dentro de `padH`).
   */
  widthMode?: 'inset' | 'fill';
  /**
   * Se `true`, usa `assets/logo.png` (só com PNG limpo / fundo transparente).
   * Por defeito: wordmark em texto (sem bordas pretas do recorte).
   */
  useImageAsset?: boolean;
};

export function BrandLogoPanel({
  accent,
  accentMuted,
  compact = false,
  marginBottom = 14,
  variant = 'card',
  widthMode = 'inset',
  useImageAsset = false,
}: Props) {
  const { width } = useWindowDimensions();
  const isHero = variant === 'hero';
  const useFill = widthMode === 'fill';
  const panelW = useFill ? undefined : width - HORIZONTAL_INSET * 2;
  const innerMinH = compact ? 76 : isHero ? 100 : 92;

  return (
    <View
      style={[
        styles.shell,
        useFill ? styles.shellFill : styles.shellInset,
        !useFill && panelW != null ? { width: panelW } : null,
        {
          borderColor: accent,
          marginBottom,
          ...Platform.select({
            ios: {
              shadowColor: accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 12,
            },
            android: { elevation: 4 },
          }),
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            minHeight: innerMinH,
            backgroundColor: LOGO_PANEL_BG,
            paddingHorizontal: compact ? 12 : 16,
            paddingVertical: compact ? 12 : isHero ? 18 : 16,
          },
        ]}
      >
        {useImageAsset ? (
          <Image
            accessibilityLabel="I.S.O PRO Campo"
            source={require('../../assets/logo.png')}
            style={{ width: '100%', height: innerMinH }}
            resizeMode="contain"
          />
        ) : (
          <BrandLogoWordmark accent={accent} accentMuted={accentMuted} compact={compact} hero={isHero} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: PANEL_RADIUS,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  shellInset: {
    alignSelf: 'center',
  },
  shellFill: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

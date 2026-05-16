import { Platform, type ViewStyle } from 'react-native';
import type { ThemeColors } from './tokens';

/**
 * Cantos + contorno verde-lima nos CTAs (só `neonVerde`); o fundo do botão vem de `primaryBtn` (escuro).
 */
export function neonPrimaryButtonExtras(c: ThemeColors): ViewStyle {
  if (c.id !== 'neonVerde') return {};
  return {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(57, 255, 20, 0.42)',
    ...Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#39ff14',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  };
}

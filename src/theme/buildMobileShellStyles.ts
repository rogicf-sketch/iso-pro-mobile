import { StyleSheet } from 'react-native';
import { ISO_BRAND_GREEN_400_RGB } from './brand';
import { neonPrimaryButtonExtras } from './neonButtonExtras';
import type { ThemeColors } from './tokens';

/** Estilos partilhados para cabeçalhos, cartões e blocos de módulo (polimento visual). */
export function buildMobileShellStyles(c: ThemeColors) {
  return StyleSheet.create({
    screenPad: { padding: 20, paddingBottom: 40 },
    kicker: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    screenTitle: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      lineHeight: 28,
      marginBottom: 4,
    },
    screenSubtitle: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    helpCard: {
      marginTop: 14,
      marginBottom: 16,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    helpText: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    syncStrip: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    syncLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    syncValue: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    syncError: {
      color: c.err,
      fontSize: 13,
      lineHeight: 18,
    },
    statRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    statRowDense: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
      marginBottom: 2,
    },
    statRowGrid2: {
      justifyContent: 'space-between',
      rowGap: 6,
      columnGap: 6,
    },
    statPill: {
      minWidth: 88,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.cardNested,
      borderWidth: 1,
      borderColor: c.border,
    },
    statPillDense: {
      minWidth: 72,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: c.cardNested,
      borderWidth: 1,
      borderColor: c.border,
    },
    statPillGrid2: {
      width: '48%',
      minWidth: 0,
      minHeight: 52,
      paddingVertical: 7,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statPillEmphasis: {
      borderColor: c.accent,
      backgroundColor: c.sessaoBg,
    },
    statPillWarn: {
      borderColor: c.warn,
      backgroundColor: c.semSaldoBg,
    },
    statPillMuted: {
      opacity: 0.72,
    },
    statPillSuccess: {
      borderColor: c.success,
      borderWidth: 1.5,
      backgroundColor: c.id === 'claroSistema' ? '#e6f4ea' : `rgba(${ISO_BRAND_GREEN_400_RGB}, 0.16)`,
    },
    statPillValue: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
    },
    statPillValueDense: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
    },
    statPillValueGrid2: {
      textAlign: 'center',
      width: '100%',
    },
    statPillValueEmphasis: {
      color: c.accent,
    },
    statPillValueWarn: {
      color: c.warn,
    },
    statPillValueSuccess: {
      color: c.success,
    },
    statPillLabelSuccess: {
      color: c.success,
    },
    statPillLabel: {
      color: c.textSecondary,
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
    },
    statPillLabelDense: {
      color: c.textSecondary,
      fontSize: 10,
      marginTop: 2,
      fontWeight: '700',
    },
    statPillLabelGrid2: {
      textAlign: 'center',
      fontSize: 9,
      lineHeight: 12,
      marginTop: 3,
    },
    sectionCard: {
      marginBottom: 14,
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    sectionTitle: {
      color: c.formLabel,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    entityCard: {
      marginBottom: 14,
      padding: 16,
      borderRadius: 18,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: c.id === 'claroSistema' ? 0.06 : 0.28,
      shadowRadius: 10,
      elevation: c.id === 'claroSistema' ? 2 : 3,
    },
    entityCardPressed: {
      opacity: 0.94,
      borderColor: c.accentMuted,
      transform: [{ scale: 0.995 }],
    },
    entityTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    entitySubtitle: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    entityActionBtn: {
      marginTop: 14,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.primaryBtn,
      alignItems: 'center',
      ...neonPrimaryButtonExtras(c),
    },
    entityActionBtnText: {
      color: c.primaryBtnText,
      fontWeight: '800',
      fontSize: 15,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.rowBorder,
    },
    metaRowLast: {
      borderBottomWidth: 0,
    },
    metaLabel: {
      color: c.textMuted,
      fontSize: 12,
      flex: 1,
    },
    metaValue: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
      flex: 1.2,
      textAlign: 'right',
    },
    badge: {
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.35,
      textTransform: 'uppercase',
    },
    emptyPanel: {
      marginVertical: 8,
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    emptyTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
    },
    primaryBtn: {
      backgroundColor: c.primaryBtn,
      paddingVertical: 15,
      paddingHorizontal: 18,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginBottom: 10,
      ...neonPrimaryButtonExtras(c),
    },
    primaryBtnDisabled: { opacity: 0.55 },
    primaryBtnText: {
      color: c.primaryBtnText,
      fontWeight: '800',
      fontSize: 16,
    },
    secondaryBtn: {
      backgroundColor: c.secondaryBtn,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 10,
    },
    secondaryBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: 15,
    },
  });
}

export type MobileShellStyles = ReturnType<typeof buildMobileShellStyles>;

export type StatusBadgeTone = 'neutral' | 'success' | 'warn' | 'info' | 'danger';

/** Badges com contraste legível em todos os temas (evita fundo=texto neon/roxo). */
export function statusBadgeColors(c: ThemeColors, tone: StatusBadgeTone) {
  switch (tone) {
    case 'success':
      return {
        bg: c.id === 'claroSistema' ? '#e6f4ea' : 'rgba(52, 211, 153, 0.16)',
        border: c.success,
        text: c.id === 'claroSistema' ? '#137333' : '#d1fae5',
      };
    case 'warn':
      return {
        bg: c.id === 'claroSistema' ? '#fef7e0' : 'rgba(245, 158, 11, 0.16)',
        border: c.warn,
        text: c.id === 'claroSistema' ? '#b06000' : '#fde68a',
      };
    case 'info':
      if (c.id === 'claroSistema') {
        return { bg: '#e8f0fe', border: '#1a73e8', text: '#174ea6' };
      }
      if (c.id === 'neonVerde') {
        return { bg: 'rgba(57, 255, 20, 0.14)', border: '#6dff3a', text: '#f0fff4' };
      }
      if (c.id === 'escuroSistema') {
        return { bg: 'rgba(138, 180, 248, 0.18)', border: '#8ab4f8', text: '#e8f0fe' };
      }
      return { bg: 'rgba(52, 211, 153, 0.16)', border: c.accent, text: '#ecfdf5' };
    case 'danger':
      return {
        bg: c.id === 'claroSistema' ? '#fce8e6' : 'rgba(239, 68, 68, 0.14)',
        border: c.err,
        text: c.id === 'claroSistema' ? '#b3261e' : '#fecaca',
      };
    default:
      return {
        bg: c.cardNested,
        border: c.borderStrong,
        text: c.textSecondary,
      };
  }
}

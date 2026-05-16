/**
 * Verde institucional I.S.O PRO — espelha `--iso-brand-green-*` em `iso-pro-desktop/src/index.css`
 * e `public/logo-institutional-default.svg` (cor principal: g400).
 */
export const ISO_BRAND_GREEN = {
  g50: '#ecfdf5',
  g100: '#d1fae5',
  g200: '#a7f3d0',
  g300: '#6ee7b7',
  g400: '#34d399',
  g500: '#22c55a',
  g600: '#16a34a',
  g700: '#15803d',
  g800: '#166534',
  g900: '#14532d',
} as const;

/** Mesmo triplo que `--iso-brand-green-400-rgb` no desktop (para `rgba(..., α)`). */
export const ISO_BRAND_GREEN_400_RGB = '52, 211, 153' as const;

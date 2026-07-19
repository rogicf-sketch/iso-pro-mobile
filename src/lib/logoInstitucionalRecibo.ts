/** Logo e rodapé padrão do recibo — alinhado ao I.S.O PRO desktop (offline no mobile). */

/** SVG `logo-institutional-default.svg` do desktop, embutido (~1,7 KB). */
export const LOGO_INSTITUCIONAL_PADRAO_FABRICA_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyODggOTIiIHdpZHRoPSIyODgiIGhlaWdodD0iOTIiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0iSS5TLk8gUFJPIEdlc3RhbyBkZSBNYXRlcmlhaXMiPgogIDxkZWZzPgogICAgPGZpbHRlciBpZD0iaXNvUHJvTG9nb0dsb3ciIHg9Ii00MCUiIHk9Ii00MCUiIHdpZHRoPSIxODAlIiBoZWlnaHQ9IjE4MCUiPgogICAgICA8ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIwLjgiIHJlc3VsdD0iYiIgLz4KICAgICAgPGZlTWVyZ2U+CiAgICAgICAgPGZlTWVyZ2VOb2RlIGluPSJiIiAvPgogICAgICAgIDxmZU1lcmdlTm9kZSBpbj0iU291cmNlR3JhcGhpYyIgLz4KICAgICAgPC9mZU1lcmdlPgogICAgPC9maWx0ZXI+CiAgPC9kZWZzPgogIDxyZWN0IHg9IjEuNSIgeT0iMS41IiB3aWR0aD0iMjg1IiBoZWlnaHQ9Ijg5IiByeD0iMTQiIGZpbGw9IiMwZjExMWEiIHN0cm9rZT0iIzFmM2QyZSIgc3Ryb2tlLXdpZHRoPSIxLjUiIC8+CiAgPGxpbmUgeDE9IjE0NCIgeTE9IjIyIiB4Mj0iMTQ0IiB5Mj0iNTQiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuNDUiIHN0cm9rZS13aWR0aD0iMS4yIiAvPgogIDx0ZXh0IHg9IjcyIiB5PSI0NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2Y4ZmFmYyIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgU2Vnb2UgVUksIFJvYm90bywgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOSIgZm9udC13ZWlnaHQ9IjcwMCIgbGV0dGVyLXNwYWNpbmc9IjAuMTJlbSI+SSAmIzE4MzsgUyAmIzE4MzsgTzwvdGV4dD4KICA8dGV4dCB4PSIyMTYiIHk9IjQ2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzlmZjE0IiBmb250LWZhbWlseT0ic3lzdGVtLXVpLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE5IiBmb250LXdlaWdodD0iNzAwIiBsZXR0ZXItc3BhY2luZz0iMC4xNGVtIiBmaWx0ZXI9InVybCgjaXNvUHJvTG9nb0dsb3cpIj5QUk88L3RleHQ+CiAgPHRleHQgeD0iMTQ0IiB5PSI3NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzM5ZmYxNCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgU2Vnb2UgVUksIFJvYm90bywgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMCIgZm9udC13ZWlnaHQ9IjYwMCIgbGV0dGVyLXNwYWNpbmc9IjAuMTJlbSIgZmlsdGVyPSJ1cmwoI2lzb1Byb0xvZ29HbG93KSI+R0VTVCYjMjI3O08gREUgTUFURVJJQUlTPC90ZXh0Pgo8L3N2Zz4K';

export const DOCUMENTO_RODAPE_CNPJ_PADRAO = '66.234.531/0001-57';
export const DOCUMENTO_RODAPE_NOME_PADRAO = 'I.S.O PRO Gestão de Materiais';

const CAMINHOS_LOGO_PADRAO_DESKTOP = new Set([
  './logo-institutional-default.svg',
  '/logo-institutional-default.svg',
  'logo-institutional-default.svg',
]);

function ehCaminhoLogoPadraoDesktop(url: string): boolean {
  const t = url.trim();
  if (CAMINHOS_LOGO_PADRAO_DESKTOP.has(t)) return true;
  return /logo-institutional-default\.svg$/i.test(t.replace(/\\/g, '/'));
}

/**
 * Caminhos relativos do desktop (`./logo.svg`) não carregam no HTML do expo-print;
 * usa logo embutido ou URL absoluta / data URL da configuração sincronizada.
 */
export function resolverUrlLogoReciboMobile(cfgUrl?: string | null): string {
  const url = (cfgUrl ?? '').trim();
  if (!url || ehCaminhoLogoPadraoDesktop(url)) return LOGO_INSTITUCIONAL_PADRAO_FABRICA_DATA_URL;
  if (url.startsWith('data:') || /^https?:\/\//i.test(url)) return url;
  return LOGO_INSTITUCIONAL_PADRAO_FABRICA_DATA_URL;
}

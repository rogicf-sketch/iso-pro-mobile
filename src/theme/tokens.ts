import { ISO_BRAND_GREEN, ISO_BRAND_GREEN_400_RGB } from '@/src/theme/brand';

export type ThemeId = 'padraoEscuro' | 'escuroSistema' | 'neonVerde' | 'claroSistema';

/** Ordem fixa dos 4 temas no ecrã Aparência. */
export const THEME_ORDER: ThemeId[] = ['padraoEscuro', 'escuroSistema', 'neonVerde', 'claroSistema'];

/**
 * Paletas alinhadas a UI de sistema (Material / modo claro-escuro) + neon verde + padrão da app.
 * displayName = nome na lista; formLabel = cor de rótulos de formulário (não confundir).
 */
export interface ThemeColors {
  id: ThemeId;
  /** Nome curto na lista de temas */
  displayName: string;
  /** Uma linha de contexto (estilo sistema / app) */
  themeHint: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  cardNested: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentMuted: string;
  accentCode: string;
  indigoPanel: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Cor de rótulos de campo (evita colisão com displayName do tema) */
  formLabel: string;
  inputBg: string;
  placeholder: string;
  primaryBtn: string;
  /** Texto (e spinners) sobre `primaryBtn` — em neon verde: menta escuro, não branco sobre lima. */
  primaryBtnText: string;
  secondaryBtn: string;
  successBtn: string;
  err: string;
  warn: string;
  success: string;
  sessaoBg: string;
  rowBorder: string;
  cod: string;
  modalOverlay: string;
  modalCard: string;
  modalText: string;
  scannerCloseBg: string;
  sugestaoBorder: string;
  docsMaterialTit: string;
  semSaldoBg: string;
  semSaldoBorder: string;
  semSaldoBorderSoft: string;
  codSemSaldo: string;
  descSemSaldo: string;
  metaSemSaldo: string;
  badgeSemSaldo: string;
  inQSemSaldoBg: string;
  inQSemSaldoBorder: string;
  inQSemSaldoText: string;
  compModalBtnPrint: string;
  compModalBtnShare: string;
  tabBarBg: string;
  tabBarBorder: string;
  headerBg: string;
  /** Fundo do bloco do logo na home — alinhado ao tema (evita “caixa preta” solta). */
  logoShelfBg: string;
  drawerBg: string;
  drawerItemActiveBg: string;
  statusBarStyle: 'light' | 'dark';
}

export const themes: Record<ThemeId, ThemeColors> = {
  padraoEscuro: {
    id: 'padraoEscuro',
    displayName: 'Padrão escuro (sistema)',
    themeHint: 'Azul-grafite suave, verde esmeralda I.S.O PRO — hierarquia clara entre fundo, cartão e destaque.',
    bg: '#0a0e14',
    surface: '#121a24',
    surfaceElevated: '#1a2431',
    card: '#1e2a3a',
    cardNested: '#0f1622',
    border: '#2a3d50',
    borderStrong: '#3d5369',
    accent: ISO_BRAND_GREEN.g400,
    accentMuted: ISO_BRAND_GREEN.g300,
    accentCode: ISO_BRAND_GREEN.g300,
    indigoPanel: ISO_BRAND_GREEN.g400,
    text: '#f8fafc',
    textSecondary: '#8fa3b8',
    textMuted: '#6b7d92',
    formLabel: '#c5d0dc',
    inputBg: '#1a2431',
    placeholder: '#6b7d92',
    primaryBtn: ISO_BRAND_GREEN.g600,
    primaryBtnText: '#ffffff',
    secondaryBtn: '#2f4156',
    successBtn: ISO_BRAND_GREEN.g700,
    err: '#f87171',
    warn: '#fbbf24',
    success: ISO_BRAND_GREEN.g500,
    sessaoBg: `rgba(${ISO_BRAND_GREEN_400_RGB}, 0.1)`,
    rowBorder: '#2a3d50',
    cod: ISO_BRAND_GREEN.g300,
    modalOverlay: 'rgba(8,12,18,0.9)',
    modalCard: '#1e2a3a',
    modalText: '#e8eef5',
    scannerCloseBg: 'rgba(10,14,20,0.88)',
    sugestaoBorder: ISO_BRAND_GREEN.g400,
    docsMaterialTit: ISO_BRAND_GREEN.g200,
    semSaldoBg: 'rgba(220, 38, 38, 0.16)',
    semSaldoBorder: '#ef4444',
    semSaldoBorderSoft: 'rgba(248, 113, 113, 0.4)',
    codSemSaldo: '#fecaca',
    descSemSaldo: '#fca5a5',
    metaSemSaldo: '#fee2e2',
    badgeSemSaldo: '#fecaca',
    inQSemSaldoBg: '#450a0a',
    inQSemSaldoBorder: '#7f1d1d',
    inQSemSaldoText: '#8fa3b8',
    compModalBtnPrint: '#3d5369',
    compModalBtnShare: '#2f4156',
    tabBarBg: '#0f141c',
    tabBarBorder: '#1a2431',
    headerBg: '#0f141c',
    logoShelfBg: '#1a2431',
    drawerBg: '#070a10',
    drawerItemActiveBg: `rgba(${ISO_BRAND_GREEN_400_RGB}, 0.14)`,
    statusBarStyle: 'light',
  },

  /** Neutros e azul Google — próximo do modo escuro Material / sistema. */
  escuroSistema: {
    id: 'escuroSistema',
    displayName: 'Escuro (sistema)',
    themeHint: 'Cinzas equilibrados e azul de acento — menos contraste nas bordas, texto secundário mais legível.',
    bg: '#131313',
    surface: '#1c1c1c',
    surfaceElevated: '#262626',
    card: '#222222',
    cardNested: '#161616',
    border: '#383838',
    borderStrong: '#555555',
    accent: '#8ab4f8',
    accentMuted: '#a8c7fa',
    accentCode: '#9ec5ff',
    indigoPanel: '#c4a8e8',
    text: '#ececec',
    textSecondary: '#b8b8b8',
    textMuted: '#8f8f8f',
    formLabel: '#d4d4d4',
    inputBg: '#262626',
    placeholder: '#8f8f8f',
    primaryBtn: '#8ab4f8',
    primaryBtnText: '#0d1117',
    secondaryBtn: '#383838',
    successBtn: '#81c784',
    err: '#f28b82',
    warn: '#fdd663',
    success: '#81c784',
    sessaoBg: 'rgba(138, 180, 248, 0.12)',
    rowBorder: '#383838',
    cod: '#b3cffc',
    modalOverlay: 'rgba(0,0,0,0.82)',
    modalCard: '#262626',
    modalText: '#ececec',
    scannerCloseBg: 'rgba(20,20,20,0.92)',
    sugestaoBorder: '#8ab4f8',
    docsMaterialTit: '#c4a8e8',
    semSaldoBg: 'rgba(220, 38, 38, 0.18)',
    semSaldoBorder: '#f28b82',
    semSaldoBorderSoft: 'rgba(242, 139, 130, 0.4)',
    codSemSaldo: '#fecaca',
    descSemSaldo: '#fca5a5',
    metaSemSaldo: '#fee2e2',
    badgeSemSaldo: '#fecaca',
    inQSemSaldoBg: '#450a0a',
    inQSemSaldoBorder: '#991b1b',
    inQSemSaldoText: '#b8b8b8',
    compModalBtnPrint: '#555555',
    compModalBtnShare: '#383838',
    tabBarBg: '#161616',
    tabBarBorder: '#222222',
    headerBg: '#161616',
    logoShelfBg: '#222222',
    drawerBg: '#131313',
    drawerItemActiveBg: 'rgba(138, 180, 248, 0.12)',
    statusBarStyle: 'light',
  },

  /**
   * Verde neon (#39ff14) no resto da UI; só os botões de ação usam fundo escuro + texto menta (`primaryBtn` / `primaryBtnText`).
   */
  neonVerde: {
    id: 'neonVerde',
    displayName: 'Neon verde (sistema)',
    themeHint: 'Fundo quase preto com matiz verde; contornos mais suaves e texto secundário mais legível — menos fadiga visual.',
    bg: '#030806',
    surface: '#0a100d',
    surfaceElevated: '#101816',
    card: '#0e1512',
    cardNested: '#060a08',
    border: 'rgba(57, 255, 20, 0.16)',
    borderStrong: 'rgba(57, 255, 20, 0.3)',
    accent: '#39ff14',
    accentMuted: '#6dff3a',
    accentCode: '#b0ffcc',
    indigoPanel: '#39ff14',
    text: '#f4fdf7',
    textSecondary: '#a8dcc0',
    textMuted: '#6ea389',
    formLabel: '#c4eed8',
    inputBg: '#0b110e',
    placeholder: '#6ea389',
    primaryBtn: '#0f1f18',
    primaryBtnText: '#e8fdf0',
    secondaryBtn: '#12261c',
    successBtn: '#00e676',
    err: '#ff8a80',
    warn: '#ffd54f',
    success: '#7dff9a',
    sessaoBg: 'rgba(57, 255, 20, 0.07)',
    rowBorder: 'rgba(57, 255, 20, 0.12)',
    cod: '#8ef5b0',
    modalOverlay: 'rgba(0,0,0,0.86)',
    modalCard: '#101816',
    modalText: '#e8f5e9',
    scannerCloseBg: 'rgba(4,8,6,0.9)',
    sugestaoBorder: 'rgba(57, 255, 20, 0.55)',
    docsMaterialTit: '#8ef5b0',
    semSaldoBg: 'rgba(220, 38, 38, 0.2)',
    semSaldoBorder: '#ff8a80',
    semSaldoBorderSoft: 'rgba(255, 138, 128, 0.4)',
    codSemSaldo: '#fecaca',
    descSemSaldo: '#fca5a5',
    metaSemSaldo: '#fee2e2',
    badgeSemSaldo: '#fecaca',
    inQSemSaldoBg: '#450a0a',
    inQSemSaldoBorder: '#991b1b',
    inQSemSaldoText: '#9bc4b0',
    compModalBtnPrint: '#2a4539',
    compModalBtnShare: '#1a3028',
    tabBarBg: '#030806',
    tabBarBorder: 'rgba(57, 255, 20, 0.14)',
    headerBg: '#030806',
    logoShelfBg: '#060d09',
    drawerBg: '#030806',
    drawerItemActiveBg: 'rgba(57, 255, 20, 0.18)',
    statusBarStyle: 'light',
  },

  /** Claro neutro — próximo do modo claro do sistema. */
  claroSistema: {
    id: 'claroSistema',
    displayName: 'Claro (sistema)',
    themeHint: 'Off-white e branco suave; separadores discretos e barra clara — menos brilho que branco puro.',
    bg: '#eef0f4',
    surface: '#ffffff',
    surfaceElevated: '#f7f8fa',
    card: '#ffffff',
    cardNested: '#eceef2',
    border: '#dadce0',
    borderStrong: '#bdc1c8',
    accent: '#1a73e8',
    accentMuted: '#4285f4',
    accentCode: '#1557b0',
    indigoPanel: '#5f6368',
    text: '#202124',
    textSecondary: '#5f6368',
    textMuted: '#80868b',
    formLabel: '#3c4043',
    inputBg: '#fafbfc',
    placeholder: '#9aa0a6',
    primaryBtn: '#1a73e8',
    primaryBtnText: '#ffffff',
    secondaryBtn: '#e8eaed',
    successBtn: '#188038',
    err: '#d93025',
    warn: '#f9ab00',
    success: '#188038',
    sessaoBg: '#e8f0fe',
    rowBorder: '#dadce0',
    cod: '#1557b0',
    modalOverlay: 'rgba(32,33,36,0.4)',
    modalCard: '#ffffff',
    modalText: '#202124',
    scannerCloseBg: 'rgba(255,255,255,0.96)',
    sugestaoBorder: '#1a73e8',
    docsMaterialTit: '#174ea6',
    semSaldoBg: 'rgba(217, 48, 37, 0.09)',
    semSaldoBorder: '#d93025',
    semSaldoBorderSoft: 'rgba(217, 48, 37, 0.32)',
    codSemSaldo: '#b3261e',
    descSemSaldo: '#c5221f',
    metaSemSaldo: '#8c1d18',
    badgeSemSaldo: '#c5221f',
    inQSemSaldoBg: '#fce8e6',
    inQSemSaldoBorder: '#fad2cf',
    inQSemSaldoText: '#80868b',
    compModalBtnPrint: '#5f6368',
    compModalBtnShare: '#e8eaed',
    tabBarBg: '#fafbfd',
    tabBarBorder: '#e8eaed',
    headerBg: '#fafbfd',
    /** Faixa escura da marca — funde o PNG (fundo escuro) com o tema claro. */
    logoShelfBg: '#0c1528',
    drawerBg: '#f5f6f8',
    drawerItemActiveBg: '#e3eefc',
    statusBarStyle: 'dark',
  },
};

export const THEME_STORAGE_KEY = 'iso_pro_theme_id';

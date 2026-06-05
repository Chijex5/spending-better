import '@/global.css';

export const monikeColors = {
  bgVoid: '#080A0C',
  bgSurface: '#0F1214',
  bgElevated: '#161A1D',
  bgOverlay: '#1C2126',
  bgStripe: '#0D1013',
  inkPrimary: '#E8EBF0',
  inkSecondary: '#8B939E',
  inkMuted: '#4A5260',
  inkGhost: '#2A3040',
  accentPulse: '#00E676',
  accentGlow: '#00C853',
  accentNeon: '#69FF9C',
  signalAmber: '#FFB300',
  signalAmberDim: '#A07000',
  signalRed: '#FF3D3D',
  signalRedDim: '#8B0000',
  signalBlue: '#4FC3F7',
  dataBarLow: '#00E676',
  dataBarMid: '#FFB300',
  dataBarHigh: '#FF3D3D',
} as const;

export const monikeFonts = {
  body: 'DMSans_500Medium',
  bodyRegular: 'DMSans_400Regular',
  heading: 'Sora_600SemiBold',
  mono: 'DMMono_500Medium',
  monoBold: 'DMMono_700Bold',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export const layout = {
  horizontalPadding: 20,
  statusBarClearance: 48,
  cardRadius: 16,
  cardPadding: 18,
  rowHeight: 60,
  bottomNavHeight: 72,
} as const;

export const chartDefaults = {
  gridDash: '4 4',
  gridOpacity: 0.4,
  axisFontSize: 10,
  tooltipBorderWidth: 1,
} as const;

export const Colors = {
  light: {
    text: monikeColors.inkPrimary,
    background: monikeColors.bgVoid,
    backgroundElement: monikeColors.bgSurface,
    backgroundSelected: monikeColors.bgElevated,
    textSecondary: monikeColors.inkSecondary,
  },
  dark: {
    text: monikeColors.inkPrimary,
    background: monikeColors.bgVoid,
    backgroundElement: monikeColors.bgSurface,
    backgroundSelected: monikeColors.bgElevated,
    textSecondary: monikeColors.inkSecondary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = {
  sans: monikeFonts.body,
  serif: monikeFonts.heading,
  rounded: monikeFonts.heading,
  mono: monikeFonts.mono,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 20,
  five: 24,
  six: 32,
} as const;

export const BottomTabInset = layout.bottomNavHeight;
export const MaxContentWidth = 390;

import '@/global.css';

import { Platform } from 'react-native';

export const MonikeColors = {
  bgVoid: '#080A0C',
  bgSurface: '#0F1214',
  bgElevated: '#161A1D',
  bgOverlay: '#1C2126',
  bgStripe: '#0D1013',
  inkPrimary: '#E8EBF0',
  inkSecondary: '#8B939E',
  grey:'#242424',
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
  accentOrange: '#FF6633',
} as const;

export const Colors = {
  light: {
    text: MonikeColors.inkPrimary,
    background: MonikeColors.bgVoid,
    backgroundElement: MonikeColors.bgSurface,
    backgroundSelected: MonikeColors.bgElevated,
    textSecondary: MonikeColors.inkSecondary,
  },
  dark: {
    text: MonikeColors.inkPrimary,
    background: MonikeColors.bgVoid,
    backgroundElement: MonikeColors.bgSurface,
    backgroundSelected: MonikeColors.bgElevated,
    textSecondary: MonikeColors.inkSecondary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const AccentPresets = {
  Emerald: '#0E9F6E',
  Violet: '#5B5BD6',
  Ocean: '#0E84B8',
} as const;

export type AccentName = keyof typeof AccentPresets;

export const Fonts = Platform.select({
  ios: {
    sans: 'DM Sans',
    heading: 'Sora',
    mono: 'DM Mono',
  },
  android: {
    sans: 'sans-serif',
    heading: 'sans-serif-medium',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-body)',
    heading: 'var(--font-heading)',
    mono: 'var(--font-display)',
  },
  default: {
    sans: 'sans-serif',
    heading: 'sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 32,
  eight: 48,
} as const;

export const BottomTabInset = 80;
export const CardRadius = 16;
export const ScreenPadding = 20;
export const MaxContentWidth = 390;

import '@/global.css';

import { Platform } from 'react-native';

// Single global palette pair — every screen reads from one of these two
// depending on the user's dark/light preference. Hex values match the
// canonical design prototype (monike.dc.html) exactly.
export const DarkPalette = {
  bg: '#0A0E0C',
  card: '#141A17',
  ink: '#ECF1EE',
  ink2: '#8A938D',
  ink3: '#5A635D',
  line: '#222B26',
  chip: '#1B221E',
} as const;

export const LightPalette = {
  bg: '#F4F3EE',
  card: '#FFFFFF',
  ink: '#16211B',
  ink2: '#6E7872',
  ink3: '#A9B0AB',
  line: '#EBEBE3',
  chip: '#EFEFEA',
} as const;

export type Palette = {
  bg: string; card: string; ink: string; ink2: string; ink3: string; line: string; chip: string;
};

export function paletteFor(dark: boolean): Palette {
  return dark ? DarkPalette : LightPalette;
}

// Appends an alpha channel to a 6-digit hex color, e.g. hexAlpha('#0E9F6E', 0.16).
export function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

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

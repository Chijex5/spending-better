import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { useSWR } from '@/hooks/use-swr';
import { apiFetch, apiPost } from '@/services/api';
import { AccentPresets, hexAlpha, paletteFor, type AccentName, type Palette } from '@/constants/theme';

export type SettingsData = {
  display_name: string;
  email: string;
  monthly_budget: number;
  high_spend_threshold: number;
  notify_high_spend: boolean;
  notify_weekly_summary: boolean;
  notify_model_updates: boolean;
  accent_theme: AccentName;
  dark_mode: boolean;
};

type AccentContextValue = {
  accentName: AccentName;
  accent: string;
  accentTint: string;
  setAccentName: (name: AccentName) => Promise<void>;
  dark: boolean;
  setDark: (dark: boolean) => Promise<void>;
  colors: Palette;
  settings?: SettingsData;
  settingsLoading: boolean;
  mutateSettings: () => Promise<SettingsData | undefined>;
};

const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<SettingsData>('/settings', apiFetch);

  const accentName = data?.accent_theme ?? 'Emerald';
  const accent = AccentPresets[accentName] ?? AccentPresets.Emerald;
  const dark = data?.dark_mode ?? true;
  const colors = paletteFor(dark);
  const accentTint = hexAlpha(accent, dark ? 0.16 : 0.11);

  const setAccentName = useCallback(async (name: AccentName) => {
    if (!data) return;
    await apiPost('/settings', { ...data, accent_theme: name });
    await mutate();
  }, [data, mutate]);

  const setDark = useCallback(async (value: boolean) => {
    if (!data) return;
    await apiPost('/settings', { ...data, dark_mode: value });
    await mutate();
  }, [data, mutate]);

  const value = useMemo<AccentContextValue>(() => ({
    accentName,
    accent,
    accentTint,
    setAccentName,
    dark,
    setDark,
    colors,
    settings: data,
    settingsLoading: isLoading,
    mutateSettings: mutate,
  }), [accentName, accent, accentTint, setAccentName, dark, setDark, colors, data, isLoading, mutate]);

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
}

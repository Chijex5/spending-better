import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { useSWR } from '@/hooks/use-swr';
import { apiFetch, apiPost } from '@/services/api';
import { AccentPresets, type AccentName } from '@/constants/theme';

export type SettingsData = {
  display_name: string;
  email: string;
  monthly_budget: number;
  high_spend_threshold: number;
  notify_high_spend: boolean;
  notify_weekly_summary: boolean;
  notify_model_updates: boolean;
  accent_theme: AccentName;
};

type AccentContextValue = {
  accentName: AccentName;
  accent: string;
  setAccentName: (name: AccentName) => Promise<void>;
  settings?: SettingsData;
  settingsLoading: boolean;
  mutateSettings: () => Promise<SettingsData | undefined>;
};

const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<SettingsData>('/settings', apiFetch);

  const accentName = data?.accent_theme ?? 'Emerald';
  const accent = AccentPresets[accentName] ?? AccentPresets.Emerald;

  const setAccentName = useCallback(async (name: AccentName) => {
    if (!data) return;
    await apiPost('/settings', { ...data, accent_theme: name });
    await mutate();
  }, [data, mutate]);

  const value = useMemo<AccentContextValue>(() => ({
    accentName,
    accent,
    setAccentName,
    settings: data,
    settingsLoading: isLoading,
    mutateSettings: mutate,
  }), [accentName, accent, setAccentName, data, isLoading, mutate]);

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
}

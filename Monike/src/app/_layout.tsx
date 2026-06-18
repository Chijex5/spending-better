import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AccentProvider } from '@/contexts/accent-context';
import { useSWR } from '@/hooks/use-swr';
import { apiFetch } from '@/services/api';
import { MonikeColors } from '@/constants/theme';

function StartupPrefetch() {
  useSWR('/model/status', apiFetch);
  return null;
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <AccentProvider>
        <StartupPrefetch />
        <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: MonikeColors.bgVoid } }} />
      </AccentProvider>
    </>
  );
}

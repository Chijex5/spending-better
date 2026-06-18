import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { MonikeShellProvider } from '@/components/shell-context';
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
        <MonikeShellProvider>
          <StartupPrefetch />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: MonikeColors.bgVoid } }} />
        </MonikeShellProvider>
      </AccentProvider>
    </>
  );
}

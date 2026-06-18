import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AccentProvider, useAccent } from '@/contexts/accent-context';
import { useSWR } from '@/hooks/use-swr';
import { apiFetch } from '@/services/api';

function StartupPrefetch() {
  useSWR('/model/status', apiFetch);
  return null;
}

function AppShell() {
  const { dark, colors } = useAccent();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <StartupPrefetch />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AccentProvider>
      <AppShell />
    </AccentProvider>
  );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { MonikeShellProvider } from '@/components/shell-context';
import { MonikeColors } from '@/constants/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <MonikeShellProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: MonikeColors.bgVoid } }} />
      </MonikeShellProvider>
    </>
  );
}

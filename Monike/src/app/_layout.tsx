import { DarkTheme, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';

import AppTabs from '@/components/app-tabs';
import { MonikeSplashScreen } from '@/components/monike-splash-screen';

const LOAD_DURATION_MS = 1500;
const API_TIMEOUT_MS = 1200;

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0D0D0D',
    card: '#171717',
    primary: '#2ECC71',
    text: '#FFFFFF',
    border: '#1F1F1F',
  },
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function preloadDashboardData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    await fetch('https://jsonplaceholder.typicode.com/todos/1', { signal: controller.signal });
  } catch {
    // Allow app to continue even if initial fetch fails.
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function TabLayout() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function initializeApp() {
      await Promise.allSettled([preloadDashboardData(), wait(LOAD_DURATION_MS)]);
      if (active) {
        setIsLoading(false);
      }
    }

    initializeApp();

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return <MonikeSplashScreen />;
  }

  return (
    <ThemeProvider value={AppTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}

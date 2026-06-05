import { BlurView } from 'expo-blur';
import { SplashScreen, Tabs } from 'expo-router';
import { useFonts } from 'expo-font';
import { DMMono_500Medium, DMMono_700Bold } from '@expo-google-fonts/dm-mono';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Sora_600SemiBold } from '@expo-google-fonts/sora';
import { ArrowDownUp, ChartColumnBig } from 'lucide-react-native';
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout, monikeColors, monikeFonts } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function TabIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  return (
    <View style={styles.tabIconWrap}>
      {children}
      <View style={[styles.tabDot, focused && styles.tabDotActive]} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMMono_500Medium,
    DMMono_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    Sora_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: monikeColors.bgVoid },
        tabBarActiveTintColor: monikeColors.accentPulse,
        tabBarInactiveTintColor: monikeColors.inkMuted,
        tabBarLabelStyle: {
          fontFamily: monikeFonts.body,
          fontSize: 11,
          letterSpacing: 0.44,
          textTransform: 'uppercase',
          marginBottom: 8,
        },
        tabBarStyle: {
          backgroundColor: 'rgba(15, 18, 20, 0.9)',
          borderTopColor: monikeColors.inkGhost,
          borderTopWidth: 1,
          height: layout.bottomNavHeight,
        },
        tabBarBackground: () => <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mirror',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <ChartColumnBig size={24} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <ArrowDownUp size={24} color={color} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: 'center',
    gap: 4,
  },
  tabDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabDotActive: {
    backgroundColor: monikeColors.accentPulse,
  },
});

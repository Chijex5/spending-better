import { useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, Home, LineChart, PieChart } from 'lucide-react-native';

import { Fonts, MonikeColors } from '@/constants/theme';

type RouteName = 'home' | 'explore' | 'categories' | 'patterns';

type NavigationTab = {
  key: RouteName;
  label: string;
  route: '/' | '/explore' | '/categories' | '/patterns';
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

const tabs: NavigationTab[] = [
  { key: 'home', label: 'Home', route: '/', Icon: Home },
  { key: 'explore', label: 'Explore', route: '/explore', Icon: LineChart },
  { key: 'categories', label: 'Categories', route: '/categories', Icon: PieChart },
  { key: 'patterns', label: 'Patterns', route: '/patterns', Icon: Activity },
];

function PressScale({
  children,
  disabled,
  style,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: 0.94,
      duration: 60,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function BottomNavigation({ activeRoute }: { activeRoute: RouteName }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }] }>
      {tabs.map(({ key, label, route, Icon }) => {
        const active = key === activeRoute;
        return (
          <PressScale
            key={key}
            disabled={active}
            style={[styles.navItem, active && styles.navItemActive]}
            onPress={() => router.navigate(route)}
          >
            <View style={[styles.iconShell, active && styles.iconShellActive]}>
              <Icon
                size={22}
                color={active ? MonikeColors.bgVoid : MonikeColors.inkMuted}
                strokeWidth={active ? 2.2 : 1.7}
              />
            </View>
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
            {active ? <View style={styles.navDot} /> : null}
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F1214F2',
    borderTopWidth: 1,
    borderTopColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  navItemActive: {
    opacity: 1,
  },
  iconShell: {
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconShellActive: {
    backgroundColor: MonikeColors.accentPulse,
    shadowColor: MonikeColors.accentPulse,
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  navLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
  },
  navLabelActive: {
    color: MonikeColors.accentPulse,
  },
  navDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: MonikeColors.accentPulse,
  },
});

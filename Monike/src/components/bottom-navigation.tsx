import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, Compass, House, PieChart, PlusCircle, ShieldAlert } from 'lucide-react-native';

import { Fonts, MonikeColors } from '@/constants/theme';

type RouteName = 'home' | 'explore' | 'categories' | 'patterns' | 'forecast' | 'log';

type NavigationTab = {
  key: RouteName;
  label: string;
  route: '/' | '/explore' | '/categories' | '/patterns' | '/forecast' | '/log';
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  special?: boolean;
};

const tabs: NavigationTab[] = [
  { key: 'home', label: 'Home', route: '/', Icon: House },
  { key: 'explore', label: 'Explore', route: '/explore', Icon: Compass },
  { key: 'categories', label: 'Categories', route: '/categories', Icon: PieChart },
  { key: 'patterns', label: 'Patterns', route: '/patterns', Icon: Activity },
  { key: 'forecast', label: 'Risk', route: '/forecast', Icon: ShieldAlert },
  { key: 'log', label: 'Log', route: '/log', Icon: PlusCircle, special: true },
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
      toValue: 0.96,
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
  const { width } = useWindowDimensions();
  const indicatorX = useRef(new Animated.Value(0)).current;
  const tabWidth = width / tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeRoute));

  useEffect(() => {
    Animated.timing(indicatorX, {
      toValue: activeIndex * tabWidth + (tabWidth - 20) / 2,
      duration: 250,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorX, tabWidth]);

  return (
    <View style={[styles.bottomNav, { height: 68 + insets.bottom, paddingBottom: insets.bottom }] }>
      <Animated.View style={[styles.activePill, { transform: [{ translateX: indicatorX }] }]} />
      {tabs.map(({ key, label, route, Icon, special }) => {
        const active = key === activeRoute;
        const color = active || special ? MonikeColors.accentPulse : MonikeColors.inkMuted;
        return (
          <PressScale
            key={key}
            disabled={active}
            style={styles.navItem}
            onPress={() => router.navigate(route)}
          >
            <View style={styles.iconUnit}>
              {special ? <View style={styles.logGlow} /> : null}
              <Icon
                size={special ? 26 : 22}
                color={color}
                strokeWidth={active ? 2.2 : 1.8}
              />
            </View>
            <Text style={[styles.navLabel, { color }, active && styles.navLabelActive, special && styles.logLabel]}>{label}</Text>
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
    alignItems: 'stretch',
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 3,
    borderRadius: 999,
    backgroundColor: MonikeColors.accentPulse,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: '100%',
  },
  iconUnit: {
    width: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(0,230,118,0.08)',
  },
  navLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  navLabelActive: {
    fontWeight: '600',
  },
  logLabel: {
    color: MonikeColors.accentPulse,
  },
});

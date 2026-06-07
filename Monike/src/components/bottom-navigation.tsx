import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet,
  Text, View, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, Telescope, House, PieChart, Plus, ShieldCheck } from 'lucide-react-native';
import { Fonts, MonikeColors } from '@/constants/theme';

type RouteName = 'home' | 'explore' | 'categories' | 'patterns' | 'forecast' | 'log';
type Route = '/' | '/explore' | '/categories' | '/patterns' | '/forecast' | '/log';
type NavigationTab = {
  key: RouteName;
  label: string;
  route: Route;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  special?: boolean;
};

const tabs: NavigationTab[] = [
  { key: 'home',       label: 'Home',       route: '/',           Icon: House },
  { key: 'explore',    label: 'Explore',    route: '/explore',    Icon: Telescope },

  { key: 'log',        label: 'Log',        route: '/log',        Icon: Plus, special: true },
  { key: 'categories', label: 'Categories', route: '/categories', Icon: PieChart },

  { key: 'forecast',   label: 'Risk',       route: '/forecast',   Icon: ShieldCheck },

];

// ─── PressScale ──────────────────────────────────────────────────
function PressScale({
  children, disabled, pressableStyle, innerStyle, onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  pressableStyle?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: 0.88, duration: 70,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={pressableStyle}          // ← flex: 1 lives HERE on the Pressable
    >
      <Animated.View style={[innerStyle, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── BottomNavigation ─────────────────────────────────────────────
export function BottomNavigation({ activeRoute }: { activeRoute: RouteName }) {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { width } = useWindowDimensions();

  const tabWidth    = width / tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeRoute));
  const PILL_W      = 24;

  const indicatorX  = useRef(
    new Animated.Value(activeIndex * tabWidth + (tabWidth - PILL_W) / 2)
  ).current;

  useEffect(() => {
    Animated.timing(indicatorX, {
      toValue: activeIndex * tabWidth + (tabWidth - PILL_W) / 2,
      duration: 320,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, tabWidth]);

  return (
    <View style={[styles.navbar, { height: 68 + insets.bottom, paddingBottom: insets.bottom }]}>

      {/* Sliding pill */}
      <Animated.View style={[styles.pill, { transform: [{ translateX: indicatorX }] }]} />

      {tabs.map(({ key, label, route, Icon, special }) => {
        const active = key === activeRoute;
        const iconColor = active || special ? MonikeColors.accentPulse : MonikeColors.inkMuted;

        return (
          <PressScale
            key={key}
            disabled={active}
            pressableStyle={styles.tabPressable}
            innerStyle={styles.tabInner}
            onPress={() => router.navigate(route)}
          >
            {/* Icon container */}
            <View style={[styles.iconWrap, active && styles.iconWrapActive, special && styles.iconWrapSpecial]}>
              {special && <View style={styles.logRing} />}
              <Icon
                size={special ? 18 : 17}
                color={iconColor}
                strokeWidth={active ? 2.3 : 1.7}
              />
            </View>

            {/* Label */}
            <Text
              style={[styles.label, { color: iconColor }, active && styles.labelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  navbar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,12,14,0.96)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  pill: {
    position: 'absolute',
    top: 0, left: 0,
    width: 24,
    height: 1.5,
    borderRadius: 999,
    backgroundColor: MonikeColors.accentPulse,
    // shadowColor: MonikeColors.accentPulse,
    // shadowOpacity: 0.5,
    // shadowRadius: 6,
    // elevation: 4,
  },

  // THE FIX: flex:1 on the Pressable wrapper
  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingTop: 6,
  },

  // Inner Animated.View — content layout only
  tabInner: {
    alignItems: 'center',
    gap: 3,
  },

  iconWrap: {
    width: 36,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(0,230,118,0.10)',
  },
  iconWrapSpecial: {
    backgroundColor: 'rgba(0,230,118,0.10)',
    borderRadius: 10,
  },

  logRing: {
    position: 'absolute',
    inset: -4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.18)',
  },

  label: {
    fontFamily: Fonts.sans,
    fontSize: 9.5,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  labelActive: {
    fontWeight: '600',
  },
});
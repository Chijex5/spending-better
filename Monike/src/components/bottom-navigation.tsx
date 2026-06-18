import { useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet,
  Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, BarChart2, House, Plus, User } from 'lucide-react-native';
import { Fonts, LightColors, MonikeColors } from '@/constants/theme';
import { useAccent } from '@/contexts/accent-context';

// Add is presented as a modal (see app/_layout.tsx) — it has no "active" tab
// state of its own, it's just the floating action button.
type RouteName = 'home' | 'insights' | 'patterns' | 'profile';
type TabRoute = '/' | '/insights' | '/patterns' | '/profile';

type NavigationTab = {
  key: RouteName;
  route: TabRoute;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
};

const tabs: NavigationTab[] = [
  { key: 'home',     route: '/',          Icon: House,     label: 'Home' },
  { key: 'insights', route: '/insights',  Icon: BarChart2, label: 'Insights' },
  { key: 'patterns', route: '/patterns',  Icon: Activity,  label: 'Patterns' },
  { key: 'profile',  route: '/profile',   Icon: User,      label: 'Profile' },
];

// ─── PressScale ───────────────────────────────────────────────────────────────
function PressScale({
  children,
  disabled,
  pressableStyle,
  innerStyle,
  onPress,
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
      toValue: 0.88,
      duration: 70,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      speed: 26,
      bounciness: 10,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={pressableStyle}
    >
      <Animated.View style={[innerStyle, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── BottomNavigation ─────────────────────────────────────────────────────────
// `variant` controls the bar's own palette — 'light' for the Home screen
// (which renders on a cream background), 'dark' everywhere else.
export function BottomNavigation({
  activeRoute,
  variant = 'dark',
}: {
  activeRoute: RouteName;
  variant?: 'light' | 'dark';
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent } = useAccent();
  const isLight = variant === 'light';
  const inactiveColor = isLight ? LightColors.textMuted : MonikeColors.inkMuted;

  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);

  function renderTab({ key, route, Icon, label }: NavigationTab) {
    const active = key === activeRoute;
    return (
      <PressScale
        key={key}
        disabled={active}
        pressableStyle={styles.tabPressable}
        innerStyle={styles.tabInner}
        onPress={() => router.navigate(route as any)}
      >
        <Icon
          size={21}
          color={active ? accent : inactiveColor}
          strokeWidth={active ? 2.2 : 1.7}
        />
        <Text style={[styles.tabLabel, { color: inactiveColor }, active && { color: accent, fontWeight: '700' }]}>
          {label}
        </Text>
      </PressScale>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isLight ? LightColors.card : '#0A0C12', borderTopColor: isLight ? LightColors.divider : 'rgba(255,255,255,0.07)' },
        { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 },
      ]}
    >
      <View style={styles.bar}>
        {leftTabs.map(renderTab)}
        <PressScale
          pressableStyle={styles.fabPressable}
          innerStyle={styles.fabInner}
          onPress={() => router.navigate('/log' as any)}
        >
          <View style={[styles.fab, { backgroundColor: accent, shadowColor: accent }]}>
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </View>
        </PressScale>
        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0C12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    pointerEvents: 'box-none',
  },

  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 8,
  },

  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },

  fabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 4,
  },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
});

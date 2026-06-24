import { useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet,
  Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, BarChart2, House, Plus, User } from 'lucide-react-native';
import { Fonts } from '@/constants/theme';
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
  { key: 'patterns', route: '/patterns',  Icon: Activity,  label: 'Habits' },
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
export function BottomNavigation({ activeRoute }: { activeRoute: RouteName }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent, colors } = useAccent();

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
          size={23}
          color={active ? accent : colors.ink3}
          strokeWidth={active ? 2.2 : 1.7}
        />
        <Text style={[styles.tabLabel, { color: colors.ink3 }, active && { color: accent, fontWeight: '700' }]}>
          {label}
        </Text>
      </PressScale>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderTopColor: colors.line },
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
    borderTopWidth: 1,
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
    marginTop: -4,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
});

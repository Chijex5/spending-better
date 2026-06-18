import { useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet,
  Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, BarChart2, House, Plus, User } from 'lucide-react-native';
import { Fonts, MonikeColors } from '@/constants/theme';
import { useAccent } from '@/contexts/accent-context';

type RouteName = 'home' | 'insights' | 'log' | 'patterns' | 'profile';
type Route = '/' | '/insights' | '/log' | '/patterns' | '/profile';

type NavigationTab = {
  key: RouteName;
  route: Route;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  fab?: boolean;
};

const tabs: NavigationTab[] = [
  { key: 'home',     route: '/',          Icon: House,     label: 'Home' },
  { key: 'insights', route: '/insights',  Icon: BarChart2, label: 'Insights' },
  { key: 'log',      route: '/log',       Icon: Plus,      label: 'Add', fab: true },
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
export function BottomNavigation({ activeRoute }: { activeRoute: RouteName }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accent } = useAccent();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
      <View style={styles.bar}>
        {tabs.map(({ key, route, Icon, label, fab }) => {
          const active = key === activeRoute;

          if (fab) {
            return (
              <PressScale
                key={key}
                pressableStyle={styles.fabPressable}
                innerStyle={styles.fabInner}
                onPress={() => router.navigate(route as any)}
              >
                <View style={[styles.fab, { backgroundColor: accent, shadowColor: accent }]}>
                  <Icon size={20} color="#fff" strokeWidth={2.5} />
                </View>
                <Text style={[styles.tabLabel, active && { color: accent, fontWeight: '700' }]}>
                  {label}
                </Text>
              </PressScale>
            );
          }

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
                color={active ? accent : MonikeColors.inkMuted}
                strokeWidth={active ? 2.2 : 1.7}
              />
              <Text style={[styles.tabLabel, active && { color: accent, fontWeight: '700' }]}>
                {label}
              </Text>
            </PressScale>
          );
        })}
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

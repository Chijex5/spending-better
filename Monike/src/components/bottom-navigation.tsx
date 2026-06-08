import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet,
  View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, ArrowLeftRight, TelescopeIcon } from 'lucide-react-native';
import { MonikeColors } from '@/constants/theme';

type RouteName = 'home' | 'explore' | 'categories' | 'patterns' | 'forecast' | 'log';
type Route = '/' | '/explore' | '/categories' | '/patterns' | '/forecast' | '/log';

type NavigationTab = {
  key: RouteName;
  route: Route;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  special?: boolean;
};

// 3 tabs matching the reference image
const tabs: NavigationTab[] = [
  { key: 'home',    route: '/',        Icon: House },
  { key: 'log',     route: '/log',     Icon: ArrowLeftRight, special: true },
  { key: 'explore', route: '/explore', Icon: TelescopeIcon },
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
      toValue: 0.84,
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

  // Animated opacity for active indicator glow
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.pill}>
        {tabs.map(({ key, route, Icon, special }) => {
          const active = key === activeRoute;
          const isSpecialActive = special && active;

          // Icon color
          const iconColor = active
            ? special
              ? '#FFFFFF'
              : MonikeColors.inkPrimary
            : MonikeColors.inkMuted;

          return (
            <PressScale
              key={key}
              disabled={active}
              pressableStyle={styles.tabPressable}
              innerStyle={styles.tabInner}
              onPress={() => router.navigate(route)}
            >
              {/* Special tab: filled purple circle */}
              {special ? (
                <View style={[styles.specialCircle, active && styles.specialCircleActive]}>
                  <Icon size={17} color={iconColor} strokeWidth={2} />
                </View>
              ) : (
                /* Regular tab: plain icon, subtle bg when active */
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Icon
                    size={17}
                    color={iconColor}
                    strokeWidth={active ? 2.2 : 1.7}
                  />
                </View>
              )}
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    // No background — floating
    pointerEvents: 'box-none',
  },

  // The floating dark rounded pill
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22,24,28,0.96)',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    // Shadow for float effect
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },

  tabPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Regular tab icon container
  iconWrap: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  iconWrapActive: {
    // Subtle tint when active (non-special)
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // Middle special tab — the purple filled circle from the reference
  specialCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(123,97,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.25)',
  },
  specialCircleActive: {
    backgroundColor: '#7B61FF',
    borderColor: '#7B61FF',
    // Subtle glow
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
});
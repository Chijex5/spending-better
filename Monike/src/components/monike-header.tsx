import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Bell, Menu } from 'lucide-react-native';

import { useMonikeShell } from '@/components/shell-context';
import { Fonts, MonikeColors } from '@/constants/theme';

export function MonikeHeader({
  hasAlerts = false,
  home = false,
  title,
  back = false,
}: {
  hasAlerts?: boolean;
  home?: boolean;
  title: string;
  back?: boolean;
}) {
  const { openDrawer, showAlerts } = useMonikeShell();
  const router = useRouter();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.header,
        home ? styles.headerHome : styles.headerInner,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {home ? (
        // ── Home variant: avatar + greeting left, bell right ──────────────
        <>
          <View style={styles.homeLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>CU</Text>
            </View>
            <View style={styles.greetingBlock}>
              <Text style={styles.greetingLine}>Hi, Chijioke</Text>
              <Text style={styles.greetingBold}>Your Budget</Text>
            </View>
          </View>

          <HapticButton onPress={() => showAlerts(hasAlerts)} accessibilityLabel="Notifications">
            <Bell size={16} color={MonikeColors.inkSecondary} strokeWidth={1.6} />
            {hasAlerts ? <Pip /> : null}
          </HapticButton>
        </>
      ) : (
        // ── Inner screen variant: back/menu left, title center, bell/space right ──
        <>
          <HapticButton
            onPress={back ? () => (router.canGoBack() ? router.back() : router.replace('/')) : openDrawer}
            accessibilityLabel={back ? 'Go back' : 'Open menu'}
          >
            {back ? (
              <ArrowLeft size={17} color={MonikeColors.inkPrimary} strokeWidth={1.8} />
            ) : (
              <Menu size={17} color={MonikeColors.inkPrimary} strokeWidth={1.7} />
            )}
          </HapticButton>

          <View style={styles.titleBlock}>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
          </View>

          {back ? (
            <View style={styles.spacer} />
          ) : (
            <HapticButton onPress={() => showAlerts(hasAlerts)} accessibilityLabel="Notifications">
              <Bell size={16} color={MonikeColors.inkSecondary} strokeWidth={1.6} />
              {hasAlerts ? <Pip /> : null}
            </HapticButton>
          )}
        </>
      )}
    </Animated.View>
  );
}

// ─── HapticButton ─────────────────────────────────────────────────────────────

function HapticButton({
  accessibilityLabel,
  children,
  onPress,
}: {
  accessibilityLabel?: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.timing(scale, { toValue: 0.86, duration: 55, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 10, useNativeDriver: true }).start()
      }
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.iconButton, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Pip ──────────────────────────────────────────────────────────────────────

function Pip() {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  const ringScale   = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 0.2, 0] });
  return (
    <View style={styles.pipAnchor} pointerEvents="none">
      <Animated.View style={[styles.pipRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <View style={styles.pipCore} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },

  // Home: slightly taller to accommodate avatar
  headerHome: {
    height: 58,
  },

  // Inner screens: standard compact height
  headerInner: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: `${MonikeColors.inkGhost}60`,
  },

  // ── Home left block ────────────────────────────────────────────────────────
  homeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7B61FF1A',
    borderWidth: 1.5,
    borderColor: '#7B61FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#7B61FF',
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  greetingBlock: {
    gap: 1,
  },
  greetingLine: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  greetingBold: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Inner screen title block ───────────────────────────────────────────────
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  titleText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Icon button (shared) ───────────────────────────────────────────────────
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },

  spacer: { width: 36, height: 36 },

  // ── Pip ───────────────────────────────────────────────────────────────────
  pipAnchor: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MonikeColors.accentPulse,
  },
  pipCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MonikeColors.accentPulse,
  },
});
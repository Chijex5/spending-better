import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Bell } from 'lucide-react-native';

import { useMonikeShell } from '@/components/shell-context';
import { Fonts, MonikeColors } from '@/constants/theme';

const ORANGE = MonikeColors.accentOrange;

export function MonikeHeader({
  hasAlerts = false,
  home = false,
  title,
  subtitle,
  back = false,
}: {
  hasAlerts?: boolean;
  home?: boolean;
  title: string;
  subtitle?: string;
  back?: boolean;
}) {
  const { showAlerts } = useMonikeShell();
  const router = useRouter();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const displayTitle    = home ? 'Hi, Chijioke' : title;
  const displaySubtitle = subtitle ?? (home
    ? new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
    : undefined);

  return (
    <Animated.View
      style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      {/* Left — avatar circle (non-back) or back-arrow circle (back) */}
      {back ? (
        <Pressable
          style={({ pressed }) => [styles.leftCircle, pressed && styles.leftCirclePressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={17} color={MonikeColors.inkPrimary} strokeWidth={1.8} />
        </Pressable>
      ) : (
        <View style={styles.leftCircle}>
          <Text style={styles.avatarInitials}>CU</Text>
        </View>
      )}

      {/* Centre-left — title + subtitle */}
      <View style={styles.titleBlock}>
        <Text style={styles.titleText} numberOfLines={1}>{displayTitle}</Text>
        {displaySubtitle ? (
          <Text style={styles.subtitleText} numberOfLines={1}>{displaySubtitle}</Text>
        ) : null}
      </View>

      {/* Right — bell (main pages) or spacer (back pages) */}
      {back ? (
        <View style={styles.spacer} />
      ) : (
        <HapticButton onPress={() => showAlerts(hasAlerts)} accessibilityLabel="Notifications">
          <Bell size={16} color={MonikeColors.inkSecondary} strokeWidth={1.6} />
          {hasAlerts ? <Pip /> : null}
        </HapticButton>
      )}
    </Animated.View>
  );
}

// ─── HapticButton (bell) ──────────────────────────────────────────────────────

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
      <Animated.View style={[styles.bellButton, { transform: [{ scale }] }]}>
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
    paddingHorizontal: 16,
    gap: 12,
    height: 64,
    backgroundColor: MonikeColors.bgElevated,
    borderBottomWidth: 2,
    borderBottomColor: ORANGE,
  },

  // ── Left circle — avatar or back ───────────────────────────────────────────
  leftCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: `${ORANGE}1A`,
    borderWidth: 1.5,
    borderColor: `${ORANGE}45`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftCirclePressed: {
    backgroundColor: `${ORANGE}30`,
  },
  avatarInitials: {
    color: ORANGE,
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Title block ────────────────────────────────────────────────────────────
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitleText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 1,
  },

  // ── Bell button ────────────────────────────────────────────────────────────
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  spacer: { width: 38, height: 38 },

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

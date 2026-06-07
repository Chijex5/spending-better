import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Menu } from 'lucide-react-native';

import { useMonikeShell } from '@/components/shell-context';
import { Fonts, MonikeColors } from '@/constants/theme';

export function MonikeHeader({
  hasAlerts = false,
  home = false,
  title,
}: {
  hasAlerts?: boolean;
  home?: boolean;
  title: string;
}) {
  const { openDrawer, showAlerts } = useMonikeShell();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

      <HapticButton onPress={openDrawer} accessibilityLabel="Open menu">
        <Menu size={18} color={MonikeColors.inkPrimary} strokeWidth={1.7} />
      </HapticButton>

      <View style={styles.centre}>
        {home ? (
          <View style={styles.wordmarkRow}>
            <View style={styles.wordmarkPip} />
            <Text style={styles.wordmark} numberOfLines={1}>MONIKE</Text>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={styles.titleText} numberOfLines={1}>{title.toUpperCase()}</Text>
            <View style={styles.titleRule} />
          </View>
        )}
      </View>

      <HapticButton onPress={() => showAlerts(hasAlerts)} accessibilityLabel="Notifications">
        <Bell size={18} color={MonikeColors.inkPrimary} strokeWidth={1.7} />
        {hasAlerts ? <Pip /> : null}
      </HapticButton>

    </Animated.View>
  );
}

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
      onPressIn={() => Animated.timing(scale, { toValue: 0.86, duration: 55, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 10, useNativeDriver: true }).start()}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.iconButton, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

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
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 0.2, 0] });
  return (
    <View style={styles.pipAnchor} pointerEvents="none">
      <Animated.View style={[styles.pipRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <View style={styles.pipCore} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  wordmarkPip: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: MonikeColors.accentPulse,
  },
  wordmark: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4.5,
  },
  titleRow: {
    alignItems: 'center',
    gap: 5,
  },
  titleText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.8,
  },
  titleRule: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: MonikeColors.accentPulse,
    opacity: 0.75,
  },
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
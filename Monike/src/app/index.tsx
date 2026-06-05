import { LinearGradient } from 'expo-linear-gradient';
import { TriangleAlert, WalletCards } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { layout, monikeColors, monikeFonts, spacing } from '@/constants/theme';

type RiskLevel = 'high' | 'medium' | 'low';

const cards = [0, 1, 2];

function AmountText({ value, color }: { value: string; color: string }) {
  return (
    <Text style={[styles.amountText, { color }]}>
      <Text style={styles.nairaChip}>₦</Text>
      {value}
    </Text>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const map = {
    high: { text: monikeColors.signalRed, bg: '#FF3D3D22', border: '#FF3D3D44' },
    medium: { text: monikeColors.signalAmber, bg: '#FFB30022', border: '#FFB30044' },
    low: { text: monikeColors.accentPulse, bg: '#00E67622', border: '#00E67644' },
  } as const;

  return (
    <View style={[styles.riskBadge, { backgroundColor: map[level].bg, borderColor: map[level].border }]}>
      <Text style={[styles.riskBadgeText, { color: map[level].text }]}>{level}</Text>
    </View>
  );
}

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const sub = value.addListener(({ value: next }) => {
      setDisplayValue(Math.round(next));
    });
    Animated.timing(value, {
      toValue: target,
      duration: 600,
      useNativeDriver: false,
    }).start();

    return () => {
      value.removeListener(sub);
    };
  }, [target]);

  return (
    <Text style={styles.heroAmount}>
      <Text style={styles.nairaHero}>₦</Text>
      {displayValue.toLocaleString()}
      {suffix}
    </Text>
  );
}

function ProgressBar({ ratio, overspend = false }: { ratio: number; overspend?: boolean }) {
  const width = Math.min(100, Math.max(0, ratio * 100));

  return (
    <View style={styles.progressTrack}>
      {overspend ? (
        <View style={[styles.progressFill, { width: `${width}%`, backgroundColor: monikeColors.signalRed }]} />
      ) : (
        <LinearGradient
          colors={[monikeColors.accentPulse, monikeColors.accentNeon]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${width}%` }]}
        />
      )}
    </View>
  );
}

function SkeletonPulse() {
  const [shimmer] = useState(() => new Animated.Value(-160));

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 280,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View style={styles.skeleton}>
      <Animated.View style={[styles.skeletonGlow, { transform: [{ translateX: shimmer }] }]}>
        <LinearGradient
          colors={[monikeColors.bgElevated, monikeColors.bgOverlay, monikeColors.bgElevated]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.skeletonGradient}
        />
      </Animated.View>
    </View>
  );
}

export default function DashboardScreen() {
  const cardAnimations = useMemo(() => cards.map(() => new Animated.Value(0)), []);

  useEffect(() => {
    Animated.stagger(
      60,
      cardAnimations.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [cardAnimations]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.caption}>MONTHLY MIRROR</Text>
          <AnimatedCounter target={418240} />
          <Text style={styles.secondaryText}>Spent in June • 13.4% above your baseline</Text>
        </View>

        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: cardAnimations[0],
              transform: [{ translateY: cardAnimations[0].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}>
          <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.rowBetween}>
              <View style={styles.rowInline}>
                <WalletCards color={monikeColors.accentPulse} size={20} />
                <Text style={styles.cardTitle}>Flow</Text>
              </View>
              <RiskBadge level="medium" />
            </View>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.labelText}>DEBITS</Text>
                <AmountText value="418,240" color={monikeColors.signalRed} />
              </View>
              <View>
                <Text style={[styles.labelText, styles.valueRight]}>CREDITS</Text>
                <AmountText value="465,100" color={monikeColors.signalBlue} />
              </View>
            </View>
            <View style={styles.divider} />
            <Text style={styles.secondaryText}>Savings delta: ₦46,860</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: cardAnimations[1],
              transform: [{ translateY: cardAnimations[1].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}>
          <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Heatmap</Text>
              <Text style={styles.caption}>DM MONO GRID</Text>
            </View>
            <Svg height="130" width="100%" viewBox="0 0 320 130">
              <Line x1="8" y1="30" x2="312" y2="30" stroke={monikeColors.inkGhost} strokeDasharray="4 4" strokeOpacity={0.4} />
              <Line x1="8" y1="65" x2="312" y2="65" stroke={monikeColors.inkGhost} strokeDasharray="4 4" strokeOpacity={0.4} />
              <Line x1="8" y1="100" x2="312" y2="100" stroke={monikeColors.inkGhost} strokeDasharray="4 4" strokeOpacity={0.4} />
              <Polyline
                points="10,96 64,88 118,74 172,80 226,42 280,54 310,32"
                fill="none"
                stroke={monikeColors.accentPulse}
                strokeWidth="2"
              />
              <Circle cx="310" cy="32" r="5" fill={monikeColors.accentPulse} stroke={monikeColors.bgVoid} strokeWidth="2" />
            </Svg>
            <Text style={styles.secondaryText}>Highest pulse: Saturday evening food clusters.</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: cardAnimations[2],
              transform: [{ translateY: cardAnimations[2].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}>
          <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.rowBetween}>
              <View style={styles.rowInline}>
                <TriangleAlert color={monikeColors.signalAmber} size={20} />
                <Text style={styles.cardTitle}>Risk radar</Text>
              </View>
              <RiskBadge level="high" />
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.secondaryText}>Dining overshoot</Text>
              <Text style={styles.metricValue}>112%</Text>
            </View>
            <ProgressBar ratio={1} overspend />
            <View style={styles.metricRow}>
              <Text style={styles.secondaryText}>Transport drift</Text>
              <Text style={styles.metricValue}>63%</Text>
            </View>
            <ProgressBar ratio={0.63} />
            <View style={styles.metricRow}>
              <Text style={styles.secondaryText}>Utilities stability</Text>
              <Text style={styles.metricValue}>29%</Text>
            </View>
            <ProgressBar ratio={0.29} />
            <SkeletonPulse />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: monikeColors.bgVoid,
  },
  content: {
    paddingTop: layout.statusBarClearance,
    paddingHorizontal: layout.horizontalPadding,
    paddingBottom: layout.bottomNavHeight + spacing.xl,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  caption: {
    color: monikeColors.inkSecondary,
    fontFamily: monikeFonts.body,
    fontSize: 11,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
  },
  heroAmount: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.monoBold,
    fontSize: 42,
    letterSpacing: -0.84,
    lineHeight: 48,
  },
  nairaHero: {
    fontSize: 34,
  },
  secondaryText: {
    color: monikeColors.inkSecondary,
    fontFamily: monikeFonts.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  cardWrap: {
    width: '100%',
  },
  card: {
    backgroundColor: monikeColors.bgSurface,
    borderColor: monikeColors.inkGhost,
    borderWidth: 1,
    borderRadius: layout.cardRadius,
    padding: layout.cardPadding,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardTitle: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.heading,
    fontSize: 18,
  },
  labelText: {
    color: monikeColors.inkSecondary,
    fontFamily: monikeFonts.body,
    fontSize: 11,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
  },
  valueRight: {
    textAlign: 'right',
  },
  nairaChip: {
    fontSize: 11,
  },
  amountText: {
    fontFamily: monikeFonts.monoBold,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  divider: {
    borderTopColor: monikeColors.inkGhost,
    borderTopWidth: 1,
    opacity: 0.6,
  },
  riskBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  riskBadgeText: {
    fontFamily: monikeFonts.monoBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  metricValue: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.mono,
    fontSize: 13,
  },
  progressTrack: {
    backgroundColor: monikeColors.bgElevated,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  skeleton: {
    marginTop: spacing.md,
    backgroundColor: monikeColors.bgElevated,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
  },
  skeletonGlow: {
    width: 160,
    height: '100%',
  },
  skeletonGradient: {
    width: '100%',
    height: '100%',
  },
});

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { AlertTriangle, CheckCircle2, MessageSquare, PiggyBank, Zap } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type FeatureKey =
  | 'rolling_7d_avg'
  | 'prev_day_spend'
  | 'rolling_14d_avg'
  | 'max_single'
  | 'discretionary'
  | 'num_transactions'
  | 'total_credit'
  | 'savings_out'
  | 'is_weekend'
  | 'dow';

type Feature = {
  key: FeatureKey;
  value: string;
  importance: number;
};

type OutlookDay = {
  day: string;
  risk: RiskLevel;
  probability: number;
};

const prediction = {
  probability: 73,
  risk: 'HIGH' as RiskLevel,
  tomorrow: 'Tomorrow · Sunday, 07 Jun 2026',
};

const featureLabels: Record<FeatureKey, string> = {
  rolling_7d_avg: 'Your 7-day trend',
  prev_day_spend: "Yesterday's spending",
  rolling_14d_avg: '2-week average',
  max_single: 'Largest recent transaction',
  discretionary: 'Discretionary transfers (P2P, POS)',
  num_transactions: 'Transaction frequency',
  total_credit: 'Money received recently',
  savings_out: 'Amount moved to savings',
  is_weekend: 'Weekend effect',
  dow: 'Day of week pattern',
};

const features: Feature[] = [
  { key: 'rolling_7d_avg', value: '₦38,422 avg', importance: 86 },
  { key: 'discretionary', value: '₦71,844 P2P/POS', importance: 74 },
  { key: 'prev_day_spend', value: '₦27,900 yesterday', importance: 62 },
  { key: 'max_single', value: '₦48,115 largest send', importance: 48 },
  { key: 'dow', value: 'Sunday pattern rising', importance: 31 },
];

const advisorTips: Record<RiskLevel, { icon: ReactNode; text: string }[]> = {
  LOW: [
    { icon: <CheckCircle2 size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: "Low risk days are perfect for moving money to savings." },
    { icon: <PiggyBank size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: "Consider prepaying recurring bills while you're ahead." },
  ],
  MEDIUM: [
    { icon: <Zap size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: 'Your 7-day average is running elevated — stay mindful.' },
    { icon: <Zap size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: 'Data and airtime tend to cluster. Buy in bulk today.' },
  ],
  HIGH: [
    { icon: <AlertTriangle size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: 'Set a ₦15,000 mental cap on discretionary sends.' },
    { icon: <AlertTriangle size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: 'Delay any non-urgent transfers by 24 hours.' },
    { icon: <AlertTriangle size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />, text: 'Ask yourself: is this spend necessary or reactive?' },
  ],
};

const outlook: OutlookDay[] = [
  { day: 'Sun', risk: 'HIGH', probability: 73 },
  { day: 'Mon', risk: 'MEDIUM', probability: 54 },
  { day: 'Tue', risk: 'MEDIUM', probability: 58 },
  { day: 'Wed', risk: 'HIGH', probability: 69 },
  { day: 'Thu', risk: 'LOW', probability: 32 },
  { day: 'Fri', risk: 'HIGH', probability: 77 },
  { day: 'Sat', risk: 'LOW', probability: 28 },
];

function riskColor(risk: RiskLevel) {
  if (risk === 'LOW') return MonikeColors.accentPulse;
  if (risk === 'MEDIUM') return MonikeColors.signalAmber;
  return MonikeColors.signalRed;
}

function riskGlow(risk: RiskLevel) {
  if (risk === 'LOW') return 'rgb(0,230,118)';
  if (risk === 'MEDIUM') return 'rgb(255,179,0)';
  return 'rgb(255,61,61)';
}

function riskSentence(risk: RiskLevel) {
  if (risk === 'LOW') return 'Smooth sailing tomorrow. Spend wisely.';
  if (risk === 'MEDIUM') return 'Moderate risk detected. Stay aware.';
  return 'High probability of overspending tomorrow.';
}

function riskEmoji(risk: RiskLevel) {
  if (risk === 'LOW') return '🟢';
  if (risk === 'MEDIUM') return '🟡';
  return '🔴';
}

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) };
}

function arcSegment(cx: number, cy: number, outerRadius: number, innerRadius: number, startDegrees: number, endDegrees: number) {
  const outerStart = polar(cx, cy, outerRadius, startDegrees);
  const outerEnd = polar(cx, cy, outerRadius, endDegrees);
  const innerStart = polar(cx, cy, innerRadius, endDegrees);
  const innerEnd = polar(cx, cy, innerRadius, startDegrees);
  const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function Gauge({ probability, risk }: { probability: number; risk: RiskLevel }) {
  const needle = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(0)).current;
  const [displayProbability, setDisplayProbability] = useState(0);
  const color = riskColor(risk);
  const finalRotation = -90 + probability * 1.8;

  useEffect(() => {
    const countListener = count.addListener(({ value }) => setDisplayProbability(Math.round(value * probability)));

    Animated.spring(needle, {
      toValue: 1,
      stiffness: 80,
      damping: 12,
      mass: 1,
      useNativeDriver: true,
    }).start();

    Animated.timing(count, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const badgeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );

    glowLoop.start();
    badgeLoop.start();

    return () => {
      count.removeListener(countListener);
      glowLoop.stop();
      badgeLoop.stop();
    };
  }, [badgePulse, count, needle, probability, pulse]);

  const needleRotation = needle.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', `${finalRotation}deg`] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.1] });
  const badgeScale = badgePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });

  return (
    <View style={styles.gaugeStage}>
      <Animated.View style={[styles.radialGlow, { opacity: glowOpacity }]}>
        <Svg width="100%" height="100%" viewBox="0 0 340 260">
          <Defs>
            <RadialGradient id="riskGlow" cx="50%" cy="56%" r="50%">
              <Stop offset="0%" stopColor={riskGlow(risk)} stopOpacity="1" />
              <Stop offset="62%" stopColor={riskGlow(risk)} stopOpacity="0.52" />
              <Stop offset="100%" stopColor={riskGlow(risk)} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="170" cy="156" r="154" fill="url(#riskGlow)" />
        </Svg>
      </Animated.View>

      <View style={styles.gaugeWrap}>
        <Svg width={340} height={210} viewBox="0 0 340 210">
          <Path d={arcSegment(170, 170, 150, 100, 180, 120)} fill={MonikeColors.accentPulse} opacity={0.3} />
          <Path d={arcSegment(170, 170, 150, 100, 120, 60)} fill={MonikeColors.signalAmber} opacity={0.3} />
          <Path d={arcSegment(170, 170, 150, 100, 60, 0)} fill={MonikeColors.signalRed} opacity={0.3} />
          {[120, 60].map((angle) => {
            const start = polar(170, 170, 98, angle);
            const end = polar(170, 170, 152, angle);
            return <Path key={angle} d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} stroke={MonikeColors.inkGhost} strokeWidth={1} />;
          })}
          <SvgText x="54" y="72" fill={MonikeColors.accentPulse} fontFamily={Fonts.mono} fontSize={10} fontWeight="700">LOW</SvgText>
          <SvgText x="158" y="23" fill={MonikeColors.signalAmber} fontFamily={Fonts.mono} fontSize={10} fontWeight="700">MED</SvgText>
          <SvgText x="275" y="72" fill={MonikeColors.signalRed} fontFamily={Fonts.mono} fontSize={10} fontWeight="700">HIGH</SvgText>
        </Svg>

        <View style={styles.probabilityBlock}>
          <Text style={[styles.probabilityValue, { color }]}>{displayProbability}%</Text>
          <Text style={styles.probabilityLabel}>PROBABILITY</Text>
        </View>

        <Animated.View style={[styles.needle, { transform: [{ rotate: needleRotation }] }]}>
          <View style={styles.needleTriangle} />
        </Animated.View>
        <View style={styles.needlePivot} />
      </View>

      <Animated.View style={[styles.riskBadge, { backgroundColor: `${color}26`, transform: [{ scale: badgeScale }] }]}>
        <Text style={[styles.riskBadgeText, { color }]}>● {risk} RISK</Text>
      </Animated.View>
      <Text style={styles.riskSentence}>{riskSentence(risk)}</Text>
    </View>
  );
}

function SectionHeader({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <View style={styles.sectionHeaderRow}>
      {icon}
      <Text style={styles.sectionHeader}>{children}</Text>
    </View>
  );
}

function FeatureRow({ feature }: { feature: Feature }) {
  const color = feature.importance >= 70 ? MonikeColors.accentPulse : feature.importance >= 45 ? MonikeColors.signalAmber : MonikeColors.inkSecondary;
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureCopy}>
        <Text numberOfLines={1} style={styles.featureLabel}>{featureLabels[feature.key]}</Text>
        <Text style={styles.featureValue}>{feature.value}</Text>
      </View>
      <View style={styles.importanceWrap}>
        <Text style={[styles.importanceText, { color }]}>{feature.importance}%</Text>
        <View style={styles.importanceTrack}>
          <View style={[styles.importanceFill, { width: `${feature.importance}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function TipCard({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  return (
    <View style={[styles.tipCard, { borderLeftColor: color }]}>
      {icon}
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function OutlookCell({ day }: { day: OutlookDay }) {
  const color = riskColor(day.risk);
  const opacity = 0.18 + (day.probability / 100) * 0.22;
  return (
    <View style={styles.outlookCell}>
      <Text style={styles.outlookDay}>{day.day}</Text>
      <Svg width={28} height={18} viewBox="0 0 28 18">
        <Path d="M 3 15 A 11 11 0 0 1 25 15" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" opacity={opacity} />
      </Svg>
      <Text style={styles.outlookEmoji}>{riskEmoji(day.risk)}</Text>
    </View>
  );
}

export default function ForecastScreen() {
  const insets = useSafeAreaInsets();
  const risk = prediction.risk;
  const color = riskColor(risk);
  const sortedFeatures = useMemo(() => [...features].sort((a, b) => b.importance - a.importance), []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 22 }]}
        >
          <MonikeHeader title="Risk" />

          <Gauge probability={prediction.probability} risk={risk} />

          <SectionHeader>WHAT&apos;S DRIVING THIS</SectionHeader>
          <View style={styles.sectionCard}>{sortedFeatures.map((feature) => <FeatureRow key={feature.key} feature={feature} />)}</View>

          <SectionHeader icon={<MessageSquare size={15} color={MonikeColors.accentPulse} strokeWidth={1.9} />}>ADVISOR SAYS</SectionHeader>
          <View style={styles.tipsStack}>
            {advisorTips[risk].map((tip) => <TipCard key={tip.text} icon={tip.icon} text={tip.text} color={color} />)}
          </View>

          <SectionHeader>WEEK AHEAD OUTLOOK</SectionHeader>
          <View style={styles.outlookRow}>{outlook.map((day) => <OutlookCell key={day.day} day={day} />)}</View>
          <Text style={styles.outlookCaption}>Based on historical same-day patterns</Text>
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="forecast" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MonikeColors.bgVoid,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 18,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tomorrow: {
    marginTop: 8,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  gaugeStage: {
    alignItems: 'center',
    marginBottom: 26,
    minHeight: 330,
  },
  radialGlow: {
    position: 'absolute',
    top: -28,
    width: 390,
    height: 300,
  },
  gaugeWrap: {
    width: 340,
    height: 228,
    alignItems: 'center',
    marginTop: 6,
  },
  lowLabel: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  medLabel: {
    color: MonikeColors.signalAmber,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  highLabel: {
    color: MonikeColors.signalRed,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  probabilityBlock: {
    position: 'absolute',
    top: 82,
    alignItems: 'center',
  },
  probabilityValue: {
    fontFamily: Fonts.mono,
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -2,
  },
  probabilityLabel: {
    marginTop: -2,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  needle: {
    position: 'absolute',
    left: 166,
    top: 50,
    width: 8,
    height: 120,
    alignItems: 'center',
    justifyContent: 'flex-start',
    transformOrigin: '50% 100%',
  },
  needleTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 120,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: MonikeColors.inkPrimary,
  },
  needlePivot: {
    position: 'absolute',
    left: 165,
    top: 165,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MonikeColors.inkPrimary,
    shadowColor: MonikeColors.inkPrimary,
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },
  riskBadge: {
    width: 180,
    minHeight: 42,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF14',
    marginTop: -16,
  },
  riskBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  riskSentence: {
    marginTop: 12,
    maxWidth: 270,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeader: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionCard: {
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
    overflow: 'hidden',
    marginBottom: 18,
  },
  featureRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#20262C',
  },
  featureCopy: {
    flex: 1,
    paddingRight: 12,
  },
  featureLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  featureValue: {
    marginTop: 4,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  importanceWrap: {
    width: 74,
    alignItems: 'flex-end',
    gap: 6,
  },
  importanceText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '600',
  },
  importanceTrack: {
    width: 60,
    height: 5,
    borderRadius: 3,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  importanceFill: {
    height: 5,
    borderRadius: 3,
  },
  tipsStack: {
    gap: 8,
    marginBottom: 18,
  },
  tipCard: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgElevated,
    borderLeftWidth: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  tipText: {
    flex: 1,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 21,
  },
  outlookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  outlookCell: {
    width: 44,
    height: 60,
    borderRadius: 8,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: '#222A31',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  outlookDay: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  outlookEmoji: {
    fontSize: 13,
    lineHeight: 15,
  },
  outlookCaption: {
    marginTop: 10,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});

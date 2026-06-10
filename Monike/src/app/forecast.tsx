import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Info,
  MessageSquare,
  RefreshCw,
  TrendingDown,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { usePrediction } from '@/hooks/use-prediction';
import type { FeatureImportance, PredictionResponse, WeekOutlookDay } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseRisk(raw: string): RiskLevel {
  const u = raw.toUpperCase();
  if (u === 'LOW' || u === 'MEDIUM' || u === 'HIGH') return u;
  return 'LOW';
}

function riskColor(risk: RiskLevel) {
  if (risk === 'HIGH')   return MonikeColors.signalRed;
  if (risk === 'MEDIUM') return MonikeColors.signalAmber;
  return MonikeColors.signalBlue;
}

function riskGlow(risk: RiskLevel) {
  if (risk === 'HIGH')   return 'rgb(255,61,61)';
  if (risk === 'MEDIUM') return 'rgb(255,179,0)';
  return 'rgb(79,195,247)';
}

function riskSentence(risk: RiskLevel) {
  if (risk === 'HIGH')   return 'High probability of overspending tomorrow.';
  if (risk === 'MEDIUM') return 'Moderate risk detected. Stay aware.';
  return 'Smooth sailing tomorrow. Spend wisely.';
}

function riskEmoji(risk: RiskLevel) {
  if (risk === 'HIGH')   return '🔴';
  if (risk === 'MEDIUM') return '🟡';
  return '🔵';
}

function formatNaira(value: number): string {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcSegment(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startDeg: number, endDeg: number,
) {
  const os = polar(cx, cy, outerR, startDeg);
  const oe = polar(cx, cy, outerR, endDeg);
  const is = polar(cx, cy, innerR, endDeg);
  const ie = polar(cx, cy, innerR, startDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${os.x} ${os.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${is.x} ${is.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${ie.x} ${ie.y}`,
    'Z',
  ].join(' ');
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function Shimmer({ style }: { style?: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] });
  return <Animated.View style={[{ backgroundColor: MonikeColors.inkPrimary, borderRadius: 6, opacity }, style]} />;
}

function ForecastSkeleton() {
  return (
    <View style={{ paddingTop: 18, gap: 18 }}>
      <View style={sk.gaugeStage}>
        <Shimmer style={sk.gaugeDisk} />
        <Shimmer style={sk.badgePill} />
        <Shimmer style={sk.line} />
      </View>
      <Shimmer style={{ height: 88, borderRadius: CardRadius }} />
      <Shimmer style={sk.sectionLabel} />
      <View style={sk.card}>
        {[0,1,2,3,4].map((i) => (
          <View key={i} style={sk.featureRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Shimmer style={{ height: 11, width: '55%' }} />
              <Shimmer style={{ height: 10, width: '38%' }} />
            </View>
            <View style={{ width: 74, alignItems: 'flex-end', gap: 6 }}>
              <Shimmer style={{ height: 11, width: 28 }} />
              <Shimmer style={{ height: 5, width: 60, borderRadius: 3 }} />
            </View>
          </View>
        ))}
      </View>
      <Shimmer style={sk.sectionLabel} />
      <View style={{ gap: 8 }}>
        {[0,1,2].map((i) => <Shimmer key={i} style={{ height: 54, borderRadius: 14 }} />)}
      </View>
      <Shimmer style={sk.sectionLabel} />
      <View style={sk.outlookRow}>
        {[0,1,2,3,4,5,6].map((i) => <Shimmer key={i} style={sk.outlookCell} />)}
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  gaugeStage:   { alignItems: 'center', gap: 12 },
  gaugeDisk:    { width: 260, height: 140, borderRadius: 140 },
  badgePill:    { width: 140, height: 36, borderRadius: 18 },
  line:         { width: 220, height: 12, borderRadius: 6 },
  sectionLabel: { height: 12, width: 140, borderRadius: 4 },
  card:         { borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden' },
  featureRow:   { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#20262C' },
  outlookRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  outlookCell:  { width: 44, height: 76, borderRadius: 8 },
});

// ─── Gauge ────────────────────────────────────────────────────────────────────

function Gauge({ probability, risk }: { probability: number; risk: RiskLevel }) {
  const needle     = useRef(new Animated.Value(0)).current;
  const count      = useRef(new Animated.Value(0)).current;
  const pulse      = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);
  const color    = riskColor(risk);
  const finalRot = -90 + probability * 1.8;

  useEffect(() => {
    const id = count.addListener(({ value }) => setDisplayPct(Math.round(value * probability)));
    Animated.spring(needle, { toValue: 1, stiffness: 80, damping: 12, mass: 1, useNativeDriver: true }).start();
    Animated.timing(count, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const gl = Animated.loop(Animated.sequence([
      Animated.timing(pulse,      { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse,      { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const bl = Animated.loop(Animated.sequence([
      Animated.timing(badgePulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(badgePulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    gl.start(); bl.start();
    return () => { count.removeListener(id); gl.stop(); bl.stop(); };
  }, [badgePulse, count, needle, probability, pulse]);

  const needleRot  = needle.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', `${finalRot}deg`] });
  const glowOpac   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.1] });
  const badgeScale = badgePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });

  return (
    <View style={st.gaugeStage}>
      <Animated.View style={[st.radialGlow, { opacity: glowOpac }]}>
        <Svg width="100%" height="100%" viewBox="0 0 340 260">
          <Defs>
            <RadialGradient id="rg" cx="50%" cy="56%" r="50%">
              <Stop offset="0%"   stopColor={riskGlow(risk)} stopOpacity="1" />
              <Stop offset="62%"  stopColor={riskGlow(risk)} stopOpacity="0.52" />
              <Stop offset="100%" stopColor={riskGlow(risk)} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="170" cy="156" r="154" fill="url(#rg)" />
        </Svg>
      </Animated.View>

      <View style={st.gaugeWrap}>
        <Svg width={340} height={210} viewBox="0 0 340 210">
          <Path d={arcSegment(170, 170, 150, 100, 180, 120)} fill={MonikeColors.signalBlue}  opacity={0.3} />
          <Path d={arcSegment(170, 170, 150, 100, 120,  60)} fill={MonikeColors.signalAmber} opacity={0.3} />
          <Path d={arcSegment(170, 170, 150, 100,  60,   0)} fill={MonikeColors.signalRed}   opacity={0.3} />
          {[120, 60].map((angle) => {
            const s = polar(170, 170, 98,  angle);
            const e = polar(170, 170, 152, angle);
            return <Path key={angle} d={`M ${s.x} ${s.y} L ${e.x} ${e.y}`} stroke={MonikeColors.inkGhost} strokeWidth={1} />;
          })}
          <SvgText x="54"  y="72" fill={MonikeColors.signalBlue}  fontFamily={Fonts.mono} fontSize={10} fontWeight="700">LOW</SvgText>
          <SvgText x="158" y="23" fill={MonikeColors.signalAmber}  fontFamily={Fonts.mono} fontSize={10} fontWeight="700">MED</SvgText>
          <SvgText x="275" y="72" fill={MonikeColors.signalRed}    fontFamily={Fonts.mono} fontSize={10} fontWeight="700">HIGH</SvgText>
        </Svg>
        <View style={st.probabilityBlock}>
          <Text style={[st.probabilityValue, { color }]}>{displayPct}%</Text>
          <Text style={st.probabilityLabel}>PROBABILITY</Text>
        </View>
        <Animated.View style={[st.needle, { transform: [{ rotate: needleRot }] }]}>
          <View style={st.needleTriangle} />
        </Animated.View>
        <View style={st.needlePivot} />
      </View>

      <Animated.View style={[st.riskBadge, { backgroundColor: `${color}26`, transform: [{ scale: badgeScale }] }]}>
        <Text style={[st.riskBadgeText, { color }]}>● {risk} RISK</Text>
      </Animated.View>
      <Text style={st.riskSentence}>{riskSentence(risk)}</Text>
    </View>
  );
}

// ─── Velocity card ────────────────────────────────────────────────────────────

function VelocityCard({ data }: { data: PredictionResponse }) {
  const { velocity, rolling_7d_avg, rolling_14d_avg, prev_day_spend, high_spend_threshold } = data;
  const dir = velocity.direction as 'up' | 'down' | 'flat';

  const arrowColor =
    dir === 'up'   ? MonikeColors.signalRed
    : dir === 'down' ? MonikeColors.signalBlue
    : MonikeColors.signalAmber;

  const ArrowIcon =
    dir === 'up'   ? ArrowUp
    : dir === 'down' ? ArrowDown
    : ArrowRight;

  const pctAbs = Math.abs(velocity.pct_change);

  return (
    <View style={st.velocityCard}>
      <Text style={st.velocityPeriodLabel}>SPEND VELOCITY · LAST 7 DAYS</Text>

      <View style={st.velocityTopRow}>
        <View style={st.velocityStat}>
          <Text style={st.velocityStatLabel}>LAST 7 DAYS</Text>
          <Text style={[st.velocityBigValue, { color: arrowColor }]}>
            ₦{formatNaira(velocity.last_7_total)}
          </Text>
        </View>
        <View style={st.velocityArrowWrap}>
          <ArrowIcon size={18} color={arrowColor} strokeWidth={2.5} />
          <Text style={[st.velocityPct, { color: arrowColor }]}>{pctAbs.toFixed(0)}%</Text>
        </View>
        <View style={[st.velocityStat, { alignItems: 'flex-end' }]}>
          <Text style={st.velocityStatLabel}>PREV 7 DAYS</Text>
          <Text style={st.velocityBigValue}>₦{formatNaira(velocity.prev_7_total)}</Text>
        </View>
      </View>

      <View style={st.velocityDivider} />

      <View style={st.contextRow}>
        <ContextStat label="YESTERDAY"  value={`₦${formatNaira(prev_day_spend)}`}   alert={prev_day_spend > high_spend_threshold} />
        <View style={st.contextDividerV} />
        <ContextStat label="7D AVG"     value={`₦${formatNaira(rolling_7d_avg)}`} />
        <View style={st.contextDividerV} />
        <ContextStat label="14D AVG"    value={`₦${formatNaira(rolling_14d_avg)}`} />
        <View style={st.contextDividerV} />
        <ContextStat label="THRESHOLD"  value={`₦${formatNaira(high_spend_threshold)}`} muted />
      </View>

      <Text style={st.velocityNarrative}>{velocity.narrative}</Text>
    </View>
  );
}

function ContextStat({ label, value, alert, muted }: { label: string; value: string; alert?: boolean; muted?: boolean }) {
  return (
    <View style={st.contextStat}>
      <Text style={st.contextLabel}>{label}</Text>
      <Text style={[st.contextValue, alert && { color: MonikeColors.signalRed }, muted && { color: MonikeColors.inkMuted }]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Feature row ──────────────────────────────────────────────────────────────

function FeatureRow({ feature }: { feature: FeatureImportance }) {
  const pct   = Math.round(feature.importance * 100);
  const color =
    pct >= 70 ? MonikeColors.accentOrange
    : pct >= 45 ? MonikeColors.signalAmber
    : MonikeColors.inkSecondary;

  return (
    <View style={st.featureRow}>
      <View style={st.featureCopy}>
        <Text numberOfLines={1} style={st.featureLabel}>{feature.label}</Text>
        <Text style={st.featureValue}>{feature.current_value}</Text>
      </View>
      <View style={st.importanceWrap}>
        <Text style={[st.importanceText, { color }]}>{pct}%</Text>
        <View style={st.importanceTrack}>
          <View style={[st.importanceFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

// ─── Advisor tips ─────────────────────────────────────────────────────────────

function AdvisorTips({ tips, risk }: { tips: string[]; risk: RiskLevel }) {
  const color = riskColor(risk);
  const Icon =
    risk === 'HIGH'   ? AlertTriangle
    : risk === 'MEDIUM' ? Zap
    : Info;

  return (
    <View style={st.tipsStack}>
      {tips.map((tip, i) => (
        <View key={i} style={[st.tipCard, { borderLeftColor: color }]}>
          <Icon size={16} color={color} strokeWidth={1.8} />
          <Text style={st.tipText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Week outlook ─────────────────────────────────────────────────────────────

function OutlookCell({ day }: { day: WeekOutlookDay }) {
  const risk    = normaliseRisk(day.risk);
  const color   = riskColor(risk);
  const fillPct = Math.min(100, day.probability ?? 0);

  return (
    <View style={st.outlookCell}>
      <Text style={st.outlookDay}>{day.day_label}</Text>
      <View style={st.outlookBarTrack}>
        <View style={[st.outlookBarFill, { height: `${fillPct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
      <Text style={st.outlookEmoji}>{riskEmoji(risk)}</Text>
      {day.avg_spend > 0 && (
        <Text style={st.outlookSpend} numberOfLines={1}>₦{formatNaira(day.avg_spend)}</Text>
      )}
    </View>
  );
}

// ─── Section head (matches categories' sectionHead + sectionLabel pattern) ───

function SectionHead({
  label,
  icon,
  iconBg,
  iconBorder,
}: {
  label: string;
  icon: ReactNode;
  iconBg: string;
  iconBorder: string;
}) {
  return (
    <View style={st.sectionHead}>
      <View style={[st.sectionIconWrap, { backgroundColor: iconBg, borderColor: iconBorder }]}>
        {icon}
      </View>
      <Text style={st.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={st.errorContainer}>
      <AlertTriangle size={32} color={MonikeColors.signalRed} strokeWidth={1.5} />
      <Text style={st.errorTitle}>Couldn't load forecast</Text>
      <Text style={st.errorBody}>Check your connection and try again.</Text>
      <Pressable style={st.errorButton} onPress={onRetry}>
        <RefreshCw size={14} color={MonikeColors.inkPrimary} strokeWidth={2} />
        <Text style={st.errorButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ForecastScreen() {
  const insets = useSafeAreaInsets();
  const { data, error, isLoading, mutate } = usePrediction();

  const risk        = useMemo<RiskLevel>(() => normaliseRisk(data?.risk_level ?? 'LOW'), [data]);
  const probability = useMemo(() => Math.round((data?.probability ?? 0) * 100), [data]);
  const riskCol     = riskColor(risk);

  return (
    <View style={st.root}>
      <SafeAreaView style={st.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[st.content, { paddingBottom: insets.bottom + BottomTabInset + 22 }]}
        >
          <MonikeHeader title="Risk" subtitle="Spending risk analysis" back />

          {isLoading && <ForecastSkeleton />}
          {!isLoading && error && <ErrorState onRetry={mutate} />}

          {!isLoading && !error && data && (
            <>
              {/* ── Gauge ─────────────────────────────────────────── */}
              <Gauge probability={probability} risk={risk} />

              {/* ── Velocity ──────────────────────────────────────── */}
              <VelocityCard data={data} />

              {/* ── What's driving this ───────────────────────────── */}
              <SectionHead
                label="WHAT'S DRIVING THIS"
                icon={<TrendingDown size={13} color={riskCol} strokeWidth={2.5} />}
                iconBg={`${riskCol}18`}
                iconBorder={`${riskCol}44`}
              />
              <View style={st.sectionCard}>
                {data.top_features.map((f) => (
                  <FeatureRow key={f.feature_key} feature={f} />
                ))}
              </View>

              {/* ── Advisor ───────────────────────────────────────── */}
              <SectionHead
                label="ADVISOR SAYS"
                icon={<MessageSquare size={13} color={MonikeColors.accentOrange} strokeWidth={2.5} />}
                iconBg={`${MonikeColors.accentOrange}18`}
                iconBorder={`${MonikeColors.accentOrange}44`}
              />
              <AdvisorTips tips={data.advisor_tips} risk={risk} />

              {/* ── Week outlook ──────────────────────────────────── */}
              <SectionHead
                label="WEEK AHEAD"
                icon={<CalendarDays size={13} color={MonikeColors.accentOrange} strokeWidth={2.5} />}
                iconBg={`${MonikeColors.accentOrange}18`}
                iconBorder={`${MonikeColors.accentOrange}44`}
              />
              <View style={st.outlookRow}>
                {data.week_outlook.map((day) => (
                  <OutlookCell key={day.date} day={day} />
                ))}
              </View>
              <Text style={st.outlookCaption}>
                Bars show relative overspend risk based on historical same-day patterns
              </Text>

            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="more" />
    </View>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content:  { paddingHorizontal: ScreenPadding, paddingTop: 12, gap: 16 },

  // ── Gauge ─────────────────────────────────────────────────────────────────
  gaugeStage:       { alignItems: 'center', marginBottom: 4, minHeight: 310 },
  radialGlow:       { position: 'absolute', top: -28, width: 390, height: 300 },
  gaugeWrap:        { width: 340, height: 228, alignItems: 'center', marginTop: 6 },
  probabilityBlock: { position: 'absolute', top: 82, alignItems: 'center' },
  probabilityValue: { fontFamily: Fonts.mono, fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  probabilityLabel: { marginTop: -2, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  needle:           { position: 'absolute', left: 166, top: 50, width: 8, height: 120, alignItems: 'center', justifyContent: 'flex-start', transformOrigin: '50% 100%' },
  needleTriangle:   { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 120, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: MonikeColors.inkPrimary },
  needlePivot:      { position: 'absolute', left: 165, top: 165, width: 10, height: 10, borderRadius: 5, backgroundColor: MonikeColors.inkPrimary },
  riskBadge:        { width: 180, minHeight: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF14', marginTop: -16 },
  riskBadgeText:    { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  riskSentence:     { marginTop: 8, maxWidth: 270, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600', lineHeight: 21, textAlign: 'center' },

  // ── Velocity card ─────────────────────────────────────────────────────────
  velocityCard:       { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 16, gap: 12 },
  velocityPeriodLabel:{ color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  velocityTopRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  velocityStat:       { flex: 1 },
  velocityStatLabel:  { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  velocityBigValue:   { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  velocityArrowWrap:  { alignItems: 'center', paddingHorizontal: 10, gap: 2 },
  velocityPct:        { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  velocityDivider:    { height: 1, backgroundColor: MonikeColors.inkGhost },
  velocityNarrative:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  contextRow:         { flexDirection: 'row', alignItems: 'center' },
  contextStat:        { flex: 1, alignItems: 'center', gap: 3 },
  contextLabel:       { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  contextValue:       { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  contextDividerV:    { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },

  // ── Section head (matches categories.tsx pattern exactly) ─────────────────
  sectionHead:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sectionIconWrap: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },

  // ── Feature card (row-based, same as categories' catList rows) ────────────
  sectionCard:      { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, overflow: 'hidden' },
  featureRow:       { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#20262C' },
  featureCopy:      { flex: 1, paddingRight: 12 },
  featureLabel:     { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700' },
  featureValue:     { marginTop: 3, color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  importanceWrap:   { width: 74, alignItems: 'flex-end', gap: 5 },
  importanceText:   { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '600' },
  importanceTrack:  { width: 60, height: 5, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  importanceFill:   { height: 5, borderRadius: 3 },

  // ── Advisor tips ──────────────────────────────────────────────────────────
  tipsStack: { gap: 8 },
  tipCard:   { minHeight: 54, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderLeftWidth: 3, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 13, paddingVertical: 12 },
  tipText:   { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500', lineHeight: 20 },

  // ── Week outlook ──────────────────────────────────────────────────────────
  outlookRow:      { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  outlookCell:     { flex: 1, minHeight: 90, borderRadius: 8, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, paddingTop: 6, gap: 2, overflow: 'hidden' },
  outlookDay:      { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },
  outlookBarTrack: { width: 6, flex: 1, borderRadius: 3, backgroundColor: MonikeColors.bgVoid, overflow: 'hidden', justifyContent: 'flex-end' },
  outlookBarFill:  { width: 6, borderRadius: 3 },
  outlookEmoji:    { fontSize: 12, lineHeight: 14 },
  outlookSpend:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 8, fontWeight: '600' },
  outlookCaption:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '500', textAlign: 'center' },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorContainer:  { alignItems: 'center', paddingTop: 80, gap: 10 },
  errorTitle:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  errorBody:       { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  errorButton:     { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  errorButtonText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

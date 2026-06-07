import { useEffect, useMemo, useRef, useState } from 'react';
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
import { HelpCircle } from 'lucide-react-native';

import { MonikeHeader } from '@/components/monike-header';
import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { apiFetch } from '@/services/api';
import { useSWR } from '@/hooks/use-swr';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthFlow = {
  month_label: string;
  year: number;
  month: number;
  total_credit: number;
  total_debit: number;
  net: number;
  mom_change_pct: number;   // NEW: % change in debit vs prior month
};

type FlowStats = {
  avg_monthly_in: number;
  avg_monthly_out: number;
  avg_net: number;
};

type VelocityPoint = {
  date: string;
  rolling_7d: number;
  rolling_14d: number;
  is_high_spend: boolean;
};

type RecurringTransfer = {
  recipient: string;
  avg_weekly_amount: number;
  typical_dow: number;
  last_three_dates: string[];
  total_this_month: number;
};

// NEW
type DowProfile = {
  dow: number;
  label: string;
  avg_debit: number;
  is_peak: boolean;
};

type BurnRate = {
  daily_burn: number;
  monthly_income: number;
  days_elapsed: number;
  days_remaining_in_month: number;
  projected_month_spend: number;
  projected_surplus: number;
  pct_income_burned: number;
  on_track: boolean;
};

type IncomeProfile = {
  monthly_credits: number[];
  avg: number;
  std_dev: number;
  cv: number;
  consistency_label: string;
};

type PeakDay = {
  date: string;
  amount: number;
  formatted_date: string;
};

type HealthScore = {
  score: number;
  label: string;
  color_key: 'green' | 'blue' | 'amber' | 'red';
  components: Record<string, number>;
  insight: string;
};

type FlowResponse = {
  months: MonthFlow[];
  stats: FlowStats;
  velocity: VelocityPoint[];
  current_7d_avg: number;
  current_14d_avg: number;
  momentum: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
  recurring: RecurringTransfer[];
  total_recurring_weekly: number;
  total_monthly_spend: number;
  // NEW
  dow_profile: DowProfile[];
  burn_rate: BurnRate;
  income_profile: IncomeProfile;
  peak_day: PeakDay | null;
  health_score: HealthScore;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(n));
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${fmt(n)}`;
}
function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
}

const HEALTH_COLORS: Record<string, string> = {
  green: MonikeColors.accentPulse,
  blue:  MonikeColors.signalBlue,
  amber: MonikeColors.signalAmber,
  red:   MonikeColors.signalRed,
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonBlock({ width, height, style }: { width: number | string; height: number; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <Animated.View
      style={[{ width, height, borderRadius: 6, backgroundColor: MonikeColors.bgElevated, opacity }, style]}
    />
  );
}

function SkeletonScreen() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: ScreenPadding, gap: 20 }}>
      <SkeletonBlock width="60%" height={28} />
      <SkeletonBlock width="80%" height={16} />
      <SkeletonBlock width="100%" height={100} />
      <SkeletonBlock width="100%" height={180} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBlock width="32%" height={72} />
        <SkeletonBlock width="32%" height={72} />
        <SkeletonBlock width="32%" height={72} />
      </View>
      <SkeletonBlock width="100%" height={140} />
      <SkeletonBlock width="100%" height={140} />
      <SkeletonBlock width="100%" height={200} />
      <SkeletonBlock width="100%" height={120} />
      <SkeletonBlock width="100%" height={100} />
    </ScrollView>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.sectionLabelWrap}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      {sub && <Text style={styles.sectionLabelSub}>{sub}</Text>}
    </View>
  );
}

// ─── NEW: Cashflow Health Score ───────────────────────────────────────────────

function HealthScoreCard({ health }: { health: HealthScore }) {
  const color = HEALTH_COLORS[health.color_key];
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: health.score / 100,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [health.score]);

  const barWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const totalMax = Object.values(health.components).reduce((a, b) => {
    // max for each component depends on the rubric — just show relative bars
    return a + b;
  }, 0);

  return (
    <View style={[styles.healthCard, { borderColor: `${color}33` }]}>
      {/* Score header */}
      <View style={styles.healthHeader}>
        <View style={styles.healthScoreWrap}>
          <Text style={[styles.healthScoreNum, { color }]}>{health.score}</Text>
          <Text style={styles.healthScoreMax}>/100</Text>
        </View>
        <View style={styles.healthRight}>
          <View style={[styles.healthBadge, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
            <Text style={[styles.healthBadgeText, { color }]}>{health.label.toUpperCase()}</Text>
          </View>
          <Text style={styles.healthInsight}>{health.insight}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.healthBarTrack}>
        <Animated.View style={[styles.healthBarFill, { width: barWidth, backgroundColor: color }]} />
      </View>

      {/* Components */}
      <View style={styles.healthComponents}>
        {Object.entries(health.components).map(([key, val]) => (
          <View key={key} style={styles.healthComponentRow}>
            <Text style={styles.healthComponentLabel}>{key}</Text>
            <View style={styles.healthComponentBar}>
              <View
                style={[
                  styles.healthComponentFill,
                  { width: `${(val / Math.max(totalMax * 0.35, 1)) * 100}%`, backgroundColor: `${color}88` },
                ]}
              />
            </View>
            <Text style={[styles.healthComponentVal, { color }]}>{val}pt</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── NEW: Day-of-week Heatmap ─────────────────────────────────────────────────

function DowHeatmap({ profile }: { profile: DowProfile[] }) {
  const maxVal = Math.max(...profile.map((d) => d.avg_debit), 1);
  const animations = useRef<Animated.Value[]>(profile.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    animations.forEach((a) => a.setValue(0));
    Animated.stagger(
      60,
      animations.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    ).start();
  }, [profile]);

  return (
    <View style={styles.dowCard}>
      <View style={styles.dowRow}>
        {profile.map((d, i) => {
          const intensity = d.avg_debit / maxVal;
          const barH = animations[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.max(intensity * 80, 4)],
          });
          const barColor = d.is_peak
            ? MonikeColors.signalRed
            : intensity > 0.7
            ? MonikeColors.signalAmber
            : MonikeColors.accentPulse;

          return (
            <View key={d.dow} style={styles.dowCol}>
              {/* Amount label */}
              <Text style={[styles.dowAmount, d.is_peak && { color: MonikeColors.signalRed }]}>
                {fmtShort(d.avg_debit)}
              </Text>
              {/* Bar */}
              <View style={styles.dowBarSlot}>
                <Animated.View
                  style={[
                    styles.dowBar,
                    {
                      height: barH,
                      backgroundColor: barColor,
                      opacity: 0.3 + intensity * 0.7,
                    },
                  ]}
                />
              </View>
              {/* Label */}
              <Text style={[styles.dowLabel, d.is_peak && { color: MonikeColors.signalRed, fontWeight: '700' }]}>
                {d.label}
              </Text>
              {d.is_peak && <Text style={styles.dowPeakPin}>▲</Text>}
            </View>
          );
        })}
      </View>
      <Text style={styles.dowCaption}>Average daily spend per weekday across all history</Text>
    </View>
  );
}

// ─── NEW: Burn Rate Card ──────────────────────────────────────────────────────

function BurnRateCard({ burn }: { burn: BurnRate }) {
  const pctFillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pctFillAnim.setValue(0);
    Animated.timing(pctFillAnim, {
      toValue: Math.min(burn.pct_income_burned / 100, 1),
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [burn.pct_income_burned]);

  const fillWidth = pctFillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const surplusColor = burn.on_track ? MonikeColors.accentPulse : MonikeColors.signalRed;
  const barColor = burn.pct_income_burned > 85
    ? MonikeColors.signalRed
    : burn.pct_income_burned > 65
    ? MonikeColors.signalAmber
    : MonikeColors.accentPulse;

  return (
    <View style={[styles.burnCard, { borderColor: `${surplusColor}33` }]}>
      {/* Top row */}
      <View style={styles.burnTopRow}>
        <View>
          <Text style={styles.burnLabel}>DAILY BURN RATE</Text>
          <Text style={[styles.burnAmount, { color: MonikeColors.inkPrimary }]}>
            ₦{fmt(burn.daily_burn)} / day
          </Text>
        </View>
        <View style={[styles.burnBadge, { backgroundColor: `${surplusColor}15`, borderColor: `${surplusColor}44` }]}>
          <Text style={[styles.burnBadgeText, { color: surplusColor }]}>
            {burn.on_track ? '✓ ON TRACK' : '✗ OVER BUDGET'}
          </Text>
        </View>
      </View>

      {/* Progress bar: % of income burned this month */}
      <View style={styles.burnProgressWrap}>
        <View style={styles.burnProgressTrack}>
          <Animated.View style={[styles.burnProgressFill, { width: fillWidth, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.burnProgressLabel, { color: barColor }]}>
          {burn.pct_income_burned.toFixed(1)}% of income spent so far ({burn.days_elapsed}d elapsed)
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.burnStatsRow}>
        <View style={styles.burnStat}>
          <Text style={styles.burnStatValue}>₦{fmt(burn.monthly_income)}</Text>
          <Text style={styles.burnStatLabel}>Income this month</Text>
        </View>
        <View style={styles.burnStatDivider} />
        <View style={styles.burnStat}>
          <Text style={styles.burnStatValue}>₦{fmt(burn.projected_month_spend)}</Text>
          <Text style={styles.burnStatLabel}>Projected total spend</Text>
        </View>
        <View style={styles.burnStatDivider} />
        <View style={styles.burnStat}>
          <Text style={[styles.burnStatValue, { color: surplusColor }]}>
            {burn.on_track ? '+' : '−'}₦{fmt(burn.projected_surplus)}
          </Text>
          <Text style={styles.burnStatLabel}>Projected {burn.on_track ? 'surplus' : 'deficit'}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── NEW: Income Consistency Card ────────────────────────────────────────────

function IncomeConsistencyCard({ income }: { income: IncomeProfile }) {
  if (!income.monthly_credits.length) return null;

  const max = Math.max(...income.monthly_credits, 1);
  const animations = useRef<Animated.Value[]>(income.monthly_credits.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    animations.forEach((a) => a.setValue(0));
    Animated.stagger(
      40,
      animations.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    ).start();
  }, [income.monthly_credits]);

  const cvColor =
    income.consistency_label === 'Very Consistent'
      ? MonikeColors.accentPulse
      : income.consistency_label === 'Moderate'
      ? MonikeColors.signalAmber
      : MonikeColors.signalRed;

  return (
    <View style={styles.incomeCard}>
      {/* Header */}
      <View style={styles.incomeHeaderRow}>
        <View>
          <Text style={styles.incomeAvg}>₦{fmt(income.avg)}</Text>
          <Text style={styles.incomeAvgLabel}>avg monthly income</Text>
        </View>
        <View style={[styles.incomeCvBadge, { backgroundColor: `${cvColor}15`, borderColor: `${cvColor}44` }]}>
          <Text style={[styles.incomeCvLabel, { color: cvColor }]}>{income.consistency_label.toUpperCase()}</Text>
          <Text style={[styles.incomeCvVal, { color: cvColor }]}>CV {income.cv.toFixed(1)}%</Text>
        </View>
      </View>

      {/* Mini bar chart of monthly credits */}
      <View style={styles.incomeBarRow}>
        {income.monthly_credits.map((val, i) => {
          const barH = animations[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.max((val / max) * 48, 3)],
          });
          return (
            <View key={i} style={styles.incomeBarSlot}>
              <Animated.View
                style={[
                  styles.incomeBar,
                  {
                    height: barH,
                    backgroundColor: MonikeColors.signalBlue,
                    opacity: 0.4 + (val / max) * 0.6,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* Std dev note */}
      <Text style={styles.incomeStdNote}>
        ±₦{fmt(income.std_dev)} std deviation — {income.cv < 15
          ? 'your income is highly predictable, great for budgeting.'
          : income.cv < 30
          ? 'some month-to-month variation, keep a small buffer.'
          : 'high variability — build a 2–3 month expense reserve.'}
      </Text>
    </View>
  );
}

// ─── NEW: Peak Day Banner ─────────────────────────────────────────────────────

function PeakDayBanner({ peak }: { peak: PeakDay }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.peakBanner, { transform: [{ scale: pulseAnim }] }]}>
      <Text style={styles.peakBannerEmoji}>🔥</Text>
      <View style={styles.peakBannerContent}>
        <Text style={styles.peakBannerTitle}>HIGHEST SINGLE-DAY SPEND</Text>
        <Text style={styles.peakBannerAmount}>₦{fmt(peak.amount)}</Text>
        <Text style={styles.peakBannerDate}>on {peak.formatted_date}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Grouped Bar Chart ────────────────────────────────────────────────────────

function GroupedBarChart({ months }: { months: MonthFlow[] }) {
  const animations = useRef<Animated.Value[]>([]).current;
  while (animations.length < months.length * 2) animations.push(new Animated.Value(0));

  const maxVal = Math.max(...months.map((m) => Math.max(m.total_credit, m.total_debit)), 1);
  const CHART_H = 140;
  const BAR_W   = 16;

  useEffect(() => {
    animations.forEach((a) => a.setValue(0));
    Animated.stagger(
      30,
      animations.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    ).start();
  }, [months]);

  const creditPts = months.map((m, i) => ({
    x: i * (BAR_W * 2 + 4 + 16) + BAR_W / 2,
    y: CHART_H - (m.total_credit / maxVal) * CHART_H,
  }));
  const debitPts = months.map((m, i) => ({
    x: i * (BAR_W * 2 + 4 + 16) + BAR_W + 4 + BAR_W / 2,
    y: CHART_H - (m.total_debit / maxVal) * CHART_H,
  }));

  const totalWidth = months.length * (BAR_W * 2 + 4 + 16) - 16;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}>
      <View style={{ width: totalWidth + 24, paddingHorizontal: 12 }}>
        <View style={[styles.chartArea, { height: CHART_H + 24 }]}>
          {/* Credit trendline */}
          {creditPts.slice(0, -1).map((pt, i) => {
            const next = creditPts[i + 1];
            const dx = next.x - pt.x, dy = next.y - pt.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={`ct-${i}`} style={{
                position: 'absolute', left: pt.x, top: pt.y,
                width: length, height: 1,
                borderTopWidth: 1, borderColor: `${MonikeColors.signalBlue}55`, borderStyle: 'dashed',
                transform: [{ rotate: `${angle}deg` }, { translateY: -0.5 }],
                transformOrigin: '0 0',
              }} />
            );
          })}
          {/* Debit trendline */}
          {debitPts.slice(0, -1).map((pt, i) => {
            const next = debitPts[i + 1];
            const dx = next.x - pt.x, dy = next.y - pt.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={`dt-${i}`} style={{
                position: 'absolute', left: pt.x, top: pt.y,
                width: length, height: 1,
                borderTopWidth: 1, borderColor: `${MonikeColors.signalRed}44`, borderStyle: 'dashed',
                transform: [{ rotate: `${angle}deg` }, { translateY: -0.5 }],
                transformOrigin: '0 0',
              }} />
            );
          })}

          {/* Bars */}
          <View style={styles.barsRow}>
            {months.map((m, i) => {
              const creditH = animations[i * 2].interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.max((m.total_credit / maxVal) * CHART_H, 2)],
              });
              const debitH = animations[i * 2 + 1].interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.max((m.total_debit / maxVal) * CHART_H, 2)],
              });
              const debitColor = m.total_debit > m.total_credit ? MonikeColors.signalRed : MonikeColors.accentPulse;
              return (
                <View key={m.month_label} style={[styles.barGroup, i > 0 && { marginLeft: 16 }]}>
                  <View style={[styles.barSlot, { height: CHART_H }]}>
                    <Animated.View style={[styles.bar, { width: BAR_W, height: creditH, backgroundColor: MonikeColors.signalBlue }]} />
                  </View>
                  <View style={{ width: 4 }} />
                  <View style={[styles.barSlot, { height: CHART_H }]}>
                    <Animated.View style={[styles.bar, { width: BAR_W, height: debitH, backgroundColor: debitColor }]} />
                  </View>
                </View>
              );
            })}
          </View>

          {/* X labels */}
          <View style={styles.xLabelsRow}>
            {months.map((m) => (
              <View key={m.month_label} style={[styles.xLabelWrap, { width: BAR_W * 2 + 4 }]}>
                <Text style={styles.xLabel}>{m.month_label.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Net Flow Stats ───────────────────────────────────────────────────────────

function NetFlowStats({ stats }: { stats: FlowStats }) {
  const netColor = stats.avg_net >= 0 ? MonikeColors.accentPulse : MonikeColors.signalRed;
  return (
    <View style={styles.statsCard}>
      <View style={styles.statCol}>
        <Text style={styles.statCardValue}>₦{fmt(stats.avg_monthly_in)}</Text>
        <Text style={styles.statCardLabel}>AVG MONTHLY IN</Text>
      </View>
      <View style={styles.statCardDivider} />
      <View style={styles.statCol}>
        <Text style={styles.statCardValue}>₦{fmt(stats.avg_monthly_out)}</Text>
        <Text style={styles.statCardLabel}>AVG MONTHLY OUT</Text>
      </View>
      <View style={styles.statCardDivider} />
      <View style={styles.statCol}>
        <Text style={[styles.statCardValue, { color: netColor }]}>
          {stats.avg_net >= 0 ? '+' : '−'}₦{fmt(stats.avg_net)}
        </Text>
        <Text style={styles.statCardLabel}>AVG NET</Text>
      </View>
    </View>
  );
}

// ─── Monthly Net Bars (with MoM %) ───────────────────────────────────────────

function MonthlyNetBars({ months }: { months: MonthFlow[] }) {
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.net)), 1);
  const animations = useRef<Animated.Value[]>([]).current;
  while (animations.length < months.length) animations.push(new Animated.Value(0));

  useEffect(() => {
    animations.forEach((a) => a.setValue(0));
    Animated.stagger(
      60,
      animations.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    ).start();
  }, [months]);

  const BAR_MAX = 100;

  return (
    <View style={styles.netBarsCard}>
      {months.map((m, i) => {
        const isPositive = m.net >= 0;
        const barWidth = animations[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.max((Math.abs(m.net) / maxAbs) * BAR_MAX, 4)],
        });
        const barColor = isPositive ? MonikeColors.accentPulse : MonikeColors.signalRed;
        // MoM badge: only show from second month onwards (first month has 0 sentinel)
        const showMom = i > 0;
        const momPositive = m.mom_change_pct <= 0; // spend went DOWN = good
        const momColor = momPositive ? MonikeColors.accentPulse : MonikeColors.signalAmber;

        return (
          <View key={m.month_label} style={styles.netBarRow}>
            <Text style={styles.netBarMonthLabel}>{m.month_label.split(' ')[0]}</Text>
            <View style={styles.netBarTrack}>
              <View style={styles.netBarHalf}>
                {!isPositive && (
                  <Animated.View style={[styles.netBar, { width: barWidth, backgroundColor: barColor, alignSelf: 'flex-end', borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }]} />
                )}
              </View>
              <View style={styles.netBarAxis} />
              <View style={styles.netBarHalf}>
                {isPositive && (
                  <Animated.View style={[styles.netBar, { width: barWidth, backgroundColor: barColor, borderTopRightRadius: 3, borderBottomRightRadius: 3 }]} />
                )}
              </View>
            </View>
            <Text style={[styles.netBarAmount, { color: barColor }]}>
              {isPositive ? '+' : '−'}₦{fmt(m.net)}
            </Text>
            {/* MoM change badge */}
            {showMom ? (
              <View style={[styles.momBadge, { backgroundColor: `${momColor}15`, borderColor: `${momColor}44` }]}>
                <Text style={[styles.momBadgeText, { color: momColor }]}>
                  {momPositive ? '↓' : '↑'}{Math.abs(m.mom_change_pct).toFixed(0)}%
                </Text>
              </View>
            ) : (
              <View style={[styles.netBadge, { backgroundColor: `${barColor}18`, borderColor: `${barColor}44` }]}>
                <Text style={[styles.netBadgeText, { color: barColor }]}>
                  {isPositive ? 'SURPLUS' : 'DEFICIT'}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Velocity Chart ───────────────────────────────────────────────────────────

function VelocityChart({ velocity }: { velocity: VelocityPoint[] }) {
  if (!velocity.length) return null;

  const CHART_H = 140;
  const CHART_W_PER_PT = 4;
  const points = velocity.length > 180
    ? velocity.filter((_, i) => i % Math.ceil(velocity.length / 180) === 0)
    : velocity;

  const maxVal = Math.max(...points.map((p) => Math.max(p.rolling_7d, p.rolling_14d)), 1);
  const CHART_W = Math.max(points.length * CHART_W_PER_PT, 300);

  const getY = (val: number) => CHART_H - (val / maxVal) * CHART_H;
  const getX = (i: number) => (i / Math.max(points.length - 1, 1)) * CHART_W;

  const peaks = [...points]
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => b.rolling_7d - a.rolling_7d)
    .slice(0, 3);

  const clusters: { start: number; end: number }[] = [];
  let clusterStart: number | null = null;
  points.forEach((p, i) => {
    if (p.is_high_spend && clusterStart === null) clusterStart = i;
    if (!p.is_high_spend && clusterStart !== null) {
      clusters.push({ start: clusterStart, end: i - 1 });
      clusterStart = null;
    }
  });
  if (clusterStart !== null) clusters.push({ start: clusterStart, end: points.length - 1 });

  return (
    <View style={styles.velocityCard}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: CHART_W, height: CHART_H + 20, position: 'relative' }}>
          {clusters.map((c, ci) => (
            <View key={ci} style={{
              position: 'absolute', left: getX(c.start), top: 0,
              width: getX(c.end) - getX(c.start) + CHART_W_PER_PT, height: CHART_H,
              backgroundColor: 'rgba(255,61,61,0.07)',
            }} />
          ))}
          {points.slice(0, -1).map((p, i) => {
            const next = points[i + 1];
            const x1 = getX(i), x2 = getX(i + 1);
            const y7a = getY(p.rolling_7d), y14a = getY(p.rolling_14d);
            const above = p.rolling_7d > p.rolling_14d;
            const zoneH = Math.abs(y14a - y7a);
            const zoneTop = Math.min(y7a, y14a);
            return (
              <View key={i} style={{
                position: 'absolute', left: x1, top: zoneTop,
                width: x2 - x1 + 1, height: Math.max(zoneH, 1),
                backgroundColor: above ? 'rgba(255,61,61,0.10)' : 'rgba(0,230,118,0.10)',
              }} />
            );
          })}
          {points.slice(0, -1).map((p, i) => {
            if (i % 3 !== 0) return null;
            const next = points[i + 1];
            const x1 = getX(i), y1 = getY(p.rolling_14d);
            const x2 = getX(i + 1), y2 = getY(next.rolling_14d);
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return (
              <View key={`l14-${i}`} style={{
                position: 'absolute', left: x1, top: y1,
                width: len, height: 2, backgroundColor: MonikeColors.inkMuted, opacity: 0.5,
                transform: [{ rotate: `${angle}deg` }], transformOrigin: '0 0',
              }} />
            );
          })}
          {points.slice(0, -1).map((p, i) => {
            const next = points[i + 1];
            const x1 = getX(i), y1 = getY(p.rolling_7d);
            const x2 = getX(i + 1), y2 = getY(next.rolling_7d);
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return (
              <View key={`l7-${i}`} style={{
                position: 'absolute', left: x1, top: y1,
                width: len, height: 2.5, backgroundColor: MonikeColors.accentPulse,
                transform: [{ rotate: `${angle}deg` }], transformOrigin: '0 0',
              }} />
            );
          })}
          {points.map((p, i) => (
            <View key={`area-${i}`} style={{
              position: 'absolute', left: getX(i), top: getY(p.rolling_7d),
              width: CHART_W_PER_PT, height: CHART_H - getY(p.rolling_7d),
              backgroundColor: `${MonikeColors.accentPulse}12`,
            }} />
          ))}
          {peaks.map((p) => (
            <View key={`peak-${p.i}`} style={{
              position: 'absolute', left: getX(p.i) - 20, top: getY(p.rolling_7d) - 22, alignItems: 'center',
            }}>
              <Text style={styles.peakLabel}>{fmtShort(p.rolling_7d)}</Text>
              <Text style={styles.peakPin}>↑</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.velocityLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: MonikeColors.accentPulse }]} />
          <Text style={styles.legendText}>7-day avg</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: MonikeColors.inkMuted, opacity: 0.5 }]} />
          <Text style={styles.legendText}>14-day avg (baseline)</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Velocity Header ──────────────────────────────────────────────────────────

function VelocityHeader() {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.velocityHeaderRow}>
      <Text style={styles.sectionLabelText}>SPEND VELOCITY</Text>
      <Pressable onPress={() => setShow((v) => !v)} style={styles.tooltipIconWrap}>
        <HelpCircle size={14} color={MonikeColors.inkMuted} strokeWidth={2} />
      </Pressable>
      {show && (
        <View style={styles.tooltipPopover}>
          <Text style={styles.tooltipText}>
            Rate of change in your daily spending — positive means accelerating, negative means you're slowing down.
          </Text>
          <Pressable onPress={() => setShow(false)}>
            <Text style={[styles.tooltipText, { color: MonikeColors.accentPulse, marginTop: 6 }]}>Dismiss</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Acceleration Card ────────────────────────────────────────────────────────

function AccelerationCard({ momentum, cur7, cur14 }: {
  momentum: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
  cur7: number;
  cur14: number;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  const config = {
    ACCELERATING: {
      arrow: '↗', label: 'SPEND ACCELERATING', color: MonikeColors.signalRed,
      sub: `Your 7-day avg (₦${fmt(cur7)}) is above your 14-day avg (₦${fmt(cur14)}).`,
      translateRange: [0, -6] as [number, number],
    },
    STABLE: {
      arrow: '→', label: 'HOLDING STEADY', color: MonikeColors.signalAmber,
      sub: `Your spend trend is flat relative to baseline (₦${fmt(cur14)}).`,
      translateRange: [-2, 2] as [number, number],
    },
    DECELERATING: {
      arrow: '↘', label: 'SPEND DECELERATING', color: MonikeColors.accentPulse,
      sub: `Your 7-day avg (₦${fmt(cur7)}) is below your 14-day avg (₦${fmt(cur14)}). Good trajectory.`,
      translateRange: [0, 6] as [number, number],
    },
  }[momentum];

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: config.translateRange });

  return (
    <View style={[styles.accelCard, { borderColor: `${config.color}33` }]}>
      <View style={styles.accelLeft}>
        <Animated.Text style={[styles.accelArrow, { color: config.color, transform: [{ translateY }] }]}>
          {config.arrow}
        </Animated.Text>
      </View>
      <View style={styles.accelRight}>
        <Text style={[styles.accelLabel, { color: config.color }]}>{config.label}</Text>
        <Text style={styles.accelSub}>{config.sub}</Text>
      </View>
    </View>
  );
}

// ─── Recurring Section ────────────────────────────────────────────────────────

function RecurringRow({ item }: { item: RecurringTransfer }) {
  const avatarColor = useMemo(() => {
    const colors = [MonikeColors.accentPulse, MonikeColors.signalBlue, MonikeColors.signalAmber];
    return colors[item.recipient.charCodeAt(0) % colors.length];
  }, [item.recipient]);

  return (
    <View style={styles.recurringRow}>
      <View style={[styles.recurringAvatar, { backgroundColor: `${avatarColor}22`, borderColor: `${avatarColor}44` }]}>
        <Text style={[styles.recurringAvatarText, { color: avatarColor }]}>{initials(item.recipient)}</Text>
      </View>
      <View style={styles.recurringContent}>
        <Text style={styles.recurringName} numberOfLines={1}>{item.recipient}</Text>
        <Text style={styles.recurringWeekly}>~₦{fmt(item.avg_weekly_amount)} / week</Text>
        <View style={styles.recurringDates}>
          <Text style={styles.recurringEvery}>Every {DOW[item.typical_dow]}:</Text>
          {item.last_three_dates.map((d,i) => (
            <View key={`${d}-${i}`} style={styles.dateChip}>
              <Text style={styles.dateChipText}>{fmtDate(d)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.recurringMonthTotal}>₦{fmt(item.total_this_month)} this month</Text>
      </View>
      <View style={styles.recurringBadge}>
        <Text style={styles.recurringBadgeText}>RECURRING</Text>
      </View>
    </View>
  );
}

function RecurringSection({ items, totalWeekly, totalMonthlySpend }: {
  items: RecurringTransfer[];
  totalWeekly: number;
  totalMonthlySpend: number;
}) {
  const pct = totalMonthlySpend > 0 ? ((totalWeekly * 4.33) / totalMonthlySpend) * 100 : 0;

  return (
    <View style={styles.recurringSection}>
      <SectionLabel title="RECURRING COMMITMENTS" sub="Auto-detected from your transfer history." />
      {items.length === 0 ? (
        <View style={styles.recurringEmpty}>
          <Text style={styles.recurringEmptyText}>No recurring patterns detected yet.</Text>
          <Text style={styles.recurringEmptySub}>Patterns appear after 3+ consecutive weeks of similar transfers.</Text>
        </View>
      ) : (
        <>
          <View style={styles.recurringCard}>
            {items.map((item, i) => (
              <View key={item.recipient}>
                <RecurringRow item={item} />
                {i < items.length - 1 && <View style={styles.recurringDivider} />}
              </View>
            ))}
          </View>
          <View style={styles.obligationsCard}>
            <Text style={styles.obligationsAmount}>₦{fmt(totalWeekly)}</Text>
            <Text style={styles.obligationsLabel}>in likely recurring weekly transfers</Text>
            <Text style={styles.obligationsPct}>{pct.toFixed(1)}% of your monthly spend</Text>
            <View style={styles.budgetTipRow}>
              <Text style={styles.budgetTipText}>
                💡 If these are expected, they're fine. If unexpected, review your Top Recipients screen.
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FlowVelocityScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useSWR<FlowResponse>('/flow', apiFetch);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <MonikeHeader title="Flow & Velocity" />

        {isLoading ? (
          <SkeletonScreen />
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Failed to load: {error.message}</Text>
          </View>
        ) : data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
          >
            {/* Page header */}
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>FLOW & VELOCITY</Text>
              <Text style={styles.pageSubtitle}>Money in vs out, spend trajectory, and cashflow health.</Text>
            </View>

            {/* ── 1. Health Score (lead with the most important thing) ── */}
            <SectionLabel title="CASHFLOW HEALTH" sub="Composite score across 5 dimensions." />
            <HealthScoreCard health={data.health_score} />

            {/* ── 2. Burn Rate ── */}
            <SectionLabel title="BURN RATE" sub="This month's income vs projected spend." />
            <BurnRateCard burn={data.burn_rate} />

            {/* ── 3. Monthly flow chart ── */}
            <SectionLabel title="NET FLOW BY MONTH" />
            <GroupedBarChart months={data.months} />
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: MonikeColors.signalBlue }]} />
                <Text style={styles.legendText}>Credits (in)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: MonikeColors.accentPulse }]} />
                <Text style={styles.legendText}>Debits — healthy</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: MonikeColors.signalRed }]} />
                <Text style={styles.legendText}>Debits — overspent</Text>
              </View>
            </View>

            {/* ── 4. Avg stats ── */}
            <NetFlowStats stats={data.stats} />

            {/* ── 5. Monthly net bars + MoM ── */}
            <MonthlyNetBars months={data.months} />

            {/* ── 6. Income Consistency ── */}
            <SectionLabel title="INCOME CONSISTENCY" sub="How predictable is your monthly income?" />
            <IncomeConsistencyCard income={data.income_profile} />

            {/* ── 7. Day-of-week heatmap ── */}
            <SectionLabel title="SPEND BY DAY OF WEEK" sub="Your most expensive days, historically." />
            <DowHeatmap profile={data.dow_profile} />

            {/* ── 8. Peak day ── */}
            {data.peak_day && (
              <>
                <SectionLabel title="SINGLE-DAY RECORD" />
                <PeakDayBanner peak={data.peak_day} />
              </>
            )}

            {/* ── 9. Velocity ── */}
            <VelocityHeader />
            <VelocityChart velocity={data.velocity} />
            <AccelerationCard momentum={data.momentum} cur7={data.current_7d_avg} cur14={data.current_14d_avg} />

            {/* ── 10. Recurring ── */}
            <RecurringSection
              items={data.recurring}
              totalWeekly={data.total_recurring_weekly}
              totalMonthlySpend={data.total_monthly_spend}
            />
          </ScrollView>
        ) : null}
      </SafeAreaView>
      <BottomNavigation activeRoute="home" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content:  { paddingHorizontal: ScreenPadding, paddingTop: 4, gap: 14 },
  errorWrap:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:{ color: MonikeColors.signalRed, fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center' },

  pageHeader: { paddingTop: 8, paddingBottom: 4 },
  pageTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', letterSpacing: 0.4 },
  pageSubtitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginTop: 4 },

  sectionLabelWrap: { gap: 2, marginTop: 6 },
  sectionLabelText: {
    color: MonikeColors.inkSecondary, fontFamily: Fonts.sans,
    fontSize: 11, fontWeight: '700', letterSpacing: 1.0, textTransform: 'uppercase',
  },
  sectionLabelSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },

  // ── Health Score ──
  healthCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderRadius: CardRadius,
    padding: 16, gap: 14,
  },
  healthHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  healthScoreWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  healthScoreNum: { fontFamily: Fonts.mono, fontSize: 40, fontWeight: '700', lineHeight: 44 },
  healthScoreMax: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 14, marginBottom: 6 },
  healthRight: { flex: 1, gap: 6 },
  healthBadge: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  healthBadgeText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  healthInsight: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17 },
  healthBarTrack: {
    height: 6, backgroundColor: MonikeColors.bgElevated,
    borderRadius: 3, overflow: 'hidden',
  },
  healthBarFill: { height: 6, borderRadius: 3 },
  healthComponents: { gap: 7 },
  healthComponentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthComponentLabel: { width: 120, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  healthComponentBar: {
    flex: 1, height: 4, backgroundColor: MonikeColors.bgElevated,
    borderRadius: 2, overflow: 'hidden',
  },
  healthComponentFill: { height: 4, borderRadius: 2 },
  healthComponentVal: { width: 30, fontFamily: Fonts.mono, fontSize: 10, textAlign: 'right' },

  // ── Burn Rate ──
  burnCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderRadius: CardRadius,
    padding: 16, gap: 14,
  },
  burnTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  burnLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  burnAmount: { fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  burnBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  burnBadgeText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  burnProgressWrap: { gap: 6 },
  burnProgressTrack: { height: 8, backgroundColor: MonikeColors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  burnProgressFill: { height: 8, borderRadius: 4 },
  burnProgressLabel: { fontFamily: Fonts.sans, fontSize: 11 },
  burnStatsRow: { flexDirection: 'row', alignItems: 'center' },
  burnStat: { flex: 1, alignItems: 'center', gap: 4 },
  burnStatDivider: { width: 1, height: 32, backgroundColor: MonikeColors.inkGhost },
  burnStatValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  burnStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, textAlign: 'center' },

  // ── Income Consistency ──
  incomeCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 14, gap: 12,
  },
  incomeHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  incomeAvg: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  incomeAvgLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 2 },
  incomeCvBadge: { borderWidth: 1, borderRadius: 10, padding: 8, alignItems: 'center', gap: 2 },
  incomeCvLabel: { fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },
  incomeCvVal: { fontFamily: Fonts.mono, fontSize: 11 },
  incomeBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 52 },
  incomeBarSlot: { flex: 1, justifyContent: 'flex-end' },
  incomeBar: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  incomeStdNote: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },

  // ── DOW Heatmap ──
  dowCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 14, gap: 10,
  },
  dowRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  dowCol: { flex: 1, alignItems: 'center', gap: 4 },
  dowAmount: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 8, textAlign: 'center' },
  dowBarSlot: { width: '100%', alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  dowBar: { width: '75%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dowLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9 },
  dowPeakPin: { color: MonikeColors.signalRed, fontSize: 8 },
  dowCaption: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, textAlign: 'center' },

  // ── Peak Day Banner ──
  peakBanner: {
    backgroundColor: `${MonikeColors.signalRed}10`,
    borderWidth: 1, borderColor: `${MonikeColors.signalRed}33`,
    borderRadius: CardRadius, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  peakBannerEmoji: { fontSize: 28 },
  peakBannerContent: { gap: 2 },
  peakBannerTitle: {
    color: MonikeColors.signalRed, fontFamily: Fonts.mono,
    fontSize: 9, fontWeight: '700', letterSpacing: 1,
  },
  peakBannerAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700' },
  peakBannerDate: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },

  // ── Chart (existing) ──
  chartScroll: { marginHorizontal: -ScreenPadding },
  chartArea:   { position: 'relative', overflow: 'visible' },
  barsRow: {
    position: 'absolute', bottom: 20, left: 12,
    flexDirection: 'row', alignItems: 'flex-end',
  },
  barGroup: { flexDirection: 'row', alignItems: 'flex-end' },
  barSlot:  { justifyContent: 'flex-end', alignItems: 'center' },
  bar:      { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  xLabelsRow: { position: 'absolute', bottom: 0, left: 12, flexDirection: 'row' },
  xLabelWrap: { alignItems: 'center', marginRight: 16 },
  xLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4, marginTop: -4 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLine:  { width: 18, height: 2, borderRadius: 1 },
  legendText:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // ── Stats Card ──
  statsCard: {
    flexDirection: 'row', backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingVertical: 16,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 5 },
  statCardDivider: { width: 1, backgroundColor: MonikeColors.inkGhost, marginVertical: 8 },
  statCardValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  statCardLabel: {
    color: MonikeColors.inkMuted, fontFamily: Fonts.sans,
    fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center', paddingHorizontal: 6,
  },

  // ── Net Bars + MoM ──
  netBarsCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingVertical: 12, paddingHorizontal: 14, gap: 10,
  },
  netBarRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  netBarMonthLabel:  { width: 28, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  netBarTrack:       { flex: 1, flexDirection: 'row', alignItems: 'center', height: 14 },
  netBarHalf:        { flex: 1, flexDirection: 'row' },
  netBarAxis:        { width: 1, height: 14, backgroundColor: MonikeColors.inkGhost },
  netBar:            { height: 10 },
  netBarAmount:      { width: 70, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  netBadge: {
    borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  netBadgeText: { fontFamily: Fonts.mono, fontSize: 8, fontWeight: '700' },
  // NEW MoM badge
  momBadge: {
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  momBadgeText: { fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },

  // ── Velocity ──
  velocityHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'relative', marginTop: 6 },
  tooltipIconWrap:   { padding: 2 },
  velocityCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, overflow: 'hidden', padding: 12, gap: 10,
  },
  velocityLegend: { flexDirection: 'row', gap: 14, paddingTop: 4 },
  peakLabel: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 8 },
  peakPin:   { color: MonikeColors.accentPulse, fontSize: 10 },
  tooltipPopover: {
    position: 'absolute', top: 22, left: 0, right: 0,
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: 10, padding: 12, zIndex: 20,
  },
  tooltipText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },

  // ── Acceleration ──
  accelCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderRadius: CardRadius, padding: 16, gap: 14,
  },
  accelLeft:  { width: 44, alignItems: 'center' },
  accelArrow: { fontSize: 32, fontFamily: Fonts.heading },
  accelRight: { flex: 1, gap: 5 },
  accelLabel: { fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  accelSub:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },

  // ── Recurring ──
  recurringSection: { gap: 10 },
  recurringCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, overflow: 'hidden',
  },
  recurringDivider: { height: 1, backgroundColor: `${MonikeColors.inkGhost}66`, marginHorizontal: 14 },
  recurringRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  recurringAvatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  recurringAvatarText: { fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  recurringContent: { flex: 1, gap: 3 },
  recurringName:    { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600' },
  recurringWeekly:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13 },
  recurringDates: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  recurringEvery:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  dateChip: { backgroundColor: MonikeColors.bgElevated, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dateChipText: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  recurringMonthTotal: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 12, marginTop: 2 },
  recurringBadge: {
    backgroundColor: `${MonikeColors.signalAmber}18`,
    borderWidth: 1, borderColor: `${MonikeColors.signalAmber}44`,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start', marginTop: 2,
  },
  recurringBadgeText: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },
  obligationsCard: {
    backgroundColor: `${MonikeColors.signalAmber}0D`,
    borderWidth: 1, borderColor: `${MonikeColors.signalAmber}33`,
    borderRadius: CardRadius, padding: 16, gap: 5,
  },
  obligationsAmount: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  obligationsLabel:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13 },
  obligationsPct:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  budgetTipRow: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: `${MonikeColors.signalAmber}22` },
  budgetTipText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  recurringEmpty: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 20, alignItems: 'center', gap: 6,
  },
  recurringEmptyText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  recurringEmptySub:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
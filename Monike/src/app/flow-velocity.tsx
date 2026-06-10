/**
 * Flow & Velocity
 * UI language copied from forecast.tsx:
 *   - sectionCard + featureRow rows with bottom borders
 *   - tipCard (bgElevated + left colour border) for insight text
 *   - contextRow (4-stat strips with vertical dividers)
 *   - velocityCard (top stat | arrow | stat, then divider, then context row)
 *   - SectionHeader: small icon + small-caps heading
 */
import { useCallback, useEffect, useRef } from 'react';
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
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle2,
  Heart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react-native';

import { MonikeHeader } from '@/components/monike-header';
import { CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
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
  mom_change_pct: number;
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
  dow_profile: DowProfile[];
  burn_rate: BurnRate;
  income_profile: IncomeProfile;
  peak_day: PeakDay | null;
  health_score: HealthScore;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${Math.round(Math.abs(n)).toLocaleString('en-NG')}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const HEALTH_COLORS: Record<string, string> = {
  green: MonikeColors.accentPulse,
  blue:  MonikeColors.signalBlue,
  amber: MonikeColors.signalAmber,
  red:   MonikeColors.signalRed,
};

const COMPONENT_MAX: Record<string, number> = {
  'Surplus Months':     30,
  'Income Consistency': 25,
  'Burn Rate':          25,
  'Recurring Burden':   10,
  'Spend Momentum':     10,
};

const COMPONENT_COPY: Record<string, (v: number) => string> = {
  'Surplus Months':     (v) => v >= 24 ? 'Most months are surplus' : v >= 15 ? 'More surplus than deficit months' : 'Mostly deficit months',
  'Income Consistency': (v) => v >= 20 ? 'Income is predictable' : v >= 13 ? 'Some month-to-month swings' : 'Highly variable income',
  'Burn Rate':          (v) => v >= 18 ? 'On track this month' : v >= 12 ? 'Slightly over pace' : 'Over budget projection',
  'Recurring Burden':   (v) => v >= 7  ? 'Recurring spend manageable' : 'High recurring commitments',
  'Spend Momentum':     (v) => v >= 8  ? 'Spend is decelerating' : v >= 5 ? 'Spend is flat' : 'Spend is accelerating',
};

// ─── Shimmer ──────────────────────────────────────────────────────────────────

function Shimmer({ style }: { style?: object }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, [a]);
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] });
  return <Animated.View style={[{ backgroundColor: MonikeColors.inkPrimary, borderRadius: 6, opacity }, style]} />;
}

function SkeletonScreen() {
  return (
    <View style={{ gap: 18, paddingTop: 18 }}>
      {/* velocity-style card */}
      <Shimmer style={{ height: 12, width: 130, borderRadius: 4 }} />
      <Shimmer style={{ height: 100, borderRadius: CardRadius }} />
      <Shimmer style={{ height: 12, width: 110, borderRadius: 4, marginTop: 4 }} />
      <Shimmer style={{ height: 88, borderRadius: CardRadius }} />
      {/* section card */}
      {[0, 1].map((i) => (
        <View key={i}>
          <Shimmer style={{ height: 12, width: 120, borderRadius: 4, marginBottom: 10 }} />
          <View style={s.sectionCard}>
            {[0, 1, 2, 3].map((j) => (
              <View key={j} style={[s.featureRow, { borderBottomWidth: j < 3 ? 1 : 0 }]}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Shimmer style={{ height: 11, width: '50%' }} />
                  <Shimmer style={{ height: 9, width: '32%' }} />
                </View>
                <Shimmer style={{ height: 5, width: 70, borderRadius: 3 }} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Shared primitives (same visual language as forecast) ─────────────────────

function SectionHeader({
  icon, children,
}: {
  icon?: React.ReactNode;
  children: string;
}) {
  return (
    <View style={s.sectionHeaderRow}>
      {icon}
      <Text style={s.sectionHeader}>{children}</Text>
    </View>
  );
}

function TipCard({
  color, icon, text,
}: {
  color: string;
  icon?: React.ReactNode;
  text: string;
}) {
  return (
    <View style={[s.tipCard, { borderLeftColor: color }]}>
      {icon ?? null}
      <Text style={s.tipText}>{text}</Text>
    </View>
  );
}

// Animated horizontal fill bar (used in featureRows)
function AnimBar({
  pct, color, index, height = 5,
}: {
  pct: number;
  color: string;
  index: number;
  height?: number;
}) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 50),
      Animated.timing(widthAnim, {
        toValue: Math.min(pct, 1),
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [index, pct, widthAnim]);
  const animWidth = widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[s.barTrack, { height }]}>
      <Animated.View style={[s.barFill, { width: animWidth, backgroundColor: color, height }]} />
    </View>
  );
}

// ─── 1. Health Score ──────────────────────────────────────────────────────────

function HealthSection({ health }: { health: HealthScore }) {
  const color     = HEALTH_COLORS[health.color_key];
  const fillAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: health.score / 100,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fillAnim, health.score]);

  const barWidth = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <>
      <SectionHeader icon={<Heart size={14} color={color} strokeWidth={2} />}>
        CASHFLOW HEALTH
      </SectionHeader>

      {/* Score card — velocityCard style */}
      <View style={s.velocityCard}>
        {/* Top row: big score + label badge */}
        <View style={s.healthTopRow}>
          <View>
            <Text style={s.healthStatLabel}>HEALTH SCORE</Text>
            <View style={s.healthScoreRow}>
              <Text style={[s.healthScore, { color }]}>{health.score}</Text>
              <Text style={s.healthScoreMax}>/100</Text>
            </View>
          </View>
          <View style={[s.healthBadge, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
            <Text style={[s.healthBadgeText, { color }]}>{health.label.toUpperCase()}</Text>
          </View>
        </View>

        {/* Score bar */}
        <View style={[s.barTrack, { height: 6 }]}>
          <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: color, height: 6 }]} />
        </View>

        <View style={s.divider} />

        {/* Context row: 3 key numbers */}
        <View style={s.contextRow}>
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>SURPLUS MONTHS</Text>
            <Text style={s.contextValue}>
              {health.components['Surplus Months'] != null
                ? `${Math.round(health.components['Surplus Months'] / 30 * 10)}/10`
                : '—'}
            </Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>BURN RATE</Text>
            <Text style={[s.contextValue, {
              color: (health.components['Burn Rate'] ?? 0) >= 18
                ? MonikeColors.accentPulse
                : MonikeColors.signalAmber,
            }]}>
              {(health.components['Burn Rate'] ?? 0) >= 18 ? 'ON TRACK' : 'OVER PACE'}
            </Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>MOMENTUM</Text>
            <Text style={[s.contextValue, {
              color: (health.components['Spend Momentum'] ?? 0) >= 8
                ? MonikeColors.accentPulse
                : MonikeColors.signalAmber,
            }]}>
              {(health.components['Spend Momentum'] ?? 0) >= 8 ? 'GOOD' : 'WATCH'}
            </Text>
          </View>
        </View>
      </View>

      {/* Insight tip */}
      <TipCard
        color={color}
        icon={<CheckCircle2 size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={health.insight}
      />

      {/* Component breakdown rows */}
      <View style={s.sectionCard}>
        {Object.entries(health.components).map(([key, val], i, arr) => {
          const max    = COMPONENT_MAX[key] ?? 10;
          const pct    = val / max;
          const dotColor = pct >= 0.7 ? MonikeColors.accentPulse
                         : pct >= 0.4 ? MonikeColors.signalAmber
                         : MonikeColors.signalRed;
          const copyFn = COMPONENT_COPY[key];
          const copy   = copyFn ? copyFn(val) : key;
          return (
            <View key={key} style={[s.featureRow, i < arr.length - 1 && s.featureRowBorder]}>
              <View style={s.featureCopy}>
                <Text style={s.featureLabel}>{copy}</Text>
                <Text style={s.featureValue}>{key}</Text>
              </View>
              <View style={s.importanceWrap}>
                <View style={[s.statusDot, { backgroundColor: dotColor }]} />
                <AnimBar pct={pct} color={dotColor} index={i} height={4} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ─── 2. This Month ────────────────────────────────────────────────────────────

function ThisMonthSection({ burn }: { burn: BurnRate }) {
  const fillAnim    = useRef(new Animated.Value(0)).current;
  const surplusColor = burn.on_track ? MonikeColors.accentPulse : MonikeColors.signalRed;
  const barColor    = burn.pct_income_burned > 85 ? MonikeColors.signalRed
                    : burn.pct_income_burned > 65 ? MonikeColors.signalAmber
                    : MonikeColors.accentPulse;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: Math.min(burn.pct_income_burned / 100, 1),
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fillAnim, burn.pct_income_burned]);

  const barWidth = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const TrendIcon = burn.on_track ? TrendingDown : TrendingUp;
  const trendColor = burn.on_track ? MonikeColors.accentPulse : MonikeColors.signalRed;

  const tipText = burn.monthly_income === 0
    ? 'No income recorded this month yet — add a credit to enable projections.'
    : burn.on_track
      ? `At ${fmt(burn.daily_burn)}/day you're projected to save ${fmt(burn.projected_surplus)} by end of month.`
      : `At ${fmt(burn.daily_burn)}/day you're heading for a ${fmt(Math.abs(burn.projected_surplus))} shortfall.`;

  return (
    <>
      <SectionHeader icon={<Calendar size={14} color={MonikeColors.signalBlue} strokeWidth={2} />}>
        THIS MONTH
      </SectionHeader>

      <View style={s.velocityCard}>
        {/* Top row: daily burn | arrow | projected outcome */}
        <View style={s.velocityTopRow}>
          <View style={s.velocityStat}>
            <Text style={s.velocityStatLabel}>DAILY BURN RATE</Text>
            <Text style={[s.velocityStatValue, { color: trendColor }]}>{fmt(burn.daily_burn)}/day</Text>
          </View>
          <View style={s.velocityArrowWrap}>
            <TrendIcon size={18} color={trendColor} strokeWidth={2.5} />
            <Text style={[s.velocityPct, { color: trendColor }]}>
              {burn.pct_income_burned.toFixed(0)}%
            </Text>
          </View>
          <View style={[s.velocityStat, { alignItems: 'flex-end' }]}>
            <Text style={s.velocityStatLabel}>{burn.on_track ? 'PROJECTED SAVE' : 'PROJECTED OVER'}</Text>
            <Text style={[s.velocityStatValue, { color: surplusColor }]}>
              {fmt(Math.abs(burn.projected_surplus))}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[s.barTrack, { height: 7 }]}>
          <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: barColor, height: 7 }]} />
        </View>

        <View style={s.divider} />

        {/* 4-stat context row */}
        <View style={s.contextRow}>
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>INCOME IN</Text>
            <Text style={s.contextValue}>{fmt(burn.monthly_income)}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>PROJECTED</Text>
            <Text style={s.contextValue}>{fmt(burn.projected_month_spend)}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>DAY</Text>
            <Text style={s.contextValue}>{burn.days_elapsed} of {burn.days_elapsed + burn.days_remaining_in_month}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>STATUS</Text>
            <Text style={[s.contextValue, { color: surplusColor }]}>
              {burn.on_track ? 'ON TRACK' : 'OVER'}
            </Text>
          </View>
        </View>
      </View>

      <TipCard
        color={surplusColor}
        icon={<Zap size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={tipText}
      />
    </>
  );
}

// ─── 3. Spend Momentum ────────────────────────────────────────────────────────

function MomentumSection({
  momentum, cur7, cur14,
}: {
  momentum: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
  cur7: number;
  cur14: number;
}) {
  const config = {
    ACCELERATING: {
      color: MonikeColors.signalRed,
      badge: 'ACCELERATING',
      tip: `Your week avg (${fmt(cur7)}/day) is above your 14-day baseline (${fmt(cur14)}/day). Spend is climbing — watch it.`,
      Icon: TrendingUp,
      pct: cur14 > 0 ? Math.abs((cur7 - cur14) / cur14) : 0,
    },
    STABLE: {
      color: MonikeColors.signalAmber,
      badge: 'STABLE',
      tip: `Your week avg (${fmt(cur7)}/day) is flat against your baseline (${fmt(cur14)}/day). No major change.`,
      Icon: Activity,
      pct: 0,
    },
    DECELERATING: {
      color: MonikeColors.accentPulse,
      badge: 'DECELERATING',
      tip: `Your week avg (${fmt(cur7)}/day) is below your 14-day baseline (${fmt(cur14)}/day). Spend is easing — good sign.`,
      Icon: TrendingDown,
      pct: cur14 > 0 ? Math.abs((cur7 - cur14) / cur14) : 0,
    },
  }[momentum];

  const { Icon } = config;

  return (
    <>
      <SectionHeader icon={<Activity size={14} color={config.color} strokeWidth={2} />}>
        SPEND MOMENTUM
      </SectionHeader>

      <View style={s.velocityCard}>
        <View style={s.velocityTopRow}>
          <View style={s.velocityStat}>
            <Text style={s.velocityStatLabel}>7-DAY AVG</Text>
            <Text style={[s.velocityStatValue, { color: config.color }]}>{fmt(cur7)}<Text style={s.velocityUnit}>/day</Text></Text>
          </View>
          <View style={s.velocityArrowWrap}>
            <Icon size={20} color={config.color} strokeWidth={2.5} />
            {config.pct > 0 && (
              <Text style={[s.velocityPct, { color: config.color }]}>
                {(config.pct * 100).toFixed(0)}%
              </Text>
            )}
          </View>
          <View style={[s.velocityStat, { alignItems: 'flex-end' }]}>
            <Text style={s.velocityStatLabel}>14-DAY BASELINE</Text>
            <Text style={s.velocityStatValue}>{fmt(cur14)}<Text style={s.velocityUnit}>/day</Text></Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.contextRow}>
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>DIRECTION</Text>
            <Text style={[s.contextValue, { color: config.color }]}>{config.badge}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={[s.contextStat, { flex: 2 }]}>
            <Text style={s.contextLabel}>DIFFERENCE</Text>
            <Text style={[s.contextValue, { color: config.color }]}>
              {cur7 >= cur14 ? '+' : '−'}{fmt(Math.abs(cur7 - cur14))} vs baseline
            </Text>
          </View>
        </View>
      </View>

      <TipCard
        color={config.color}
        icon={<Icon size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={config.tip}
      />
    </>
  );
}

// ─── 4. Monthly History ───────────────────────────────────────────────────────

function HistorySection({ months, stats }: { months: MonthFlow[]; stats: FlowStats }) {
  if (!months.length) return null;

  const surplusCount = months.filter((m) => m.net >= 0).length;
  const maxAbs       = Math.max(...months.map((m) => Math.abs(m.net)), 1);
  const netColor     = stats.avg_net >= 0 ? MonikeColors.accentPulse : MonikeColors.signalRed;

  return (
    <>
      <SectionHeader icon={<BarChart2 size={14} color={MonikeColors.signalBlue} strokeWidth={2} />}>
        MONTHLY TRACK RECORD
      </SectionHeader>

      {/* Summary tip */}
      <TipCard
        color={netColor}
        icon={<CheckCircle2 size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={
          `Surplus in ${surplusCount} of ${months.length} months. ` +
          `Avg monthly net: ${stats.avg_net >= 0 ? '+' : '−'}${fmt(Math.abs(stats.avg_net))} ` +
          `(in ${fmt(stats.avg_monthly_in)} · out ${fmt(stats.avg_monthly_out)}).`
        }
      />

      {/* Rows — one per month */}
      <View style={s.sectionCard}>
        {months.map((m, i) => {
          const isPos   = m.net >= 0;
          const color   = isPos ? MonikeColors.accentPulse : MonikeColors.signalRed;
          const pct     = Math.abs(m.net) / maxAbs;
          const showMom = i > 0 && m.mom_change_pct !== 0;
          const momGood = m.mom_change_pct < 0;
          const momColor = momGood ? MonikeColors.accentPulse : MonikeColors.signalAmber;
          return (
            <View key={`${m.year}-${m.month}`} style={[s.featureRow, i < months.length - 1 && s.featureRowBorder]}>
              <View style={s.featureCopy}>
                <Text style={s.featureLabel}>{m.month_label}</Text>
                <Text style={[s.featureValue, { color }]}>
                  {isPos ? '+' : '−'}{fmt(Math.abs(m.net))}
                </Text>
              </View>
              <View style={s.importanceWrap}>
                {showMom && (
                  <Text style={[s.momChange, { color: momColor }]}>
                    {momGood ? '↓' : '↑'}{Math.abs(m.mom_change_pct).toFixed(0)}%
                  </Text>
                )}
                <AnimBar pct={pct} color={color + 'BB'} index={i} height={5} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ─── 5. When You Spend ────────────────────────────────────────────────────────

function PeakDaySection({
  profile, peak,
}: {
  profile: DowProfile[];
  peak: PeakDay | null;
}) {
  if (!profile.length) return null;

  const peakDay  = profile.find((d) => d.is_peak);
  const lightDay = [...profile].sort((a, b) => a.avg_debit - b.avg_debit)[0];
  const maxAvg   = Math.max(...profile.map((d) => d.avg_debit), 1);

  const tipText = peakDay && lightDay && peakDay.label !== lightDay.label
    ? `${peakDay.label}s are your biggest spend day (avg ${fmt(peakDay.avg_debit)}). ${lightDay.label}s are your lightest (avg ${fmt(lightDay.avg_debit)}).`
    : peakDay
      ? `${peakDay.label}s are your biggest spend day on average — plan ahead.`
      : 'Historical average spend by day of week.';

  return (
    <>
      <SectionHeader icon={<Activity size={14} color={MonikeColors.signalAmber} strokeWidth={2} />}>
        WHEN YOU SPEND
      </SectionHeader>

      <TipCard
        color={MonikeColors.signalAmber}
        icon={<AlertTriangle size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={tipText}
      />

      <View style={s.sectionCard}>
        {profile.map((item, i) => {
          const color = item.is_peak ? MonikeColors.signalAmber
                      : item.avg_debit / maxAvg > 0.7 ? MonikeColors.accentOrange
                      : MonikeColors.accentPulse;
          const pct = item.avg_debit / maxAvg;
          return (
            <View key={item.dow} style={[s.featureRow, i < profile.length - 1 && s.featureRowBorder]}>
              <View style={s.featureCopy}>
                <Text style={[s.featureLabel, item.is_peak && { color: MonikeColors.signalAmber }]}>
                  {item.label}{item.is_peak ? '  ▲' : ''}
                </Text>
                <Text style={[s.featureValue, { color }]}>{fmt(item.avg_debit)}</Text>
              </View>
              <View style={s.importanceWrap}>
                <Text style={[s.importancePct, { color }]}>{(pct * 100).toFixed(0)}%</Text>
                <AnimBar pct={pct} color={color} index={i} height={5} />
              </View>
            </View>
          );
        })}
      </View>

      {peak && (
        <View style={[s.tipCard, { borderLeftColor: MonikeColors.signalRed }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.tipText, { color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 3 }]}>
              ALL-TIME RECORD DAY
            </Text>
            <Text style={s.tipText}>{peak.formatted_date} — {fmt(peak.amount)} spent</Text>
          </View>
        </View>
      )}
    </>
  );
}

// ─── 6. Income Stability ─────────────────────────────────────────────────────

function IncomeSection({ income }: { income: IncomeProfile }) {
  if (!income.monthly_credits.length) return null;

  const cvColor = income.consistency_label === 'Very Consistent' ? MonikeColors.accentPulse
                : income.consistency_label === 'Moderate'        ? MonikeColors.signalAmber
                : MonikeColors.signalRed;

  const tip = income.cv < 15
    ? `Avg ${fmt(income.avg)}/month (±${fmt(income.std_dev)}). Your income is highly predictable — good for budgeting.`
    : income.cv < 30
    ? `Avg ${fmt(income.avg)}/month (±${fmt(income.std_dev)}). Some variation — keep a 1-month buffer.`
    : `Avg ${fmt(income.avg)}/month (±${fmt(income.std_dev)}). High variability — aim for a 2–3 month reserve.`;

  return (
    <>
      <SectionHeader icon={<Users size={14} color={cvColor} strokeWidth={2} />}>
        INCOME STABILITY
      </SectionHeader>

      <View style={s.velocityCard}>
        <View style={s.contextRow}>
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>AVG / MONTH</Text>
            <Text style={s.contextValue}>{fmt(income.avg)}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>STD DEVIATION</Text>
            <Text style={s.contextValue}>±{fmt(income.std_dev)}</Text>
          </View>
          <View style={s.contextDividerV} />
          <View style={s.contextStat}>
            <Text style={s.contextLabel}>CONSISTENCY</Text>
            <Text style={[s.contextValue, { color: cvColor }]}>{income.consistency_label.toUpperCase().split(' ')[0]}</Text>
          </View>
        </View>
      </View>

      <TipCard
        color={cvColor}
        icon={<CheckCircle2 size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
        text={tip}
      />
    </>
  );
}

// ─── 7. Recurring Commitments ────────────────────────────────────────────────

function RecurringSection({
  items, totalWeekly, totalMonthlySpend,
}: {
  items: RecurringTransfer[];
  totalWeekly: number;
  totalMonthlySpend: number;
}) {
  const pct     = totalMonthlySpend > 0 ? ((totalWeekly * 4.33) / totalMonthlySpend) * 100 : 0;
  const hasItems = items.length > 0;
  const tipColor = pct > 40 ? MonikeColors.signalAmber : MonikeColors.accentPulse;

  return (
    <>
      <SectionHeader icon={<RefreshCw size={14} color={MonikeColors.signalAmber} strokeWidth={2} />}>
        RECURRING COMMITMENTS
      </SectionHeader>

      {!hasItems ? (
        <TipCard
          color={MonikeColors.inkMuted}
          text="No recurring patterns detected yet. Patterns appear after 3+ consecutive weeks of similar transfers."
        />
      ) : (
        <>
          <TipCard
            color={tipColor}
            icon={<Zap size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
            text={
              `${fmt(totalWeekly * 4.33)}/month across ${items.length} regular recipient${items.length !== 1 ? 's' : ''} ` +
              `(${pct.toFixed(0)}% of your monthly spend).`
            }
          />

          <View style={s.sectionCard}>
            {items.map((item, i) => {
              const colors = [MonikeColors.accentPulse, MonikeColors.signalBlue, MonikeColors.signalAmber, MonikeColors.accentOrange];
              const color  = colors[item.recipient.charCodeAt(0) % colors.length];
              return (
                <View key={item.recipient} style={[s.recurRow, i < items.length - 1 && s.featureRowBorder]}>
                  <View style={[s.recurAvatar, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
                    <Text style={[s.recurAvatarText, { color }]}>{initials(item.recipient)}</Text>
                  </View>
                  <View style={s.recurContent}>
                    <Text style={s.featureLabel} numberOfLines={1}>{item.recipient}</Text>
                    <View style={s.recurMeta}>
                      <Text style={s.featureValue}>{fmt(item.avg_weekly_amount)}/wk</Text>
                      <Text style={s.recurDot}>·</Text>
                      <Text style={s.featureValue}>Every {DOW[item.typical_dow]}</Text>
                      <Text style={s.recurDot}>·</Text>
                      {item.last_three_dates.map((d, di) => (
                        <View key={`${d}-${di}`} style={s.dateChip}>
                          <Text style={s.dateChipText}>{fmtDate(d)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[s.recurAmount, { color }]}>{fmt(item.total_this_month)}</Text>
                    <Text style={s.recurAmountLabel}>this month</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FlowVelocityScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, mutate } = useSWR<FlowResponse>(
    '/flow',
    useCallback((k: string) => apiFetch<FlowResponse>(k), []),
  );

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <MonikeHeader title="Flow & Velocity" back />

        {isLoading ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.content}
          >
            <SkeletonScreen />
          </ScrollView>
        ) : error ? (
          <View style={s.errorWrap}>
            <AlertTriangle size={28} color={MonikeColors.signalRed} strokeWidth={1.5} />
            <Text style={s.errorTitle}>Couldn't load flow data</Text>
            <Pressable style={s.retryBtn} onPress={mutate}>
              <RefreshCw size={13} color={MonikeColors.inkPrimary} strokeWidth={2} />
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          >
            <HealthSection    health={data.health_score} />
            <ThisMonthSection burn={data.burn_rate} />
            <MomentumSection  momentum={data.momentum} cur7={data.current_7d_avg} cur14={data.current_14d_avg} />
            <HistorySection   months={data.months} stats={data.stats} />
            <PeakDaySection   profile={data.dow_profile} peak={data.peak_day} />
            <IncomeSection    income={data.income_profile} />
            <RecurringSection items={data.recurring} totalWeekly={data.total_recurring_weekly} totalMonthlySpend={data.total_monthly_spend} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles — exact forecast.tsx visual language ──────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content:  { paddingHorizontal: ScreenPadding, paddingTop: 18, gap: 18 },

  errorWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' },
  retryBtn:   { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: '#21282F' },
  retryText:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },

  // Section header — copied from forecast SectionHeader
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionHeader:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Tip card — copied from forecast tipCard
  tipCard: {
    minHeight: 54, borderRadius: 14,
    backgroundColor: MonikeColors.bgElevated,
    borderLeftWidth: 3,
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, paddingHorizontal: 13, paddingVertical: 12,
  },
  tipText: { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600', lineHeight: 21 },

  // Velocity card — copied from forecast velocityCard
  velocityCard:      { borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 14, gap: 12 },
  velocityTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  velocityStat:      { flex: 1 },
  velocityStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  velocityStatValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  velocityUnit:      { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 12 },
  velocityArrowWrap: { alignItems: 'center', paddingHorizontal: 10, gap: 2 },
  velocityPct:       { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },

  // Divider
  divider: { height: 1, backgroundColor: MonikeColors.inkGhost },

  // Context row — copied from forecast contextRow
  contextRow:      { flexDirection: 'row', alignItems: 'center' },
  contextStat:     { flex: 1, alignItems: 'center', gap: 4 },
  contextLabel:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  contextValue:    { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  contextDividerV: { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },

  // Section card + feature rows — copied from forecast sectionCard/featureRow
  sectionCard:     { borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: '#21282F', overflow: 'hidden' },
  featureRow:      { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  featureRowBorder:{ borderBottomWidth: 1, borderBottomColor: '#20262C' },
  featureCopy:     { flex: 1, paddingRight: 12, gap: 3 },
  featureLabel:    { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  featureValue:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' },
  importanceWrap:  { width: 80, alignItems: 'flex-end', gap: 5 },
  importancePct:   { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '600' },

  // Health extras
  healthTopRow:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  healthStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  healthScoreRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  healthScore:     { fontFamily: Fonts.mono, fontSize: 44, fontWeight: '700', lineHeight: 48, letterSpacing: -2 },
  healthScoreMax:  { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 14, marginBottom: 8 },
  healthBadge:     { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' },
  healthBadgeText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  statusDot:       { width: 7, height: 7, borderRadius: 3.5 },

  // MoM change in history rows
  momChange: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },

  // Animated bar (shared)
  barTrack: { width: 70, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  barFill:  { borderRadius: 3 },

  // Recurring rows
  recurRow:        { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 11 },
  recurAvatar:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recurAvatarText: { fontFamily: Fonts.heading, fontSize: 12, fontWeight: '700' },
  recurContent:    { flex: 1, gap: 3 },
  recurMeta:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  recurDot:        { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10 },
  recurAmount:     { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  recurAmountLabel:{ color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9 },

  dateChip:     { backgroundColor: MonikeColors.bgVoid, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  dateChipText: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },

});

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Globe,
  Phone,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
  Wifi,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { useExploreMonths, useExploreSummary } from '@/hooks/use-explore';
import type { DailyCell, DayTransaction, ExploreSummaryResponse, WeekBreakdown } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Risk = 'HIGH' | 'MEDIUM' | 'LOW';
type Category =
  | 'Person-to-Person'
  | 'POS Purchase'
  | 'Data'
  | 'Airtime'
  | 'Food & Dining'
  | 'Online Payment'
  | 'Electricity'
  | 'Other';

type DaySpend = {
  date: string;
  day: string;
  total: number;
  limit: number;
  risk: Risk;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseRisk(raw: string): Risk {
  const u = raw.toUpperCase();
  if (u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  return 'LOW';
}

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function categoryIcon(category: string) {
  const map: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    'Person-to-Person': Users,
    'POS Purchase':     ShoppingBag,
    Data:               Wifi,
    Airtime:            Phone,
    'Food & Dining':    Utensils,
    'Online Payment':   Globe,
    Electricity:        Zap,
    Other:              CreditCard,
  };
  return map[category] ?? CreditCard;
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

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
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.16] });
  return <Animated.View style={[{ backgroundColor: MonikeColors.inkPrimary, borderRadius: 6, opacity }, style]} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ExploreSkeleton() {
  return (
    <View style={{ gap: 24 }}>
      {/* Hero */}
      <View style={[sk.card, { padding: 24, gap: 16 }]}>
        <Shimmer style={{ height: 11, width: 100, borderRadius: 4 }} />
        <Shimmer style={{ height: 56, width: '65%', borderRadius: 6 }} />
        <View style={{ flexDirection: 'row', gap: 0, marginTop: 8 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Shimmer style={{ height: 18, width: '70%' }} />
            <Shimmer style={{ height: 11, width: '50%' }} />
          </View>
          <View style={{ width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 16 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Shimmer style={{ height: 18, width: '70%' }} />
            <Shimmer style={{ height: 11, width: '50%' }} />
          </View>
        </View>
      </View>
      {/* Budget */}
      <View style={[sk.card, { padding: 20, gap: 16 }]}>
        <Shimmer style={{ height: 11, width: 80 }} />
        <Shimmer style={{ height: 10, borderRadius: 5 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Shimmer style={{ height: 10, width: '30%' }} />
          <Shimmer style={{ height: 10, width: '35%' }} />
        </View>
      </View>
      {/* Weekly */}
      <View style={{ gap: 12 }}>
        <Shimmer style={{ height: 11, width: 140, borderRadius: 4 }} />
        <View style={sk.card}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={sk.weekRow}>
              <View style={{ width: 56, gap: 6 }}>
                <Shimmer style={{ height: 12, width: 36 }} />
                <Shimmer style={{ height: 10, width: 50 }} />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Shimmer style={{ height: 24, borderRadius: 12, width: `${35 + i * 14}%` }} />
              </View>
              <View style={{ width: 80, alignItems: 'flex-end', gap: 6 }}>
                <Shimmer style={{ height: 14, width: 64 }} />
                <Shimmer style={{ height: 10, width: 36 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Stats 2-col */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[0, 1].map((i) => (
          <View key={i} style={[sk.card, { flex: 1, padding: 16, gap: 10 }]}>
            <Shimmer style={{ height: 10, width: '55%' }} />
            <Shimmer style={{ height: 22, width: '80%' }} />
            <Shimmer style={{ height: 10, width: '45%' }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[0, 1].map((i) => (
          <View key={i} style={[sk.card, { flex: 1, padding: 16, gap: 10 }]}>
            <Shimmer style={{ height: 10, width: '55%' }} />
            <Shimmer style={{ height: 22, width: '80%' }} />
            <Shimmer style={{ height: 10, width: '45%' }} />
          </View>
        ))}
      </View>
      {/* Heatmap */}
      <View style={{ gap: 12 }}>
        <Shimmer style={{ height: 11, width: 180 }} />
        <View style={[sk.card, { padding: 16 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Shimmer key={i} style={{ width: 36, height: 36, borderRadius: 8 }} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
  },
  weekRow: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
});

// ─── Error State ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
      <Text style={{ color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' }}>
        Couldn't load summary
      </Text>
      <Text style={{ color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14 }}>
        Check your connection and try again.
      </Text>
      <Pressable
        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost }}
        onPress={onRetry}
      >
        <RefreshCw size={14} color={MonikeColors.inkPrimary} strokeWidth={2} />
        <Text style={{ color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ─── PressScale ───────────────────────────────────────────────────────────────

function PressScale({ children, disabled, style, onPress }: { children: ReactNode; disabled?: boolean; style?: ViewStyle; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => { if (disabled) return; Animated.timing(scale, { toValue: 0.95, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); };
  const pressOut = () => { if (disabled) return; Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start(); };
  return (
    <Pressable disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { opacity: disabled ? 0.4 : 1, transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(lift, { toValue: visible ? 0 : 8,   duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [fade, lift, visible]);
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: fade, transform: [{ translateY: lift }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────
// Consistent micro-label used everywhere: REAL SPENDING, WEEKLY BREAKDOWN, etc.

function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

// ─── MonthSelector ────────────────────────────────────────────────────────────

function MonthSelector({ canGoForward, canGoBack, label, onAttemptFuture, onNext, onPrevious }: {
  canGoForward: boolean; canGoBack: boolean; label: string;
  onAttemptFuture: () => void; onNext: () => void; onPrevious: () => void;
}) {
  return (
    <View style={styles.monthSelector}>
      <PressScale style={styles.monthChevron} disabled={!canGoBack} onPress={onPrevious}>
        <ChevronLeft size={22} color={canGoBack ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={2} />
      </PressScale>
      <Text style={styles.monthLabel}>{label}</Text>
      <PressScale style={styles.monthChevron} onPress={canGoForward ? onNext : onAttemptFuture}>
        <ChevronRight size={22} color={canGoForward ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={2} />
      </PressScale>
    </View>
  );
}

// ─── CountUpAmount ────────────────────────────────────────────────────────────

function CountUpAmount({ value }: { value: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    progress.setValue(0);
    const listener = progress.addListener(({ value: v }) => setDisplayValue(value * v));
    Animated.timing(progress, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => progress.removeListener(listener);
  }, [progress, value]);
  return (
    <Text style={styles.heroAmount}>
      <Text style={styles.heroCurrency}>₦</Text>
      {formatNaira(displayValue, 2)}
    </Text>
  );
}

// ─── HeroSpendBlock ───────────────────────────────────────────────────────────

function HeroSpendBlock({ summary }: { summary: ExploreSummaryResponse }) {
  const today = new Date();
  const isCurrentMonth = summary.year === today.getFullYear() && summary.month === today.getMonth() + 1;
  const change = summary.previous_spend > 0
    ? ((summary.real_spend - summary.previous_spend) / summary.previous_spend) * 100
    : 0;
  const daysElapsed = isCurrentMonth ? today.getDate() : new Date(summary.year, summary.month, 0).getDate();
  const paceDelta = summary.spend_to_date - summary.daily_pace_reference * daysElapsed;
  const isUnderPace = paceDelta < 0;
  const prevMonthDate = new Date(summary.year, summary.month - 2, 1);
  const prevLabel = prevMonthDate.toLocaleString('en', { month: 'short' }).toUpperCase();

  return (
    <View style={styles.heroCard}>
      <Label>REAL SPENDING</Label>
      <CountUpAmount value={summary.real_spend} />

      {/* Divider */}
      <View style={styles.heroDivider} />

      {/* Two metrics side by side */}
      <View style={styles.heroMetricRow}>
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </Text>
          <Text style={styles.heroMetricLabel}>vs {prevLabel} {summary.previous_spend > 0 ? summary.year : ''}</Text>
        </View>
        <View style={styles.heroMetricSplit} />
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: isUnderPace ? MonikeColors.accentPulse : MonikeColors.signalRed }]}>
            ₦{formatNaira(Math.abs(paceDelta))}
          </Text>
          <Text style={styles.heroMetricLabel}>{isUnderPace ? 'under daily pace' : 'over daily pace'}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── BudgetProgress ───────────────────────────────────────────────────────────

function BudgetProgress({ summary }: { summary: ExploreSummaryResponse }) {
  const today = new Date();
  const isCurrentMonth = summary.year === today.getFullYear() && summary.month === today.getMonth() + 1;
  const daysInMonth = new Date(summary.year, summary.month, 0).getDate();
  const daysRemaining = isCurrentMonth ? Math.max(daysInMonth - today.getDate(), 0) : 0;
  const ratio = summary.budget > 0 ? Math.min(summary.real_spend / summary.budget, 1.08) : 0;
  const fillPercent = Math.min(ratio * 100, 100);
  const fillColor = ratio >= 0.9 ? MonikeColors.signalRed : ratio >= 0.7 ? MonikeColors.signalAmber : MonikeColors.accentPulse;
  const dailyToStay = daysRemaining > 0
    ? Math.max((summary.budget - summary.real_spend) / daysRemaining, 0)
    : 0;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.budgetHeaderRow}>
        <Label>BUDGET</Label>
        <Text style={[styles.budgetPct, { color: fillColor }]}>{Math.round(fillPercent)}%</Text>
      </View>

      {/* Amount labels */}
      <View style={styles.budgetAmountRow}>
        <Text style={styles.budgetSpent}>₦{formatNaira(summary.real_spend)}</Text>
        <Text style={styles.budgetTotal}>of ₦{formatNaira(summary.budget)}</Text>
      </View>

      {/* Track */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: `${fillPercent}%` as any, backgroundColor: fillColor }]} />
      </View>

      {/* Footer */}
      <View style={styles.budgetFootRow}>
        <Text style={styles.budgetFootMuted}>
          {daysRemaining > 0 ? `${daysRemaining} days left` : 'Month complete'}
        </Text>
        {dailyToStay > 0 && (
          <Text style={[styles.budgetFootAccent, { color: fillColor }]}>
            ₦{formatNaira(dailyToStay)}/day
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── SpendBar ─────────────────────────────────────────────────────────────────

function SpendBar({ color, delay, percent }: { color: string; delay: number; percent: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    width.setValue(0);
    Animated.timing(width, { toValue: percent, delay, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [delay, percent, width]);
  return (
    <View style={styles.weekBarTrack}>
      <Animated.View style={[
        styles.weekBarFill,
        { backgroundColor: color, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
      ]} />
    </View>
  );
}

// ─── WeeklyBreakdown ──────────────────────────────────────────────────────────

function WeeklyBreakdown({ weekly }: { weekly: WeekBreakdown[] }) {
  const maxSpend = Math.max(...weekly.map((w) => w.spend), 1);
  const avgSpend = weekly.reduce((s, w) => s + w.spend, 0) / Math.max(weekly.length, 1);
  return (
    <View style={styles.sectionGap}>
      <Label>WEEKLY BREAKDOWN</Label>
      <View style={styles.card}>
        {weekly.map((week, index) => {
          const aboveAvg = avgSpend > 0 ? (week.spend - avgSpend) / avgSpend : 0;
          const color = aboveAvg >= 0.3 ? MonikeColors.signalRed : aboveAvg >= 0.1 ? MonikeColors.signalAmber : MonikeColors.accentPulse;
          const percent = (week.spend / maxSpend) * 100;
          return (
            <View key={week.week} style={[styles.weekRow, index < weekly.length - 1 && styles.weekRowBorder]}>
              {/* Left: week label + range */}
              <View style={styles.weekLeft}>
                <Text style={styles.weekCode}>W{week.week}</Text>
                <Text style={styles.weekRange}>{week.range}</Text>
              </View>
              {/* Center: bar */}
              <View style={styles.weekCenter}>
                <SpendBar color={color} delay={index * 80} percent={percent} />
              </View>
              {/* Right: amount + txns */}
              <View style={styles.weekRight}>
                <Text style={[styles.weekAmount, { color }]}>₦{formatNaira(week.spend)}</Text>
                <Text style={styles.weekTxn}>{week.txns} txns</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── KeyStatsCard — 2-column grid, each stat its own card ────────────────────

function KeyStatsCard({ summary }: { summary: ExploreSummaryResponse }) {
  const daysInMonth = new Date(summary.year, summary.month, 0).getDate();
  const dailyAvg = summary.real_spend / daysInMonth;
  const cells = summary.daily.filter((d) => d.total > 0);
  const peakDay    = cells.reduce((p, d) => (d.total > (p?.total ?? 0) ? d : p), cells[0]);
  const lowestDay  = cells.reduce((p, d) => (d.total < (p?.total ?? Infinity) ? d : p), cells[0]);
  const highDays   = cells.filter((d) => d.total > dailyAvg).map((d) => d.day).slice(0, 30);
  const netFlow    = summary.credits - summary.real_spend;

  return (
    <View style={styles.sectionGap}>
      <Label>KEY STATS</Label>
      {/* Row 1 */}
      <View style={styles.statsRow}>
        <StatCard
          label="Daily avg"
          value={`₦${formatNaira(dailyAvg)}`}
          sub="this month"
        />
        <StatCard
          label="Peak day"
          value={`₦${formatNaira(peakDay?.total ?? 0)}`}
          sub={peakDay?.date}
          valueColor={MonikeColors.signalRed}
        />
      </View>
      {/* Row 2 */}
      <View style={styles.statsRow}>
        <StatCard
          label="Lowest day"
          value={`₦${formatNaira(lowestDay?.total ?? 0)}`}
          sub={lowestDay?.date}
          valueColor={MonikeColors.accentPulse}
        />
        <StatCard
          label="High-spend days"
          value={`${highDays.length}`}
          sub={`of ${daysInMonth} days`}
          valueColor={MonikeColors.signalAmber}
          dots={highDays}
          totalDots={daysInMonth}
        />
      </View>
      {/* Row 3 */}
      <View style={styles.statsRow}>
        <StatCard
          label="Total credits"
          value={`₦${formatNaira(summary.credits)}`}
          sub="money in"
          valueColor={MonikeColors.signalBlue}
        />
        <StatCard
          label="Net flow"
          value={`${netFlow < 0 ? '−' : '+'}₦${formatNaira(netFlow)}`}
          sub="credits − spend"
          valueColor={netFlow < 0 ? MonikeColors.signalRed : MonikeColors.accentPulse}
        />
      </View>
    </View>
  );
}

function StatCard({ label, value, sub, valueColor = MonikeColors.inkPrimary, dots, totalDots }: {
  label: string; value: string; sub?: string;
  valueColor?: string; dots?: number[]; totalDots?: number;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      {dots && totalDots ? (
        <View style={styles.dotGrid}>
          {Array.from({ length: totalDots }).map((_, i) => (
            <View key={i} style={[styles.dot, dots.includes(i + 1) && { backgroundColor: MonikeColors.signalRed }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── SevenDayComparison ───────────────────────────────────────────────────────

function SevenDayComparison({ summary }: { summary: ExploreSummaryResponse }) {
  const max = Math.max(summary.previous7, summary.last7, 1);
  const change = summary.previous7 > 0 ? ((summary.last7 - summary.previous7) / summary.previous7) * 100 : 0;
  const difference = summary.last7 - summary.previous7;
  const directionColor = difference > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const BarIcon = difference > 0 ? TrendingUp : TrendingDown;

  return (
    <View style={styles.sectionGap}>
      <Label>LAST 7 DAYS</Label>
      <View style={styles.card}>
        <View style={styles.comparisonInner}>
          <CompBar color={MonikeColors.inkGhost} height={(summary.previous7 / max) * 100} label="prev 7d" value={summary.previous7} />
          <View style={styles.changePill}>
            <BarIcon size={13} color={directionColor} strokeWidth={2.5} />
            <Text style={[styles.changePillText, { color: directionColor }]}>{Math.abs(change).toFixed(1)}%</Text>
          </View>
          <CompBar color={directionColor} height={(summary.last7 / max) * 100} label="last 7d" value={summary.last7} />
        </View>
        <Text style={styles.comparisonFooter}>
          ₦{formatNaira(Math.abs(difference))} {difference > 0 ? 'more' : 'less'} than the week before
        </Text>
      </View>
    </View>
  );
}

function CompBar({ color, height, label, value }: { color: string; height: number; label: string; value: number }) {
  const animH = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animH, { toValue: height, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [animH, height]);
  return (
    <View style={styles.compBarWrap}>
      <Text style={styles.compValue}>₦{formatNaira(value)}</Text>
      <View style={styles.compBarSlot}>
        <Animated.View style={[styles.compBar, { backgroundColor: color, height: animH }]} />
      </View>
      <Text style={styles.compLabel}>{label}</Text>
    </View>
  );
}

// ─── DailyHeatmap ─────────────────────────────────────────────────────────────

function heatColor(total: number, threshold: number) {
  if (total === 0)               return { bg: MonikeColors.bgElevated,        text: MonikeColors.inkGhost,     dot: true  };
  if (total < threshold * 0.5)  return { bg: 'rgba(0,230,118,0.22)',          text: MonikeColors.inkPrimary,   dot: false };
  if (total <= threshold)       return { bg: 'rgba(255,179,0,0.32)',           text: MonikeColors.inkPrimary,   dot: false };
  if (total <= threshold * 2)   return { bg: 'rgba(255,61,61,0.42)',           text: MonikeColors.inkPrimary,   dot: false };
  return                               { bg: 'rgba(255,61,61,0.82)',           text: '#FFFFFF',                 dot: false };
}

function DailyHeatmap({ daily, year, month, threshold, onSelectDay }: {
  daily: DailyCell[]; year: number; month: number; threshold: number;
  onSelectDay: (day: DaySpend) => void;
}) {
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });
  const cells: (DailyCell | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...daily,
  ];

  return (
    <View style={styles.sectionGap}>
      <Label>DAILY HEATMAP — {monthLabel.toUpperCase()}</Label>
      <View style={styles.card}>
        {/* Day-of-week headers */}
        <View style={styles.heatDowRow}>
          {DOW.map((d) => <Text key={d} style={styles.heatDowLabel}>{d}</Text>)}
        </View>
        <View style={styles.heatGrid}>
          {cells.map((cell, i) => {
            if (!cell) return <View key={`blank-${i}`} style={styles.heatBlank} />;
            const { bg, text, dot } = heatColor(cell.total, threshold);
            return (
              <Pressable
                key={cell.date}
                style={[styles.heatCell, { backgroundColor: bg }, cell.is_today && styles.heatCellToday]}
                onPress={() => onSelectDay({
                  date: cell.date,
                  day: new Date(year, month - 1, cell.day).toLocaleString('en', { weekday: 'short' }),
                  total: cell.total,
                  limit: threshold,
                  risk: normaliseRisk(cell.risk),
                })}
              >
                <Text style={[styles.heatCellNum, { color: text }]}>{cell.day}</Text>
                {dot ? <View style={styles.heatDot} /> : null}
              </Pressable>
            );
          })}
        </View>
        {/* Legend */}
        <View style={styles.heatLegend}>
          {[
            { bg: 'rgba(0,230,118,0.22)',  label: 'Low' },
            { bg: 'rgba(255,179,0,0.32)',  label: 'Avg' },
            { bg: 'rgba(255,61,61,0.42)',  label: 'High' },
            { bg: 'rgba(255,61,61,0.82)',  label: 'Peak' },
          ].map(({ bg, label }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: bg }]} />
              <Text style={styles.legendLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── RiskBadge ────────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: Risk }) {
  const palette = {
    HIGH:   { color: MonikeColors.signalRed,   bg: '#FF3D3D18', border: '#FF3D3D40' },
    MEDIUM: { color: MonikeColors.signalAmber, bg: '#FFB30018', border: '#FFB30040' },
    LOW:    { color: MonikeColors.accentPulse, bg: '#00E67618', border: '#00E67640' },
  }[risk];
  return (
    <View style={[styles.riskBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.riskBadgeText, { color: palette.color }]}>{risk}</Text>
    </View>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({ transaction, showSeparator = true }: { transaction: DayTransaction; showSeparator?: boolean }) {
  const credit = transaction.amount > 0;
  const Icon = categoryIcon(transaction.category);
  return (
    <View style={[styles.txRow, !showSeparator && { borderBottomWidth: 0 }]}>
      {/* Icon */}
      <View style={styles.txIcon}>
        <Icon size={15} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
      </View>
      {/* Center */}
      <View style={styles.txCenter}>
        <Text numberOfLines={1} style={styles.txDescription}>{transaction.description}</Text>
        <Text style={styles.txMeta}>{transaction.category}{transaction.time ? ` · ${transaction.time}` : ''}</Text>
      </View>
      {/* Amount */}
      <Text style={[styles.txAmount, { color: credit ? MonikeColors.accentPulse : MonikeColors.inkPrimary }]}>
        {credit ? '+' : '−'}₦{formatNaira(Math.abs(transaction.amount))}
      </Text>
    </View>
  );
}

// ─── DayDetailSheet ───────────────────────────────────────────────────────────

function DayDetailSheet({ day, transactions, visible, onClose }: {
  day: DaySpend | null; transactions: DayTransaction[]; visible: boolean; onClose: () => void;
}) {
  const sheetY  = useRef(new Animated.Value(480)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: visible ? 0 : 480, duration: visible ? 240 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: visible ? 1 : 0,   duration: 160,                 easing: Easing.out(Easing.quad),  useNativeDriver: true }),
    ]).start();
  }, [opacity, sheetY, visible]);

  if (!day) return null;

  const dayTxns = transactions.filter((t) => t.date === day.date);
  const fallback: DayTransaction[] = day.total > 0 ? [{
    id: `synth-${day.date}`, description: 'Aggregated spend',
    category: 'Other', date: day.date, day: day.day, time: '', amount: -day.total,
  }] : [];
  const detail = dayTxns.length ? dayTxns : fallback;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: Animated.multiply(opacity, new Animated.Value(0.6)) }]} />
      </Pressable>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
        {/* Handle */}
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetDate}>{day.date}</Text>
            <Text style={styles.sheetDay}>{DAY_NAMES[day.day] ?? day.day}</Text>
          </View>
          <RiskBadge risk={day.risk} />
        </View>

        {/* Big debit number */}
        <Text style={styles.sheetAmount}>₦{formatNaira(day.total)}</Text>

        {/* Transactions */}
        <View style={styles.sheetTxCard}>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
            {detail.map((t, i) => (
              <TransactionRow key={t.id} transaction={t} showSeparator={i < detail.length - 1} />
            ))}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonthlySummaryScreen() {
  const insets = useSafeAreaInsets();

  const { data: monthsData, isLoading: monthsLoading } = useExploreMonths();
  const months = monthsData?.months ?? [];
  const [monthIndex, setMonthIndex] = useState(0);
  const selectedMonth = months[monthIndex];
  const year  = selectedMonth?.year  ?? new Date().getFullYear();
  const month = selectedMonth?.month ?? (new Date().getMonth() + 1);

  const { data: summary, isLoading: summaryLoading, error, mutate } = useExploreSummary(year, month);
  const isLoading = monthsLoading || summaryLoading;

  const canGoForward = monthIndex > 0;
  const canGoBack    = monthIndex < months.length - 1;

  const [toastVisible, setToastVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const transitionTo = useCallback((nextIndex: number, direction: 1 | -1) => {
    if (nextIndex < 0 || nextIndex >= months.length) return;
    Animated.timing(slide, { toValue: -direction * 400, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setMonthIndex(nextIndex);
      slide.setValue(direction * 400);
      Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [months.length, slide]);

  const attemptFuture = useCallback(() => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1600);
  }, []);

  const [selectedDay, setSelectedDay]   = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -48) { if (canGoForward) transitionTo(monthIndex - 1, -1); else attemptFuture(); }
      if (g.dx >  48) { if (canGoBack)    transitionTo(monthIndex + 1,  1); }
    },
  }), [attemptFuture, canGoBack, canGoForward, monthIndex, transitionTo]);

  const monthLabel = selectedMonth?.label ?? '…';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>

        {/* Sticky header */}
        <View style={styles.stickyHeader}>
          <MonikeHeader title="Explore" />
          <MonthSelector
            canGoForward={canGoForward}
            canGoBack={canGoBack}
            label={monthLabel}
            onAttemptFuture={attemptFuture}
            onNext={() => transitionTo(monthIndex - 1, -1)}
            onPrevious={() => transitionTo(monthIndex + 1, 1)}
          />
        </View>

        <ScrollView
          {...panResponder.panHandlers}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        >
          {isLoading && <ExploreSkeleton />}
          {!isLoading && error && <ErrorState onRetry={mutate} />}
          {!isLoading && !error && summary && (
            <Animated.View style={{ gap: 24, transform: [{ translateX: slide }] }}>
              <HeroSpendBlock summary={summary} />
              <BudgetProgress summary={summary} />
              <WeeklyBreakdown weekly={summary.weekly} />
              <KeyStatsCard summary={summary} />
              <SevenDayComparison summary={summary} />
              <DailyHeatmap
                daily={summary.daily}
                year={summary.year}
                month={summary.month}
                threshold={summary.daily_pace_reference}
                onSelectDay={openDay}
              />
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Toast message="No data yet for future months" visible={toastVisible} />
      <BottomNavigation activeRoute="explore" />
      <DayDetailSheet
        day={selectedDay}
        transactions={summary?.day_transactions ?? []}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// 8pt grid throughout: all spacing values are multiples of 8 (or 4 for fine control).
// Typography scale: label 11 / body 13-14 / value 16-20 / hero 44
// Visual hierarchy: label → value → sub — each level clearly distinct in size + weight

const styles = StyleSheet.create({

  // ── Root layout ─────────────────────────────────────────────────────────────
  root:         { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea:     { flex: 1 },
  stickyHeader: {
    zIndex: 5,
    backgroundColor: MonikeColors.bgVoid,
    paddingHorizontal: ScreenPadding,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
  content:      { paddingHorizontal: ScreenPadding, paddingTop: 24, gap: 0 },

  // ── Month selector ───────────────────────────────────────────────────────────
  monthSelector: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthChevron:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel:    {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // ── Toast ────────────────────────────────────────────────────────────────────
  toast: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 20,
  },
  toastText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Shared label (section micro-title) ────────────────────────────────────
  label: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // ── Shared card shell ─────────────────────────────────────────────────────
  card: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
    padding: 20,
  },

  // ── Section gap ───────────────────────────────────────────────────────────
  sectionGap: { gap: 0, marginTop: 24 },

  // ── Hero card ─────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 24,
  },
  heroAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -2,
    marginTop: 8,
    marginBottom: 20,
  },
  heroCurrency: {
    color: MonikeColors.inkSecondary,
    fontSize: 24,
    fontWeight: '400',
  },
  heroDivider: {
    height: 1,
    backgroundColor: MonikeColors.inkGhost,
    marginBottom: 20,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetricBlock: { flex: 1, gap: 4 },
  heroMetricSplit: {
    width: 1,
    height: 40,
    backgroundColor: MonikeColors.inkGhost,
    marginHorizontal: 20,
  },
  heroMetricValue: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroMetricLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },

  // ── Budget card ───────────────────────────────────────────────────────────
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  budgetPct: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  budgetAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 16,
  },
  budgetSpent: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -1,
  },
  budgetTotal: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  budgetFootRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  budgetFootMuted: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  budgetFootAccent: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Weekly ────────────────────────────────────────────────────────────────
  weekRow: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  weekRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
  weekLeft:   { width: 48 },
  weekCode:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  weekRange:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },
  weekCenter: { flex: 1, paddingHorizontal: 12 },
  weekBarTrack: {
    height: 24,
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 12,
    overflow: 'hidden',
  },
  weekBarFill: { height: 24, borderRadius: 12 },
  weekRight:  { width: 80, alignItems: 'flex-end' },
  weekAmount: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  weekTxn:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },

  // ── Stats 2-col grid ──────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 16,
    minHeight: 96,
    gap: 4,
  },
  statLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  statSub: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },
  dotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 8,
    maxWidth: 80,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: MonikeColors.bgElevated,
  },

  // ── 7-day comparison ─────────────────────────────────────────────────────
  comparisonInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 16,
    minHeight: 160,
    marginBottom: 16,
  },
  compBarWrap:    { alignItems: 'center', flex: 1 },
  compValue:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  compBarSlot:    { width: '100%', height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  compBar:        { width: '100%', maxHeight: 120, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  compLabel:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 8 },
  changePill: {
    alignSelf: 'center',
    marginBottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: MonikeColors.bgOverlay,
  },
  changePillText:  { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  comparisonFooter: {
    textAlign: 'center',
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    borderTopWidth: 1,
    borderTopColor: MonikeColors.inkGhost,
    paddingTop: 16,
  },

  // ── Heatmap ───────────────────────────────────────────────────────────────
  heatDowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heatDowLabel: {
    width: 36,
    textAlign: 'center',
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
  },
  heatGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatBlank:   { width: 36, height: 36 },
  heatCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatCellToday: {
    borderWidth: 1.5,
    borderColor: MonikeColors.inkPrimary,
  },
  heatCellNum: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  heatDot: {
    position: 'absolute',
    bottom: 5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: MonikeColors.inkGhost,
  },
  heatLegend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: MonikeColors.inkGhost,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // ── Risk badge ────────────────────────────────────────────────────────────
  riskBadge: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  riskBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Transaction row (in day sheet) ────────────────────────────────────────
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txCenter:      { flex: 1, minWidth: 0 },
  txDescription: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  txMeta: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 3,
  },
  txAmount: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.3,
    flexShrink: 0,
  },

  // ── Day sheet ─────────────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: MonikeColors.bgOverlay,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingTop: 12,
    paddingHorizontal: ScreenPadding,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonikeColors.inkGhost,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetDate:   { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetDay:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, marginTop: 2 },
  sheetAmount: {
    color: MonikeColors.signalRed,
    fontFamily: Fonts.mono,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.5,
    marginTop: 8,
    marginBottom: 20,
  },
  sheetTxCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
  },
});
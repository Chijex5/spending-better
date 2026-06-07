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

// The day-sheet still needs a small local type for what gets passed on tap
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Shimmer skeleton primitive ───────────────────────────────────────────────

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

// ─── Skeleton for full page ───────────────────────────────────────────────────

function ExploreSkeleton() {
  return (
    <View style={{ gap: 18 }}>
      {/* Hero card */}
      <View style={[sk.card, { padding: 18, gap: 12 }]}>
        <Shimmer style={{ height: 11, width: 120 }} />
        <Shimmer style={{ height: 48, width: '70%' }} />
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Shimmer style={{ height: 14, width: '60%' }} />
            <Shimmer style={{ height: 10, width: '50%' }} />
          </View>
          <View style={{ width: 1, backgroundColor: MonikeColors.inkGhost }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Shimmer style={{ height: 14, width: '60%' }} />
            <Shimmer style={{ height: 10, width: '50%' }} />
          </View>
        </View>
      </View>
      {/* Budget bar */}
      <View style={[sk.card, { padding: 16, gap: 12 }]}>
        <Shimmer style={{ height: 8, borderRadius: 4 }} />
        <Shimmer style={{ height: 10, width: '40%' }} />
      </View>
      {/* Weekly */}
      <View style={{ gap: 10 }}>
        <Shimmer style={{ height: 12, width: 160 }} />
        <View style={sk.card}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={sk.weekRow}>
              <View style={{ width: 58, gap: 5 }}>
                <Shimmer style={{ height: 11, width: 40 }} />
                <Shimmer style={{ height: 10, width: 52 }} />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Shimmer style={{ height: 22, borderRadius: 11, width: `${40 + i * 12}%` }} />
              </View>
              <View style={{ width: 78, alignItems: 'flex-end', gap: 5 }}>
                <Shimmer style={{ height: 14, width: 62 }} />
                <Shimmer style={{ height: 10, width: 36 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', ...sk.card }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[sk.statCell, { gap: 8 }]}>
            <Shimmer style={{ height: 10, width: '60%' }} />
            <Shimmer style={{ height: 18, width: '75%' }} />
            <Shimmer style={{ height: 10, width: '45%' }} />
          </View>
        ))}
      </View>
      {/* Heatmap */}
      <View style={{ gap: 10 }}>
        <Shimmer style={{ height: 12, width: 200 }} />
        <View style={[sk.card, { padding: 12 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Shimmer key={i} style={{ width: 36, height: 36, borderRadius: 6 }} />
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
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
  statCell: {
    width: '33.333%',
    minHeight: 116,
    padding: 14,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: MonikeColors.inkGhost,
  },
});

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 80, gap: 10 }}>
      <Text style={{ color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' }}>
        Couldn't load summary
      </Text>
      <Text style={{ color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 }}>
        Check your connection and try again.
      </Text>
      <Pressable
        style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: '#21282F' }}
        onPress={onRetry}
      >
        <RefreshCw size={14} color={MonikeColors.inkPrimary} strokeWidth={2} />
        <Text style={{ color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ─── PressScale ───────────────────────────────────────────────────────────────

function PressScale({ children, disabled, style, onPress }: { children: ReactNode; disabled?: boolean; style?: ViewStyle; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => { if (disabled) return; Animated.timing(scale, { toValue: 0.94, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); };
  const pressOut = () => { if (disabled) return; Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start(); };
  return (
    <Pressable disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { opacity: disabled ? 0.46 : 1, transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(lift, { toValue: visible ? 0 : 10, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [fade, lift, visible]);
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: fade, transform: [{ translateY: lift }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ─── MonthSelector ────────────────────────────────────────────────────────────

function MonthSelector({ canGoForward, canGoBack, label, onAttemptFuture, onNext, onPrevious }: {
  canGoForward: boolean;
  canGoBack: boolean;
  label: string;
  onAttemptFuture: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <View style={styles.monthSelector}>
      <PressScale style={styles.monthChevron} disabled={!canGoBack} onPress={onPrevious}>
        <ChevronLeft size={24} color={canGoBack ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={1.8} />
      </PressScale>
      <Text style={styles.monthLabel}>{label}</Text>
      <PressScale style={styles.monthChevron} onPress={canGoForward ? onNext : onAttemptFuture}>
        <ChevronRight size={24} color={canGoForward ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={1.8} />
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
    Animated.timing(progress, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => progress.removeListener(listener);
  }, [progress, value]);
  return (
    <Text style={styles.heroAmount}>
      <Text style={styles.heroCurrency}>₦</Text>{formatNaira(displayValue, 2)}
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
      <Text style={styles.heroLabel}>REAL SPENDING</Text>
      <CountUpAmount value={summary.real_spend} />
      <View style={styles.heroMetricRow}>
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </Text>
          <Text style={styles.heroMetricLabel}>vs {prevLabel} {summary.previous_spend > 0 ? summary.year : ''}</Text>
        </View>
        <View style={styles.heroMetricDivider} />
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: isUnderPace ? MonikeColors.accentPulse : MonikeColors.signalRed }]}>
            ₦{formatNaira(Math.abs(paceDelta))}
          </Text>
          <Text style={styles.heroMetricLabel}>{isUnderPace ? 'under pace' : 'over daily pace'}</Text>
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
    <View style={styles.budgetBlock}>
      <View style={styles.budgetScaleRow}>
        <Text style={styles.budgetScale}>₦0</Text>
        <Text style={styles.budgetScale}>₦{formatNaira(summary.budget)}</Text>
      </View>
      <View style={styles.progressMarkerLayer}>
        <View style={[styles.progressAmountMarker, { left: `${Math.max(0, Math.min(fillPercent - 8, 82))}%` }]}>
          <Text style={[styles.progressAmountLabel, { color: fillColor }]}>₦{formatNaira(summary.real_spend)}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fillPercent}%`, backgroundColor: fillColor }]}>
          <View style={styles.progressTick} />
        </View>
      </View>
      <View style={styles.budgetFootRow}>
        <Text style={styles.budgetFootLeft}>
          {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Month complete'}
        </Text>
        {dailyToStay > 0 && (
          <Text style={styles.budgetFootRight}>₦{formatNaira(dailyToStay)}/day to stay on track</Text>
        )}
      </View>
    </View>
  );
}

// ─── SpendBar ─────────────────────────────────────────────────────────────────

function SpendBar({ color, delay, label, percent }: { color: string; delay: number; label?: string; percent: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    width.setValue(0);
    Animated.timing(width, { toValue: percent, delay, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [delay, percent, width]);
  return (
    <View style={styles.weekBarTrack}>
      <Animated.View style={[styles.weekBarFill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}>
        {percent > 42 && label ? <Text style={styles.weekBarLabel}>₦{label}</Text> : null}
      </Animated.View>
    </View>
  );
}

// ─── WeeklyBreakdown ──────────────────────────────────────────────────────────

function WeeklyBreakdown({ weekly }: { weekly: WeekBreakdown[] }) {
  const maxSpend = Math.max(...weekly.map((w) => w.spend), 1);
  const avgSpend = weekly.reduce((s, w) => s + w.spend, 0) / Math.max(weekly.length, 1);
  return (
    <View style={styles.sectionGap}>
      <SectionTitle>WEEKLY BREAKDOWN</SectionTitle>
      <View style={styles.weeklyCard}>
        {weekly.map((week, index) => {
          const aboveAvg = avgSpend > 0 ? (week.spend - avgSpend) / avgSpend : 0;
          const color = aboveAvg >= 0.3 ? MonikeColors.signalRed : aboveAvg >= 0.1 ? MonikeColors.signalAmber : MonikeColors.accentPulse;
          const percent = (week.spend / maxSpend) * 100;
          return (
            <View key={week.week} style={[styles.weekRow, index % 2 === 1 && styles.weekRowStripe]}>
              <View style={styles.weekLeft}>
                <Text style={styles.weekCode}>WK {String(week.week).padStart(2, '0')}</Text>
                <Text style={styles.weekRange}>{week.range}</Text>
              </View>
              <View style={styles.weekCenter}>
                <SpendBar color={color} delay={index * 80} label={formatNaira(week.spend)} percent={percent} />
              </View>
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

// ─── KeyStatsCard ─────────────────────────────────────────────────────────────

function KeyStatsCard({ summary }: { summary: ExploreSummaryResponse }) {
  const daysInMonth = new Date(summary.year, summary.month, 0).getDate();
  const dailyAvg = summary.real_spend / daysInMonth;
  const cells = summary.daily.filter((d) => d.total > 0);
  const peakDay  = cells.reduce((p, d) => (d.total > (p?.total ?? 0) ? d : p), cells[0]);
  const lowestDay = cells.reduce((p, d) => (d.total < (p?.total ?? Infinity) ? d : p), cells[0]);
  const highDays = cells.filter((d) => d.total > dailyAvg).map((d) => d.day).slice(0, 30);
  const netFlow  = summary.credits - summary.real_spend;

  return (
    <View style={styles.sectionGap}>
      <View style={styles.statsCard}>
        <StatCell title="DAILY AVG"         value={`₦${formatNaira(dailyAvg)}`} />
        <StatCell title="PEAK DAY"          value={`₦${formatNaira(peakDay?.total ?? 0)}`}   color={MonikeColors.signalRed}   sub={peakDay?.date} />
        <StatCell title="HIGH-SPEND DAYS"   value={`${highDays.length} / ${daysInMonth}`}      color={MonikeColors.signalRed}   wideDots highDays={highDays} totalDays={daysInMonth} />
        <StatCell title="LOWEST DAY"        value={`₦${formatNaira(lowestDay?.total ?? 0)}`} color={MonikeColors.accentPulse} sub={lowestDay?.date} />
        <StatCell title="TOTAL CREDITS"     value={`₦${formatNaira(summary.credits)}`}        color={MonikeColors.signalBlue}  sub="money in" />
        <StatCell title="NET FLOW"          value={`${netFlow < 0 ? '−' : '+'}₦${formatNaira(netFlow)}`} color={netFlow < 0 ? MonikeColors.signalRed : MonikeColors.accentPulse} sub="in − out" />
      </View>
    </View>
  );
}

function StatCell({ color = MonikeColors.inkPrimary, highDays, totalDays = 30, sub, title, value, wideDots }: {
  color?: string; highDays?: number[]; totalDays?: number; sub?: string; title: string; value: string; wideDots?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      {wideDots ? (
        <View style={styles.highDotGrid}>
          {Array.from({ length: totalDays }).map((_, i) => (
            <View key={i} style={[styles.highDot, highDays?.includes(i + 1) && styles.highDotActive]} />
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
      <SectionTitle>HOW DID LAST WEEK LAND?</SectionTitle>
      <View style={styles.comparisonCard}>
        <View style={styles.comparisonBars}>
          <ComparisonBar color={MonikeColors.accentPulse} height={(summary.previous7 / max) * 120} label="prev 7d" value={summary.previous7} />
          <View style={[styles.changeBadge, { borderColor: directionColor }]}>
            <BarIcon size={14} color={directionColor} strokeWidth={2} />
            <Text style={[styles.changeBadgeText, { color: directionColor }]}>{Math.abs(change).toFixed(1)}%</Text>
          </View>
          <ComparisonBar color={directionColor} height={(summary.last7 / max) * 120} label="last 7d" value={summary.last7} />
        </View>
        <Text style={styles.comparisonFooter}>
          ₦{formatNaira(Math.abs(difference))} {difference > 0 ? 'more' : 'less'} than the week before
        </Text>
      </View>
    </View>
  );
}

function ComparisonBar({ color, height, label, value }: { color: string; height: number; label: string; value: number }) {
  return (
    <View style={styles.comparisonBarWrap}>
      <Text style={styles.comparisonValue}>₦{formatNaira(value)}</Text>
      <View style={styles.comparisonBarSlot}>
        <View style={[styles.comparisonBar, { backgroundColor: color, height }]} />
      </View>
      <Text style={styles.comparisonLabel}>{label}</Text>
    </View>
  );
}

// ─── DailyHeatmap ─────────────────────────────────────────────────────────────

function heatColor(total: number, threshold: number) {
  if (total === 0) return { backgroundColor: MonikeColors.bgElevated, textColor: MonikeColors.inkSecondary, showDot: true };
  if (total < threshold * 0.5)   return { backgroundColor: 'rgba(0,230,118,0.3)',  textColor: MonikeColors.inkPrimary, showDot: false };
  if (total <= threshold)        return { backgroundColor: 'rgba(255,179,0,0.4)',   textColor: MonikeColors.inkPrimary, showDot: false };
  if (total <= threshold * 2)    return { backgroundColor: 'rgba(255,61,61,0.5)',   textColor: MonikeColors.inkPrimary, showDot: false };
  return                               { backgroundColor: 'rgba(255,61,61,0.85)',   textColor: MonikeColors.bgVoid,    showDot: false };
}

function DailyHeatmap({
  daily, year, month, threshold, onSelectDay,
}: {
  daily: DailyCell[];
  year: number;
  month: number;
  threshold: number;
  onSelectDay: (day: DaySpend) => void;
}) {
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' }).toUpperCase();
  // Pad with nulls for the leading offset
  const cells: (DailyCell | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...daily,
  ];

  return (
    <View style={styles.sectionGap}>
      <SectionTitle>DAILY HEATMAP — {monthLabel}</SectionTitle>
      <View style={styles.heatmapCard}>
        <View style={styles.weekdayRow}>
          {DOW.map((d) => <Text key={d} style={styles.weekdayLabel}>{d}</Text>)}
        </View>
        <View style={styles.heatGrid}>
          {cells.map((cell, i) => {
            if (!cell) return <View key={`blank-${i}`} style={styles.heatCellBlank} />;
            const { backgroundColor, textColor, showDot } = heatColor(cell.total, threshold);
            return (
              <Pressable
                key={cell.date}
                style={[styles.heatCell, { backgroundColor }, cell.is_today && styles.todayCell]}
                onPress={() =>
                  onSelectDay({
                    date: cell.date,
                    day: new Date(year, month - 1, cell.day).toLocaleString('en', { weekday: 'short' }),
                    total: cell.total,
                    limit: threshold,
                    risk: normaliseRisk(cell.risk),
                  })
                }
              >
                <Text style={[styles.heatCellText, { color: textColor }]}>{cell.day}</Text>
                {showDot ? <View style={styles.zeroDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── RiskBadge ────────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: Risk }) {
  const palette = {
    HIGH:   { color: MonikeColors.signalRed,   backgroundColor: '#FF3D3D22', borderColor: '#FF3D3D44' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30022', borderColor: '#FFB30044' },
    LOW:    { color: MonikeColors.accentPulse, backgroundColor: '#00E67622', borderColor: '#00E67644' },
  }[risk];
  return <Text style={[styles.riskBadge, palette]}>{risk}</Text>;
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({ transaction, showSeparator = true }: { transaction: DayTransaction; showSeparator?: boolean }) {
  const credit = transaction.amount > 0;
  const Icon = categoryIcon(transaction.category);
  return (
    <View style={[styles.transactionRow, !showSeparator && styles.transactionRowLast]}>
      <View style={styles.transactionIconCircle}>
        <Icon size={16} color={credit ? MonikeColors.signalBlue : MonikeColors.inkSecondary} strokeWidth={1.8} />
      </View>
      <View style={styles.transactionCenter}>
        <Text numberOfLines={1} style={styles.transactionDescription}>{transaction.description}</Text>
        <Text style={styles.transactionDate}>{transaction.category}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, { color: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }]}>
          {credit ? '+' : '−'}₦{formatNaira(Math.abs(transaction.amount))}
        </Text>
        {transaction.time ? <Text style={styles.transactionTime}>{transaction.time}</Text> : null}
      </View>
    </View>
  );
}

// ─── DayDetailSheet ───────────────────────────────────────────────────────────

function DayDetailSheet({
  day, transactions, visible, onClose,
}: {
  day: DaySpend | null;
  transactions: DayTransaction[];
  visible: boolean;
  onClose: () => void;
}) {
  const sheetY  = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: visible ? 0 : 420, duration: visible ? 220 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: visible ? 1 : 0,   duration: 160,                 easing: Easing.out(Easing.quad),  useNativeDriver: true }),
    ]).start();
  }, [opacity, sheetY, visible]);

  if (!day) return null;

  // Filter transactions to the tapped date; fall back to a synthetic entry
  const dayTxns = transactions.filter((t) => t.date === day.date);
  const fallback: DayTransaction[] = day.total > 0 ? [{
    id: `synth-${day.date}`,
    description: 'Aggregated spend',
    category: 'Other',
    date: day.date,
    day: day.day,
    time: '',
    amount: -day.total,
  }] : [];
  const detail = dayTxns.length ? dayTxns : fallback;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropTint, { opacity }]} />
      </Pressable>
      <Animated.View style={[styles.daySheet, { transform: [{ translateY: sheetY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeaderRow}>
          <View>
            <Text style={styles.sheetTitle}>{day.date}</Text>
            <Text style={styles.sheetSubtitle}>{DAY_NAMES[day.day] ?? day.day}</Text>
          </View>
          <RiskBadge risk={day.risk} />
        </View>
        <Text style={styles.sheetDebit}>₦{formatNaira(day.total)}</Text>
        <ScrollView style={styles.sheetTransactionList}>
          {detail.map((t, i) => (
            <TransactionRow key={t.id} transaction={t} showSeparator={i < detail.length - 1} />
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonthlySummaryScreen() {
  const insets = useSafeAreaInsets();

  // ── Available months ────────────────────────────────────────────────────────
  const { data: monthsData, isLoading: monthsLoading } = useExploreMonths();
  const months = monthsData?.months ?? [];

  // Track selected month index within the available list (0 = newest)
  const [monthIndex, setMonthIndex] = useState(0);
  const selectedMonth = months[monthIndex];

  const year  = selectedMonth?.year  ?? new Date().getFullYear();
  const month = selectedMonth?.month ?? (new Date().getMonth() + 1);

  // ── Summary data ────────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading, error, mutate } = useExploreSummary(year, month);

  const isLoading = monthsLoading || summaryLoading;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const canGoForward = monthIndex > 0;                          // newer month
  const canGoBack    = monthIndex < months.length - 1;         // older month

  const [toastVisible, setToastVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const transitionTo = useCallback((nextIndex: number, direction: 1 | -1) => {
    if (nextIndex < 0 || nextIndex >= months.length) return;
    Animated.timing(slide, { toValue: -direction * 420, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setMonthIndex(nextIndex);
      slide.setValue(direction * 420);
      Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [months.length, slide]);

  const attemptFuture = useCallback(() => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1500);
  }, []);

  // ── Day sheet ───────────────────────────────────────────────────────────────
  const [selectedDay, setSelectedDay]   = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  // ── Swipe gesture ───────────────────────────────────────────────────────────
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
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 24 }]}
        >
          {isLoading && <ExploreSkeleton />}

          {!isLoading && error && <ErrorState onRetry={mutate} />}

          {!isLoading && !error && summary && (
            <Animated.View style={[styles.monthContent, { transform: [{ translateX: slide }] }]}>
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

// ─── Styles (preserved from original, additions only) ────────────────────────

const styles = StyleSheet.create({
  root:                 { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea:             { flex: 1 },
  stickyHeader:         { zIndex: 5, backgroundColor: MonikeColors.bgVoid, paddingHorizontal: ScreenPadding, paddingBottom: 8 },
  content:              { paddingHorizontal: ScreenPadding, gap: 18 },
  monthContent:         { gap: 18 },
  monthSelector:        { height: 48, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthChevron:         { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel:           { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  toast:                { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, zIndex: 20 },
  toastText:            { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  heroCard:             { backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 18 },
  heroLabel:            { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  heroAmount:           { marginTop: 8, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 42, fontWeight: '700', letterSpacing: -2 },
  heroCurrency:         { color: MonikeColors.inkSecondary, fontSize: 24 },
  heroMetricRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  heroMetricBlock:      { flex: 1, gap: 3 },
  heroMetricDivider:    { width: 1, height: 38, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 14 },
  heroMetricValue:      { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  heroMetricLabel:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  budgetBlock:          { backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  budgetScaleRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  budgetScale:          { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
  progressMarkerLayer:  { height: 16, marginTop: -8 },
  progressAmountMarker: { position: 'absolute', top: 0 },
  progressAmountLabel:  { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  progressTrack:        { height: 8, borderRadius: 4, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  progressFill:         { height: 8, borderRadius: 4, alignItems: 'flex-end' },
  progressTick:         { width: 2, height: 8, backgroundColor: MonikeColors.inkPrimary },
  budgetFootRow:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  budgetFootLeft:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  budgetFootRight:      { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 11 },
  sectionGap:           { gap: 10 },
  sectionTitle:         { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  weeklyCard:           { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden', backgroundColor: MonikeColors.bgSurface },
  weekRow:              { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  weekRowStripe:        { backgroundColor: MonikeColors.bgStripe },
  weekLeft:             { width: 58 },
  weekCode:             { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  weekRange:            { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  weekCenter:           { flex: 1, paddingHorizontal: 10 },
  weekBarTrack:         { height: 22, backgroundColor: MonikeColors.bgElevated, borderRadius: 11, overflow: 'hidden' },
  weekBarFill:          { height: 22, borderRadius: 11, justifyContent: 'center', paddingLeft: 8 },
  weekBarLabel:         { color: MonikeColors.bgVoid, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  weekRight:            { width: 78, alignItems: 'flex-end' },
  weekAmount:           { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  weekTxn:              { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  statsCard:            { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden' },
  statCell:             { width: '33.333%', minHeight: 116, padding: 14, borderRightWidth: 1, borderBottomWidth: 1, borderColor: MonikeColors.inkGhost },
  statTitle:            { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  statValue:            { marginTop: 8, fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700' },
  statSub:              { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  highDotGrid:          { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 3, width: 70 },
  highDot:              { width: 4, height: 4, borderRadius: 2, backgroundColor: MonikeColors.bgElevated },
  highDotActive:        { backgroundColor: MonikeColors.signalRed },
  comparisonCard:       { backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 18 },
  comparisonBars:       { minHeight: 178, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 20 },
  comparisonBarWrap:    { alignItems: 'center' },
  comparisonValue:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  comparisonBarSlot:    { width: 80, height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  comparisonBar:        { width: 80, maxHeight: 120, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  comparisonLabel:      { marginTop: 8, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  changeBadge:          { alignSelf: 'center', marginBottom: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: MonikeColors.bgOverlay },
  changeBadgeText:      { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  comparisonFooter:     { marginTop: 10, textAlign: 'center', color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  heatmapCard:          { backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 12 },
  weekdayRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekdayLabel:         { width: 36, textAlign: 'center', color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  heatGrid:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heatCellBlank:        { width: 36, height: 36 },
  heatCell:             { width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  todayCell:            { borderWidth: 1, borderColor: MonikeColors.inkPrimary },
  heatCellText:         { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  zeroDot:              { position: 'absolute', bottom: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkSecondary },
  riskBadge:            { overflow: 'hidden', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  transactionRow:       { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#2A30404D' },
  transactionRowLast:   { borderBottomWidth: 0 },
  transactionIconCircle:{ width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  transactionCenter:    { flex: 1, minWidth: 0 },
  transactionDescription:{ color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  transactionDate:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  transactionRight:     { alignItems: 'flex-end', minWidth: 88 },
  transactionAmount:    { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  transactionTime:      { marginTop: 5, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  sheetBackdrop:        { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:         { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  daySheet:             { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: 520, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingTop: 10, paddingBottom: 26 },
  sheetHandle:          { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center', marginBottom: 14 },
  sheetHeaderRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle:           { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetSubtitle:        { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, marginTop: 2 },
  sheetDebit:           { color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 32, fontWeight: '700', marginTop: 10, marginBottom: 12 },
  sheetTransactionList: { maxHeight: 280 },
});
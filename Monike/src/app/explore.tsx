import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
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
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
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

type DaySpend = {
  date: string;
  day: string;
  total: number;
  limit: number;
  risk: Risk;
};

type CategoryTally = { name: string; total: number; pct: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Person-to-Person': '#7B61FF',
  'POS Purchase':     '#4FC3F7',
  'Data':             '#00E676',
  'Airtime':          '#FFB300',
  'Food & Dining':    '#EF5350',
  'Online Payment':   '#FF7043',
  'Electricity':      '#FFD54F',
  'Other':            '#78909C',
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

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `₦${(value / 1_000).toFixed(0)}K`;
  return `₦${formatNaira(value)}`;
}

function categoryIcon(category: string) {
  const map: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    'Person-to-Person': Users,
    'POS Purchase':     ShoppingBag,
    'Data':             Wifi,
    'Airtime':          Phone,
    'Food & Dining':    Utensils,
    'Online Payment':   Globe,
    'Electricity':      Zap,
    'Other':            CreditCard,
  };
  return map[category] ?? CreditCard;
}

function aggregateCategories(transactions: DayTransaction[]): CategoryTally[] {
  const totals: Record<string, number> = {};
  for (const t of transactions) {
    if (t.amount < 0) totals[t.category] = (totals[t.category] ?? 0) + Math.abs(t.amount);
  }
  const grand = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total, pct: (total / grand) * 100 }))
    .sort((a, b) => b.total - a.total);
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

function Shimmer({ style }: { style?: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
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
      <View style={[sk.card, { padding: 24, gap: 16 }]}>
        <Shimmer style={{ height: 10, width: 90, borderRadius: 4 }} />
        <Shimmer style={{ height: 52, width: '60%', borderRadius: 6 }} />
        <Shimmer style={{ height: 12, borderRadius: 6 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Shimmer style={{ flex: 1, height: 36, borderRadius: 10 }} />
          <Shimmer style={{ flex: 1, height: 36, borderRadius: 10 }} />
        </View>
      </View>
      <View style={[sk.card, { padding: 20, gap: 10 }]}>
        <Shimmer style={{ height: 10, width: 140 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <Shimmer key={i} style={{ width: 38, height: 38, borderRadius: 10 }} />
          ))}
        </View>
      </View>
      <View style={[sk.card, { padding: 20, gap: 14 }]}>
        <Shimmer style={{ height: 10, width: 180 }} />
        <Shimmer style={{ height: 22, borderRadius: 6 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[55, 80, 65, 40].map((h, i) => (
            <View key={i} style={{ flex: 1, height: 120, justifyContent: 'flex-end' }}>
              <Shimmer style={{ borderRadius: 8, height: h }} />
            </View>
          ))}
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

function PressScale({ children, disabled, style, onPress }: {
  children: ReactNode; disabled?: boolean; style?: ViewStyle; onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => { if (disabled) return; Animated.timing(scale, { toValue: 0.95, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); };
  const pressOut = () => { if (disabled) return; Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start(); };
  return (
    <Pressable disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { opacity: disabled ? 0.35 : 1, transform: [{ scale }] }]}>{children}</Animated.View>
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
    <Animated.View pointerEvents="none" style={[s.toast, { opacity: fade, transform: [{ translateY: lift }] }]}>
      <Text style={s.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── CountUpAmount ────────────────────────────────────────────────────────────

function CountUpAmount({ value, style }: { value: number; style?: object }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    progress.setValue(0);
    const listener = progress.addListener(({ value: v }) => setDisplayValue(value * v));
    Animated.timing(progress, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => progress.removeListener(listener);
  }, [progress, value]);
  return (
    <Text style={[s.heroAmount, style]}>
      <Text style={s.heroCurrency}>₦</Text>
      {formatNaira(displayValue, 2)}
    </Text>
  );
}

// ─── SpendOverviewCard ───────────────────────────────────────────────────────
// Replaces HeroSpendBlock + BudgetProgress with a unified card.

function SpendOverviewCard({ summary }: { summary: ExploreSummaryResponse }) {
  const today = new Date();
  const isCurrentMonth = summary.year === today.getFullYear() && summary.month === today.getMonth() + 1;
  const daysInMonth    = new Date(summary.year, summary.month, 0).getDate();
  const daysElapsed    = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysRemaining  = isCurrentMonth ? Math.max(daysInMonth - today.getDate(), 0) : 0;

  const change    = summary.previous_spend > 0 ? ((summary.real_spend - summary.previous_spend) / summary.previous_spend) * 100 : 0;
  const paceDelta = summary.spend_to_date - summary.daily_pace_reference * daysElapsed;

  const budgetRatio   = summary.budget > 0 ? Math.min(summary.real_spend / summary.budget, 1.08) : 0;
  const fillPercent   = Math.min(budgetRatio * 100, 100);
  const fillColor     = budgetRatio >= 0.9 ? MonikeColors.signalRed : budgetRatio >= 0.7 ? MonikeColors.signalAmber : MonikeColors.accentPulse;
  const dailyLeft     = daysRemaining > 0 ? Math.max((summary.budget - summary.real_spend) / daysRemaining, 0) : 0;

  const prevMonthDate = new Date(summary.year, summary.month - 2, 1);
  const prevLabel     = prevMonthDate.toLocaleString('en', { month: 'short' });

  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    barAnim.setValue(0);
    Animated.timing(barAnim, { toValue: fillPercent, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [barAnim, fillPercent]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={s.overviewCard}>
      {/* Top: spend label + count-up */}
      <Text style={s.overviewLabel}>TOTAL SPEND</Text>
      <CountUpAmount value={summary.real_spend} />

      {/* Budget track */}
      <View style={s.overviewTrackWrap}>
        <View style={s.overviewTrack}>
          <Animated.View style={[s.overviewFill, { width: barWidth as any, backgroundColor: fillColor }]} />
        </View>
        <View style={s.overviewTrackFooter}>
          <Text style={s.overviewTrackLeft}>
            {summary.budget > 0 ? `₦${formatNaira(summary.real_spend)} of ₦${formatNaira(summary.budget)}` : 'No budget set'}
          </Text>
          <Text style={[s.overviewTrackPct, { color: fillColor }]}>{Math.round(fillPercent)}%</Text>
        </View>
      </View>

      {/* Metric pills row */}
      <View style={s.overviewPillRow}>
        {/* vs prev month */}
        <View style={[s.overviewPill, { borderColor: (change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse) + '55' }]}>
          {change > 0
            ? <ArrowUpRight size={13} color={MonikeColors.signalRed} strokeWidth={2.5} />
            : <ArrowDownLeft size={13} color={MonikeColors.accentPulse} strokeWidth={2.5} />}
          <Text style={[s.overviewPillMain, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>
            {Math.abs(change).toFixed(1)}%
          </Text>
          <Text style={s.overviewPillSub}>vs {prevLabel}</Text>
        </View>

        {/* vs daily pace */}
        <View style={[s.overviewPill, { borderColor: (paceDelta < 0 ? MonikeColors.accentPulse : MonikeColors.signalRed) + '55' }]}>
          {paceDelta < 0
            ? <TrendingDown size={13} color={MonikeColors.accentPulse} strokeWidth={2.5} />
            : <TrendingUp   size={13} color={MonikeColors.signalRed}   strokeWidth={2.5} />}
          <Text style={[s.overviewPillMain, { color: paceDelta < 0 ? MonikeColors.accentPulse : MonikeColors.signalRed }]}>
            {formatCompact(Math.abs(paceDelta))}
          </Text>
          <Text style={s.overviewPillSub}>{paceDelta < 0 ? 'under pace' : 'over pace'}</Text>
        </View>

        {/* days left or daily budget */}
        {daysRemaining > 0 && dailyLeft > 0 ? (
          <View style={[s.overviewPill, { borderColor: fillColor + '55' }]}>
            <Calendar size={13} color={fillColor} strokeWidth={2} />
            <Text style={[s.overviewPillMain, { color: fillColor }]}>{formatCompact(dailyLeft)}</Text>
            <Text style={s.overviewPillSub}>/day left</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── DailyHeatmap ─────────────────────────────────────────────────────────────

function heatColor(total: number, threshold: number) {
  if (total === 0)              return { bg: MonikeColors.bgElevated,  text: MonikeColors.inkGhost,   dot: true  };
  if (total < threshold * 0.5) return { bg: 'rgba(0,230,118,0.22)',   text: MonikeColors.inkPrimary, dot: false };
  if (total <= threshold)      return { bg: 'rgba(255,179,0,0.32)',    text: MonikeColors.inkPrimary, dot: false };
  if (total <= threshold * 2)  return { bg: 'rgba(255,61,61,0.42)',    text: MonikeColors.inkPrimary, dot: false };
  return                              { bg: 'rgba(255,61,61,0.82)',    text: '#FFFFFF',               dot: false };
}

function DailyHeatmap({ daily, year, month, threshold, onSelectDay }: {
  daily: DailyCell[]; year: number; month: number; threshold: number;
  onSelectDay: (day: DaySpend) => void;
}) {
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel     = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });
  const cells: (DailyCell | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...daily,
  ];

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>DAILY CALENDAR</Text>
        <Text style={s.sectionSub}>{monthLabel}</Text>
      </View>

      <View style={s.heatCard}>
        <View style={s.heatDowRow}>
          {DOW.map((d) => <Text key={d} style={s.heatDowLabel}>{d}</Text>)}
        </View>
        <View style={s.heatGrid}>
          {cells.map((cell, i) => {
            if (!cell) return <View key={`blank-${i}`} style={s.heatBlank} />;
            const { bg, text, dot } = heatColor(cell.total, threshold);
            return (
              <Pressable
                key={cell.date}
                style={[s.heatCell, { backgroundColor: bg }, cell.is_today && s.heatCellToday]}
                onPress={() => onSelectDay({
                  date: cell.date,
                  day: new Date(year, month - 1, cell.day).toLocaleString('en', { weekday: 'short' }),
                  total: cell.total,
                  limit: threshold,
                  risk: normaliseRisk(cell.risk),
                })}
              >
                <Text style={[s.heatCellNum, { color: text }]}>{cell.day}</Text>
                {dot ? <View style={s.heatDot} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* Legend */}
        <View style={s.heatLegend}>
          {[
            { bg: 'rgba(0,230,118,0.22)', label: 'Low' },
            { bg: 'rgba(255,179,0,0.32)', label: 'Avg' },
            { bg: 'rgba(255,61,61,0.42)', label: 'High' },
            { bg: 'rgba(255,61,61,0.82)', label: 'Peak' },
          ].map(({ bg, label }) => (
            <View key={label} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: bg }]} />
              <Text style={s.legendLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── CategoryListRow ─────────────────────────────────────────────────────────
// Proper component so hooks are called at top level, not inside .map().

function CategoryListRow({ cat, showBorder, delay }: {
  cat: CategoryTally; showBorder: boolean; delay: number;
}) {
  const color   = CATEGORY_COLORS[cat.name] ?? '#78909C';
  const Icon    = categoryIcon(cat.name);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    barAnim.setValue(0);
    Animated.timing(barAnim, { toValue: cat.pct, delay, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [barAnim, cat.pct, delay]);

  return (
    <View style={[s.catRow, showBorder && s.catRowBorder]}>
      <View style={[s.catRowIcon, { backgroundColor: color + '22' }]}>
        <Icon size={15} color={color} strokeWidth={1.9} />
      </View>
      <View style={s.catRowCenter}>
        <View style={s.catRowTop}>
          <Text style={s.catRowName}>{cat.name}</Text>
          <Text style={[s.catRowAmount, { color }]}>{formatCompact(cat.total)}</Text>
        </View>
        <View style={s.catMiniTrack}>
          <Animated.View
            style={[
              s.catMiniFill,
              {
                width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: color,
              },
            ]}
          />
        </View>
        <Text style={s.catRowPct}>{cat.pct.toFixed(0)}% of spend</Text>
      </View>
    </View>
  );
}

// ─── CategoryBreakdown ────────────────────────────────────────────────────────
// Entirely new section — not present in old explore page.

function CategoryBreakdown({ transactions }: { transactions: DayTransaction[] }) {
  const categories = useMemo(() => aggregateCategories(transactions), [transactions]);
  const top4     = categories.slice(0, 4);
  const restTotal = categories.slice(4).reduce((s, c) => s + c.total, 0);

  if (categories.length === 0) return null;

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>SPENDING BY CATEGORY</Text>
      </View>

      {/* Stacked proportion bar */}
      <View style={s.stackedBarWrap}>
        <View style={s.stackedBar}>
          {categories.map((cat) => (
            <View
              key={cat.name}
              style={[
                s.stackedSegment,
                { width: `${cat.pct}%` as `${number}%`, backgroundColor: CATEGORY_COLORS[cat.name] ?? '#78909C' },
              ]}
            />
          ))}
        </View>
        <View style={s.stackedLegend}>
          {top4.map((cat) => (
            <View key={cat.name} style={s.stackedLegendItem}>
              <View style={[s.stackedLegendDot, { backgroundColor: CATEGORY_COLORS[cat.name] ?? '#78909C' }]} />
              <Text style={s.stackedLegendText} numberOfLines={1}>{cat.name.split(' ')[0]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Top category rows */}
      <View style={s.catListCard}>
        {top4.map((cat, i) => (
          <CategoryListRow
            key={cat.name}
            cat={cat}
            showBorder={i < top4.length - 1}
            delay={i * 80}
          />
        ))}
        {restTotal > 0 && (
          <View style={s.catRowRest}>
            <Text style={s.catRowRestText}>+{categories.length - 4} more · {formatCompact(restTotal)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── WeeklyBarsChart ─────────────────────────────────────────────────────────
// Redesigned as a proper vertical bar chart (old design was a list of rows).

const CHART_HEIGHT = 120;

function WeekBar({ week, maxSpend, avgSpend, delay }: {
  week: WeekBreakdown; maxSpend: number; avgSpend: number; delay: number;
}) {
  const pct   = maxSpend > 0 ? week.spend / maxSpend : 0;
  const aboveAvg = avgSpend > 0 ? (week.spend - avgSpend) / avgSpend : 0;
  const color = aboveAvg >= 0.3 ? MonikeColors.signalRed : aboveAvg >= 0.1 ? MonikeColors.signalAmber : MonikeColors.accentPulse;

  const heightAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    heightAnim.setValue(0);
    Animated.timing(heightAnim, { toValue: pct * CHART_HEIGHT, delay, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [heightAnim, pct, delay]);

  return (
    <View style={s.weekBarCol}>
      <Text style={[s.weekBarAmount, { color }]}>{formatCompact(week.spend)}</Text>
      <View style={s.weekBarSlot}>
        <Animated.View style={[s.weekBarFill, { height: heightAnim, backgroundColor: color }]} />
      </View>
      <Text style={s.weekBarLabel}>W{week.week}</Text>
      <Text style={s.weekBarRange}>{week.range}</Text>
    </View>
  );
}

function WeeklyBarsChart({ weekly }: { weekly: WeekBreakdown[] }) {
  const maxSpend = Math.max(...weekly.map((w) => w.spend), 1);
  const avgSpend = weekly.reduce((s, w) => s + w.spend, 0) / Math.max(weekly.length, 1);

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>WEEKLY PATTERN</Text>
        <Text style={s.sectionSub}>avg {formatCompact(avgSpend)}/wk</Text>
      </View>
      <View style={s.weekChartCard}>
        {/* Avg reference line label */}
        <View style={[s.avgLine, { bottom: (avgSpend / maxSpend) * CHART_HEIGHT + 36 }]}>
          <Text style={s.avgLineText}>avg</Text>
          <View style={s.avgLineDash} />
        </View>
        {/* Bars */}
        <View style={s.weekChartRow}>
          {weekly.map((week, i) => (
            <WeekBar key={week.week} week={week} maxSpend={maxSpend} avgSpend={avgSpend} delay={i * 100} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── InsightScroll ────────────────────────────────────────────────────────────
// Replaces KeyStatsCard + SevenDayComparison with a horizontally scrollable strip.

function InsightCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color?: string; icon?: ReactNode;
}) {
  return (
    <View style={s.insightCard}>
      {icon && <View style={s.insightIcon}>{icon}</View>}
      <Text style={s.insightLabel}>{label}</Text>
      <Text style={[s.insightValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={s.insightSub}>{sub}</Text>
    </View>
  );
}

function InsightScroll({ summary }: { summary: ExploreSummaryResponse }) {
  const daysInMonth = new Date(summary.year, summary.month, 0).getDate();
  const dailyAvg    = summary.real_spend / daysInMonth;
  const cells       = summary.daily.filter((d) => d.total > 0);
  const peakDay     = cells.reduce<DailyCell | undefined>((p, d) => (!p || d.total > p.total ? d : p), undefined);
  const lowestDay   = cells.reduce<DailyCell | undefined>((p, d) => (!p || d.total < p.total ? d : p), undefined);
  const highDaysCt  = cells.filter((d) => d.total > dailyAvg).length;
  const netFlow     = summary.credits - summary.real_spend;
  const change7d    = summary.previous7 > 0 ? ((summary.last7 - summary.previous7) / summary.previous7) * 100 : 0;

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>INSIGHTS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.insightRow}>
        <InsightCard
          label="Daily avg"
          value={formatCompact(dailyAvg)}
          sub="this month"
          color={MonikeColors.inkPrimary}
        />
        <InsightCard
          label="Peak day"
          value={formatCompact(peakDay?.total ?? 0)}
          sub={peakDay?.date ?? '—'}
          color={MonikeColors.signalRed}
          icon={<TrendingUp size={14} color={MonikeColors.signalRed} strokeWidth={2} />}
        />
        <InsightCard
          label="Lowest day"
          value={formatCompact(lowestDay?.total ?? 0)}
          sub={lowestDay?.date ?? '—'}
          color={MonikeColors.accentPulse}
          icon={<TrendingDown size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
        />
        <InsightCard
          label="High-spend"
          value={`${highDaysCt}`}
          sub={`of ${daysInMonth} days`}
          color={MonikeColors.signalAmber}
        />
        <InsightCard
          label="Credits in"
          value={formatCompact(summary.credits)}
          sub="money received"
          color={MonikeColors.signalBlue}
          icon={<ArrowDownLeft size={14} color={MonikeColors.signalBlue} strokeWidth={2} />}
        />
        <InsightCard
          label="Net flow"
          value={`${netFlow < 0 ? '−' : '+'}${formatCompact(Math.abs(netFlow))}`}
          sub="credits − spend"
          color={netFlow < 0 ? MonikeColors.signalRed : MonikeColors.accentPulse}
        />
        <InsightCard
          label="Last 7 days"
          value={formatCompact(summary.last7)}
          sub={`${change7d > 0 ? '▲' : '▼'} ${Math.abs(change7d).toFixed(1)}% vs prior`}
          color={change7d > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse}
        />
      </ScrollView>
    </View>
  );
}

// ─── MonthChipBar ────────────────────────────────────────────────────────────
// Horizontal month chip scroller — replaces the prev/next chevron selector.

type MonthItem = { year: number; month: number; label: string };

function MonthChipBar({ months, selectedIndex, onSelect, onAttemptFuture }: {
  months: MonthItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAttemptFuture: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, (selectedIndex - 2) * 80), animated: true });
  }, [selectedIndex]);

  // While months are still loading, show placeholder shimmer chips so the
  // header height is locked from the very first render — prevents layout shift
  // when data arrives and the chip bar would otherwise pop in.
  if (months.length === 0) {
    return (
      <View style={s.chipBar} pointerEvents="none">
        {[80, 64, 72, 60].map((w, i) => (
          <Shimmer key={i} style={{ width: w, height: 34, borderRadius: 17 }} />
        ))}
      </View>
    );
  }

  const today = new Date();
  const nextMonth: MonthItem = {
    year:  today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
    month: (today.getMonth() + 1) % 12 + 1,
    label: today.toLocaleString('en', { month: 'short', year: '2-digit' }).replace(' ', " '"),
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chipBar}
    >
      <Pressable style={[s.chip, s.chipFuture]} onPress={onAttemptFuture}>
        <Text style={s.chipFutureText}>{nextMonth.label}</Text>
      </Pressable>

      {months.map((m, i) => {
        const selected = i === selectedIndex;
        return (
          <Pressable key={`${m.year}-${m.month}`} style={[s.chip, selected && s.chipSelected]} onPress={() => onSelect(i)}>
            <Text style={[s.chipText, selected && s.chipTextSelected]}>{m.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
    <View style={[s.riskBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[s.riskBadgeText, { color: palette.color }]}>{risk}</Text>
    </View>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({ transaction, showSeparator = true }: {
  transaction: DayTransaction; showSeparator?: boolean;
}) {
  const credit = transaction.amount > 0;
  const Icon   = categoryIcon(transaction.category);
  const color  = CATEGORY_COLORS[transaction.category] ?? MonikeColors.inkMuted;
  return (
    <View style={[s.txRow, !showSeparator && { borderBottomWidth: 0 }]}>
      <View style={[s.txIcon, { backgroundColor: color + '20' }]}>
        <Icon size={15} color={color} strokeWidth={1.8} />
      </View>
      <View style={s.txCenter}>
        <Text numberOfLines={1} style={s.txDescription}>{transaction.description}</Text>
        <Text style={s.txMeta}>{transaction.category}{transaction.time ? ` · ${transaction.time}` : ''}</Text>
      </View>
      <Text style={[s.txAmount, { color: credit ? MonikeColors.accentPulse : MonikeColors.inkPrimary }]}>
        {credit ? '+' : '−'}₦{formatNaira(Math.abs(transaction.amount))}
      </Text>
    </View>
  );
}

// ─── DayDetailSheet ───────────────────────────────────────────────────────────

function DayDetailSheet({ day, transactions, visible, onClose }: {
  day: DaySpend | null; transactions: DayTransaction[]; visible: boolean; onClose: () => void;
}) {
  const sheetY  = useRef(new Animated.Value(500)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets  = useSafeAreaInsets();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: visible ? 0 : 500, duration: visible ? 260 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: visible ? 1 : 0,   duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [opacity, sheetY, visible]);

  if (!day) return null;

  const dayTxns  = transactions.filter((t) => t.date === day.date);
  const fallback: DayTransaction[] = day.total > 0 ? [{
    id: `synth-${day.date}`, description: 'Aggregated spend',
    category: 'Other', date: day.date, day: day.day, time: '', amount: -day.total,
  }] : [];
  const detail   = dayTxns.length ? dayTxns : fallback;
  const catSpend = aggregateCategories(detail);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: Animated.multiply(opacity, new Animated.Value(0.62)) }]} />
      </Pressable>

      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY: sheetY }] }]}>
        <View style={s.sheetHandle} />

        {/* Header */}
        <View style={s.sheetHeaderRow}>
          <View>
            <Text style={s.sheetDayName}>{DAY_NAMES[day.day] ?? day.day}</Text>
            <Text style={s.sheetDate}>{day.date}</Text>
          </View>
          <RiskBadge risk={day.risk} />
        </View>

        {/* Amount + pace context */}
        <Text style={[s.sheetAmount, { color: day.risk === 'HIGH' ? MonikeColors.signalRed : MonikeColors.inkPrimary }]}>
          ₦{formatNaira(day.total)}
        </Text>
        {day.total > 0 && (
          <Text style={s.sheetPaceNote}>
            {day.total > day.limit ? `₦${formatNaira(day.total - day.limit)} over daily limit` : `₦${formatNaira(day.limit - day.total)} under daily limit`}
          </Text>
        )}

        {/* Category mini bars (if categories known) */}
        {catSpend.length > 1 && (
          <View style={s.sheetCatStrip}>
            {catSpend.slice(0, 3).map((cat) => {
              const color = CATEGORY_COLORS[cat.name] ?? '#78909C';
              return (
                <View key={cat.name} style={s.sheetCatChip}>
                  <View style={[s.sheetCatDot, { backgroundColor: color }]} />
                  <Text style={s.sheetCatChipText}>{cat.name.split(' ')[0]}</Text>
                  <Text style={[s.sheetCatChipAmt, { color }]}>{cat.pct.toFixed(0)}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Transaction list */}
        <View style={s.sheetTxCard}>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 240 }}>
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

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: monthsData, isLoading: monthsLoading } = useExploreMonths();
  const months = (monthsData?.months ?? []) as Array<{ year: number; month: number; label: string }>;
  const [monthIndex, setMonthIndex] = useState(0);
  const selectedMonth = months[monthIndex];
  const year  = selectedMonth?.year  ?? new Date().getFullYear();
  const month = selectedMonth?.month ?? (new Date().getMonth() + 1);

  const { data: summary, isLoading: summaryLoading, error, mutate } = useExploreSummary(year, month);
  const isLoading = monthsLoading || summaryLoading;

  const [toastVisible, setToastVisible]     = useState(false);
  const [selectedDay, setSelectedDay]       = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible]     = useState(false);
  const slide       = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  // Fade content in after two animation frames so the layout engine and native
  // driver have both settled before the view becomes visible — prevents the
  // one-frame misaligned flash that occurs on the very first mount.
  useEffect(() => {
    if (!isLoading && summary) {
      contentFade.setValue(0);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          Animated.timing(contentFade, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        });
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      contentFade.setValue(0);
    }
  }, [contentFade, isLoading, summary]);

  const transitionTo = useCallback((nextIndex: number, direction: 1 | -1) => {
    if (nextIndex < 0 || nextIndex >= months.length) return;
    Animated.timing(slide, { toValue: -direction * 360, duration: 100, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setMonthIndex(nextIndex);
      slide.setValue(direction * 360);
      Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [months.length, slide]);

  const attemptFuture = useCallback(() => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1600);
  }, []);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -48) { if (monthIndex > 0) transitionTo(monthIndex - 1, -1); else attemptFuture(); }
      if (g.dx >  48) { if (monthIndex < months.length - 1) transitionTo(monthIndex + 1, 1); }
    },
  }), [attemptFuture, monthIndex, months.length, transitionTo]);

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>

        <MonikeHeader title="Explore" subtitle="Monthly patterns" />
        <View style={s.monthNav}>
          <PressScale
            style={s.navArrow}
            disabled={monthIndex >= months.length - 1}
            onPress={() => transitionTo(monthIndex + 1, 1)}
          >
            <ChevronLeft size={18} color={monthIndex < months.length - 1 ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={2.2} />
          </PressScale>
          <MonthChipBar
            months={months}
            selectedIndex={monthIndex}
            onSelect={(i) => transitionTo(i, i < monthIndex ? 1 : -1)}
            onAttemptFuture={attemptFuture}
          />
          <PressScale
            style={s.navArrow}
            onPress={monthIndex > 0 ? () => transitionTo(monthIndex - 1, -1) : attemptFuture}
          >
            <ChevronRight size={18} color={MonikeColors.inkSecondary} strokeWidth={2.2} />
          </PressScale>
        </View>

        <ScrollView
          {...panResponder.panHandlers}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        >
          {isLoading && <ExploreSkeleton />}
          {!isLoading && error && <ErrorState onRetry={mutate} />}
          {!isLoading && !error && summary && (
            <Animated.View style={{
              width: '100%',
              opacity: contentFade,
              transform: [{ translateX: slide }],
            }}>
              <SpendOverviewCard summary={summary} />
              <DailyHeatmap
                daily={summary.daily}
                year={summary.year}
                month={summary.month}
                threshold={summary.daily_pace_reference}
                onSelectDay={openDay}
              />
              <CategoryBreakdown transactions={summary.day_transactions ?? []} />
              <WeeklyBarsChart weekly={summary.weekly} />
              <InsightScroll summary={summary} />
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

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },

  // ── Month navigation strip ────────────────────────────────────────────────
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: MonikeColors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: MonikeColors.inkGhost,
  },
  navArrow: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Month chip bar ────────────────────────────────────────────────────────
  chipBar: { flexDirection: 'row', gap: 8, paddingVertical: 8, paddingRight: ScreenPadding },
  chip: {
    height: 34, paddingHorizontal: 14, borderRadius: 17,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    alignItems: 'center', justifyContent: 'center',
  },
  chipSelected:  { backgroundColor: MonikeColors.accentOrange, borderColor: MonikeColors.accentOrange },
  chipText:      { color: MonikeColors.inkMuted,   fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF' },
  chipFuture:    { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: MonikeColors.inkGhost, opacity: 0.5 },
  chipFutureText:{ color: MonikeColors.inkGhost, fontFamily: Fonts.heading, fontSize: 12 },

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast: {
    position: 'absolute', top: 130, alignSelf: 'center',
    backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, zIndex: 20,
  },
  toastText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },

  // ── Scroll content ────────────────────────────────────────────────────────
  content: { paddingHorizontal: ScreenPadding, paddingTop: 20 },

  // ── Section wrapper ───────────────────────────────────────────────────────
  section: { marginTop: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: {
    color: MonikeColors.inkMuted, fontFamily: Fonts.mono,
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
  },
  sectionSub: { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 11 },

  // ── Spend Overview Card ───────────────────────────────────────────────────
  overviewCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    padding: 22,
  },
  overviewLabel: {
    color: MonikeColors.inkMuted, fontFamily: Fonts.mono,
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4,
  },
  heroAmount: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.mono,
    fontSize: 42, fontWeight: '700', letterSpacing: -2, marginBottom: 18,
  },
  heroCurrency: { color: MonikeColors.inkSecondary, fontSize: 22, fontWeight: '400' },

  overviewTrackWrap: { marginBottom: 14 },
  overviewTrack: { height: 10, borderRadius: 5, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  overviewFill:  { height: 10, borderRadius: 5 },
  overviewTrackFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  overviewTrackLeft:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  overviewTrackPct:    { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },

  overviewPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overviewPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, backgroundColor: MonikeColors.bgElevated, flex: 1, minWidth: 100,
  },
  overviewPillMain: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  overviewPillSub:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // ── Heatmap ───────────────────────────────────────────────────────────────
  heatCard: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius,
    borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16,
  },
  heatDowRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  heatDowLabel: {
    width: 38, textAlign: 'center', color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans, fontSize: 10, fontWeight: '600',
  },
  heatGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  heatBlank:    { width: 38, height: 38 },
  heatCell:     { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  heatCellToday:{ borderWidth: 1.5, borderColor: MonikeColors.inkPrimary },
  heatCellNum:  { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  heatDot:      { position: 'absolute', bottom: 4, width: 3, height: 3, borderRadius: 1.5, backgroundColor: MonikeColors.inkGhost },
  heatLegend:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: MonikeColors.inkGhost },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // ── Category Breakdown ────────────────────────────────────────────────────
  stackedBarWrap: { marginBottom: 12 },
  stackedBar:     { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', backgroundColor: MonikeColors.bgElevated, marginBottom: 8 },
  stackedSegment: { height: '100%' },
  stackedLegend:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stackedLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stackedLegendDot:  { width: 8, height: 8, borderRadius: 4 },
  stackedLegendText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  catListCard: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius,
    borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden',
  },
  catRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: MonikeColors.inkGhost },
  catRowIcon:   { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  catRowCenter: { flex: 1, gap: 5 },
  catRowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catRowName:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
  catRowAmount: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  catMiniTrack: { height: 4, borderRadius: 2, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  catMiniFill:  { height: 4, borderRadius: 2 },
  catRowPct:    { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10 },
  catRowRest:   { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: MonikeColors.inkGhost },
  catRowRestText:{ color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  // ── Weekly bar chart ──────────────────────────────────────────────────────
  weekChartCard: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    padding: 20, paddingBottom: 16, position: 'relative',
  },
  avgLine: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 1,
  },
  avgLineText: { color: MonikeColors.inkGhost, fontFamily: Fonts.mono, fontSize: 9 },
  avgLineDash: { flex: 1, height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: MonikeColors.inkGhost, opacity: 0.6 },
  weekChartRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: CHART_HEIGHT + 56 },
  weekBarCol:    { flex: 1, alignItems: 'center', gap: 0, justifyContent: 'flex-end' },
  weekBarAmount: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  weekBarSlot:   { width: '100%', height: CHART_HEIGHT, justifyContent: 'flex-end' },
  weekBarFill:   { width: '100%', borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  weekBarLabel:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', marginTop: 6 },
  weekBarRange:  { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 9, textAlign: 'center' },

  // ── Insight scroll ────────────────────────────────────────────────────────
  insightRow: { gap: 10, paddingRight: ScreenPadding, paddingBottom: 4 },
  insightCard: {
    width: 130,
    backgroundColor: MonikeColors.bgSurface, borderRadius: 16,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    padding: 14, gap: 3,
  },
  insightIcon:  { marginBottom: 4 },
  insightLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  insightValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 },
  insightSub:   { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10, marginTop: 2 },

  // ── Risk badge ────────────────────────────────────────────────────────────
  riskBadge:     { borderWidth: 1, borderRadius: 24, paddingHorizontal: 10, paddingVertical: 4 },
  riskBadgeText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  // ── Transaction row ───────────────────────────────────────────────────────
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
    borderBottomWidth: 1, borderBottomColor: MonikeColors.inkGhost,
  },
  txIcon:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txCenter:      { flex: 1, minWidth: 0 },
  txDescription: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '500', letterSpacing: -0.2 },
  txMeta:        { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  txAmount:      { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600', letterSpacing: -0.3, flexShrink: 0 },

  // ── Day detail sheet ──────────────────────────────────────────────────────
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: MonikeColors.bgOverlay,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: MonikeColors.inkGhost,
    paddingTop: 12, paddingHorizontal: ScreenPadding,
  },
  sheetHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkGhost, alignSelf: 'center', marginBottom: 20 },
  sheetHeaderRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetDayName:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 20, fontWeight: '800' },
  sheetDate:     { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginTop: 3 },
  sheetAmount:   { fontFamily: Fonts.mono, fontSize: 38, fontWeight: '700', letterSpacing: -1.5, marginTop: 10, marginBottom: 4 },
  sheetPaceNote: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginBottom: 14 },

  sheetCatStrip: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  sheetCatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost,
  },
  sheetCatDot:     { width: 7, height: 7, borderRadius: 3.5 },
  sheetCatChipText:{ color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11 },
  sheetCatChipAmt: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },

  sheetTxCard: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius,
    borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden', marginTop: 4,
  },
});

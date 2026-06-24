import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { User } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomSheet } from '@/components/bottom-sheet';
import { useAccent } from '@/contexts/accent-context';
import { useSWR } from '@/hooks/use-swr';
import {
  apiFetch,
  type DailyBar,
  type DashboardResponse,
  type PredictionResponse,
} from '@/services/api';
import { BottomTabInset, Fonts, ScreenPadding } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number, fractionDigits = 0) {
  return '₦' + new Intl.NumberFormat('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Spending-regime presentation ──────────────────────────────────────────────
// The regime gauge is the honest centerpiece: "where your spending is right now"
// from lagged momentum vs baseline, not a near-random per-day forecast.
type RegimeState = 'cool' | 'steady' | 'elevated' | 'hot';

function regimeHeadline(state: RegimeState) {
  if (state === 'hot') return 'Spending is running hot';
  if (state === 'elevated') return 'Spending is a touch elevated';
  if (state === 'cool') return "You're trending cool";
  return 'Spending is steady';
}

// accent = good (cool/steady), amber = elevated, red = hot.
function regimeColor(state: RegimeState, accent: string) {
  if (state === 'hot') return '#E5645B';
  if (state === 'elevated') return '#E0A11C';
  return accent;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysRemainingInMonth(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, daysInMonth - now.getDate());
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Matches the exact per-category dot colors from the mockup's `txnRaw` data.
const CATEGORY_DOT: Record<string, string> = {
  'Person-to-Person': '#5B7CFA',
  'POS Purchase': '#E08A3C',
  Data: '#2BB3A3',
  Airtime: '#B06FD6',
  'Food & Dining': '#E08A3C',
  'Online Payment': '#5B7CFA',
  Electricity: '#E0A11C',
  'Family Transfer': '#E5645B',
  Savings: '#2BB3A3',
  'Loan Repayment': '#5A635D',
};

// ─── Outlook Ring ─────────────────────────────────────────────────────────────

// Generic gauge ring. Used for the budget-pace dial: `fill` (0-1) drives the
// arc, `label` is the text in the center (e.g. "84%" of budget, or a dash when
// no budget is set).
function GaugeRing({ fill, label, color, trackColor, cardColor }: {
  fill: number; label: string; color: string; trackColor: string; cardColor: string;
}) {
  const size = 62;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, fill));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={ringStyles.center}>
          <View style={[ringStyles.inner, { backgroundColor: cardColor }]}>
            <Text style={[ringStyles.pct, { color }]}>{label}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inner: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pct: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '500' },
});

// ─── Week Bars ────────────────────────────────────────────────────────────────

function WeekBars({ dashboard, accent, neutralBar, ink3, dailyBudgetTarget, onDayPress }: {
  dashboard: DashboardResponse; accent: string; neutralBar: string; ink3: string;
  dailyBudgetTarget: number; onDayPress: (bar: DailyBar) => void;
}) {
  const bars = dashboard.seven_day_bars;
  const max = Math.max(...bars.map((b) => b.total_debit), dailyBudgetTarget, 1);
  const today = todayKey();
  const budgetLinePct = dailyBudgetTarget > 0 ? Math.min(1, dailyBudgetTarget / max) : 0;

  return (
    <View>
      <View style={styles.weekTracksWrap}>
        {dailyBudgetTarget > 0 ? (
          <View
            pointerEvents="none"
            style={[styles.budgetLine, { bottom: `${budgetLinePct * 100}%`, borderColor: ink3 }]}
          />
        ) : null}
        <View style={styles.weekBarsRow}>
          {bars.map((bar) => {
            const isToday = bar.date === today;
            const pct = Math.max(0.04, bar.total_debit / max);
            const color = bar.is_high_spend ? '#E5645B' : isToday ? accent : neutralBar;
            return (
              <Pressable key={bar.date} style={styles.weekBarCol} onPress={() => onDayPress(bar)}>
                <View style={styles.weekBarTrack}>
                  <View style={[styles.weekBarFill, { height: `${pct * 100}%`, backgroundColor: color }]} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.weekLabelsRow}>
        {bars.map((bar) => {
          const isToday = bar.date === today;
          return (
            <Text
              key={bar.date}
              style={[styles.weekBarLabel, styles.weekLabelCol, { color: isToday ? accent : ink3 }, isToday && { fontWeight: '700' }]}
            >
              {bar.day_label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ─── Detail row (used inside the verdict bottom sheet) ────────────────────────

function DetailRow({ label, value, ink2, ink, highlight, accent }: {
  label: string; value: string; ink2: string; ink: string; highlight?: boolean; accent?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: ink2 }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: highlight ? accent : ink }]}>{value}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonikeHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, accent, dark } = useAccent();

  const { data: dashboard, isLoading } = useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);

  const [verdictOpen, setVerdictOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DailyBar | null>(null);

  const greeting = useMemo(() => getGreeting(), []);
  const neutralBar = dark ? '#2C352F' : '#D9DBD2';

  const weekTotal = useMemo(
    () => dashboard?.seven_day_bars.reduce((sum, b) => sum + b.total_debit, 0) ?? 0,
    [dashboard],
  );

  if (!dashboard) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingWrap}>
            <Text style={[styles.loadingText, { color: colors.ink2 }]}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          </View>
        </SafeAreaView>
        <BottomNavigation activeRoute="home" />
      </View>
    );
  }

  const pctChange = dashboard.pct_change_vs_last_month;
  const isUp = pctChange >= 0;
  const pctColor = isUp ? '#E5645B' : accent;

  const budgetPace = prediction?.budget_pace;
  const budget = budgetPace?.budget ?? 0;
  const spent = dashboard.total_spent_this_month;
  const remaining = budget - spent;

  // Pace strip color: red when projected to blow the budget, otherwise track the
  // regime (cool/steady = accent, elevated = amber, hot = red).
  const regimeState = (prediction?.regime?.state ?? 'steady') as RegimeState;
  const overBudget = !!budgetPace && budget > 0 && !budgetPace.on_track;
  const paceColor = overBudget ? '#E5645B' : regimeColor(regimeState, accent);
  const verdictNarrative = (budget > 0 ? budgetPace?.narrative : prediction?.regime?.narrative)
    ?? 'Based on your recent spending pattern.';

  const dailyBudgetTarget = budget > 0 ? budget / daysInCurrentMonth() : 0;
  const recoveryTarget = budgetPace && budget > 0 && !budgetPace.on_track
    ? Math.max(0, (budget - budgetPace.month_to_date) / daysRemainingInMonth())
    : null;

  const biggestDay = dashboard.seven_day_bars.length
    ? dashboard.seven_day_bars.reduce((a, b) => (b.total_debit > a.total_debit ? b : a))
    : null;
  const biggestDayLabel = biggestDay
    ? new Date(biggestDay.date).toLocaleDateString('en-US', { weekday: 'long' })
    : '';
  const hasInterestingCallout = (biggestDay?.total_debit ?? 0) > 0 || recoveryTarget !== null;

  const dayTransactions = selectedDay
    ? dashboard.recent_transactions.filter((t) => t.trans_date.slice(0, 10) === selectedDay.date)
    : [];
  const dayCategoryTotals = (() => {
    const map = new Map<string, number>();
    for (const t of dayTransactions) {
      if (t.debit <= 0) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.debit);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.ink2 }]}>{greeting.toUpperCase()}</Text>
            <Text style={[styles.greetingName, { color: colors.ink }]}>Chijioke</Text>
          </View>
          <Pressable
            style={[styles.profileButton, { backgroundColor: colors.chip }]}
            onPress={() => router.navigate('/profile' as any)}
            hitSlop={10}
          >
            <User size={20} color={colors.ink} strokeWidth={1.7} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {/* Hero — one truth line */}
          <View style={styles.hero}>
            <Text style={[styles.heroLabel, { color: colors.ink2 }]}>{dashboard.month_label.toUpperCase()}</Text>
            {budget > 0 ? (
              <Text style={[styles.heroLine, { color: colors.ink }]}>
                <Text style={styles.heroAmountInline}>{formatNaira(spent)}</Text> spent ·{' '}
                <Text style={{ color: remaining >= 0 ? accent : '#E5645B' }}>
                  {formatNaira(Math.abs(remaining))} {remaining >= 0 ? 'left' : 'over'}
                </Text>
              </Text>
            ) : (
              <View style={styles.heroNoBudgetRow}>
                <Text style={[styles.heroLine, { color: colors.ink }]}>{formatNaira(spent)} spent this month</Text>
                <Pressable onPress={() => router.navigate('/profile' as any)} hitSlop={6}>
                  <Text style={[styles.setBudgetLink, { color: accent }]}>Set a budget</Text>
                </Pressable>
              </View>
            )}
            <Text style={[styles.pctCaption, { color: colors.ink2 }]}>
              {isUp ? '↑' : '↓'} <Text style={{ color: pctColor }}>{Math.abs(pctChange).toFixed(1)}%</Text>{' '}
              {isUp ? 'above' : 'below'} last month
            </Text>
          </View>

          {/* Verdict strip */}
          {prediction && prediction.target_date ? (
            <Pressable
              style={[styles.verdictStrip, { backgroundColor: colors.card, borderColor: colors.line }]}
              onPress={() => setVerdictOpen(true)}
            >
              <View style={[styles.verdictDot, { backgroundColor: paceColor }]} />
              <Text style={[styles.verdictText, { color: colors.ink }]} numberOfLines={2}>
                {verdictNarrative}
              </Text>
              <Text style={[styles.verdictChevron, { color: colors.ink3 }]}>›</Text>
            </Pressable>
          ) : null}

          {/* This week */}
          <View>
            <View style={styles.weekHeaderRow}>
              <Text style={[styles.weekTitle, { color: colors.ink }]}>This week</Text>
              <Text style={[styles.weekTotal, { color: colors.ink }]}>{formatNaira(weekTotal)}</Text>
            </View>
            <View style={styles.highSpendRow}>
              <View style={[styles.highSpendDot, { backgroundColor: '#E5645B' }]} />
              <Text style={[styles.highSpendText, { color: colors.ink2 }]}>
                {dashboard.high_spend_days} high-spend day{dashboard.high_spend_days === 1 ? '' : 's'} in {dashboard.month_label}
              </Text>
            </View>
            <WeekBars
              dashboard={dashboard}
              accent={accent}
              neutralBar={neutralBar}
              ink3={colors.ink3}
              dailyBudgetTarget={dailyBudgetTarget}
              onDayPress={setSelectedDay}
            />
          </View>

          {/* Smart callouts */}
          <View>
            <View style={styles.recentHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Highlights</Text>
              <Pressable onPress={() => router.navigate('/patterns' as any)} hitSlop={8}>
                <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
              </Pressable>
            </View>

            {hasInterestingCallout ? (
              <View style={styles.calloutsWrap}>
                {biggestDay && biggestDay.total_debit > 0 ? (
                  <View style={[styles.calloutCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                    <Text style={[styles.calloutLabel, { color: colors.ink3 }]}>BIGGEST SPEND THIS WEEK</Text>
                    <Text style={[styles.calloutText, { color: colors.ink }]}>
                      {biggestDayLabel} · {formatNaira(biggestDay.total_debit)}
                    </Text>
                  </View>
                ) : null}
                {recoveryTarget !== null ? (
                  <View style={[styles.calloutCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                    <Text style={[styles.calloutLabel, { color: colors.ink3 }]}>STAY ON TRACK</Text>
                    <Text style={[styles.calloutText, { color: colors.ink }]}>
                      Spend under {formatNaira(recoveryTarget)} today to get back on pace
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.ink2 }]}>
                Nothing unusual this week — spending looks steady.
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="home" />

      {/* Verdict detail sheet */}
      <BottomSheet visible={verdictOpen} onClose={() => setVerdictOpen(false)}>
        <View style={styles.sheetHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetLabel, { color: colors.ink3 }]}>SPENDING OUTLOOK</Text>
            <Text style={[styles.sheetHeadline, { color: colors.ink }]}>{regimeHeadline(regimeState)}</Text>
          </View>
          {budgetPace ? (
            <GaugeRing
              fill={budget > 0 ? budgetPace.pct_of_budget_projected / 100 : Math.min(1, (prediction?.regime?.ratio ?? 1) / 2)}
              label={budget > 0 ? `${Math.round(budgetPace.pct_of_budget_projected)}%` : '—'}
              color={paceColor}
              trackColor={colors.line}
              cardColor={colors.card}
            />
          ) : null}
        </View>
        <Text style={[styles.sheetNarrative, { color: colors.ink2 }]}>{verdictNarrative}</Text>

        {budget > 0 && budgetPace ? (
          <View style={styles.detailGrid}>
            <DetailRow label="Month to date" value={formatNaira(budgetPace.month_to_date)} ink2={colors.ink2} ink={colors.ink} />
            <DetailRow label="Projected month-end" value={formatNaira(budgetPace.projected_month_end)} ink2={colors.ink2} ink={colors.ink} />
            <DetailRow label="Budget" value={formatNaira(budget)} ink2={colors.ink2} ink={colors.ink} />
            {recoveryTarget !== null ? (
              <DetailRow
                label="Daily target to recover"
                value={formatNaira(recoveryTarget)}
                ink2={colors.ink2}
                ink={colors.ink}
                highlight
                accent={accent}
              />
            ) : null}
          </View>
        ) : null}

        <View style={[styles.statRow, { borderColor: colors.line }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>DAILY AVG</Text>
            <Text style={[styles.statValue, { color: colors.ink }]}>{formatNaira(dashboard.avg_daily)}</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.line }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>SAVED</Text>
            <Text style={[styles.statValue, { color: accent }]}>{formatNaira(dashboard.spend_health.saved_this_month)}</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.line }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>STREAK</Text>
            <Text style={[styles.statValue, { color: colors.ink }]}>{dashboard.spend_health.streak_days}d</Text>
          </View>
        </View>
      </BottomSheet>

      {/* Day detail sheet */}
      <BottomSheet visible={!!selectedDay} onClose={() => setSelectedDay(null)}>
        {selectedDay ? (
          <>
            <Text style={[styles.sheetLabel, { color: colors.ink3 }]}>
              {new Date(selectedDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </Text>
            <Text style={[styles.sheetHeadline, { color: selectedDay.is_high_spend ? '#E5645B' : colors.ink }]}>
              {formatNaira(selectedDay.total_debit)} spent
            </Text>
            {dailyBudgetTarget > 0 ? (
              <Text style={[styles.sheetNarrative, { color: colors.ink2 }]}>
                {selectedDay.total_debit > dailyBudgetTarget
                  ? `${formatNaira(selectedDay.total_debit - dailyBudgetTarget)} over your ${formatNaira(dailyBudgetTarget)} daily target`
                  : `${formatNaira(dailyBudgetTarget - selectedDay.total_debit)} under your ${formatNaira(dailyBudgetTarget)} daily target`}
              </Text>
            ) : null}

            {dayCategoryTotals.length > 0 ? (
              <View style={styles.sheetCategoryList}>
                {dayCategoryTotals.map(([category, total]) => (
                  <View key={category} style={styles.sheetCategoryRow}>
                    <View style={[styles.txDot, { backgroundColor: CATEGORY_DOT[category] ?? colors.ink3 }]} />
                    <Text style={[styles.sheetCategoryLabel, { color: colors.ink }]}>{category}</Text>
                    <Text style={[styles.sheetCategoryValue, { color: colors.ink }]}>{formatNaira(total)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.ink2 }]}>
                {selectedDay.total_debit > 0 ? 'No itemized transactions available for this day.' : 'No spending recorded.'}
              </Text>
            )}
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: Fonts.sans, fontSize: 13 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  greeting: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.7 },
  greetingName: { fontFamily: Fonts.heading, fontSize: 21, fontWeight: '600', marginTop: 3, letterSpacing: -0.2 },
  profileButton: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 6, gap: 28 },

  // Hero — one truth line
  hero: { paddingBottom: 0 },
  heroLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.96 },
  heroLine: { fontFamily: Fonts.heading, fontSize: 22, fontWeight: '600', letterSpacing: -0.3, marginTop: 10 },
  heroAmountInline: { fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700' },
  heroNoBudgetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  setBudgetLink: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600' },
  pctCaption: { fontFamily: Fonts.sans, fontSize: 13, marginTop: 8 },

  // Verdict strip
  verdictStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16,
  },
  verdictDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  verdictText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13.5, lineHeight: 18 },
  verdictChevron: { fontFamily: Fonts.sans, fontSize: 20, fontWeight: '600' },

  // This week
  weekHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekTitle: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },
  weekTotal: { fontFamily: Fonts.mono, fontSize: 14 },
  highSpendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  highSpendDot: { width: 6, height: 6, borderRadius: 3 },
  highSpendText: { fontFamily: Fonts.sans, fontSize: 12 },

  // Week bars
  weekTracksWrap: { height: 120, marginTop: 20, position: 'relative' },
  budgetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed', zIndex: 1 },
  weekBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 8 },
  weekBarCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  weekBarTrack: { width: '100%', height: '100%', justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', maxWidth: 28, alignSelf: 'center', borderRadius: 8, minHeight: 6 },
  weekLabelsRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  weekLabelCol: { flex: 1, textAlign: 'center' },
  weekBarLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.5 },

  // Smart callouts
  recentHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },
  seeAll: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  calloutsWrap: { gap: 10 },
  calloutCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  calloutLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },
  calloutText: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '500' },
  emptyText: { fontFamily: Fonts.sans, fontSize: 12, paddingVertical: 4 },

  // Bottom sheet — shared
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  sheetLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2 },
  sheetHeadline: { fontFamily: Fonts.heading, fontSize: 19, fontWeight: '600', marginTop: 7 },
  sheetNarrative: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18, marginTop: 10 },

  detailGrid: { marginTop: 18, gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 13 },
  detailValue: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '500' },

  statRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, paddingTop: 18, marginTop: 18,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 7 },
  statSep: { width: 1, height: 32 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },
  statValue: { fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600' },

  sheetCategoryList: { marginTop: 16, gap: 12 },
  sheetCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetCategoryLabel: { flex: 1, fontFamily: Fonts.sans, fontSize: 13.5 },
  sheetCategoryValue: { fontFamily: Fonts.mono, fontSize: 13.5, fontWeight: '500' },
  txDot: { width: 11, height: 11, borderRadius: 5.5, flexShrink: 0 },
});

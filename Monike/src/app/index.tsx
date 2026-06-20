import { useMemo } from 'react';
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
import { useAccent } from '@/contexts/accent-context';
import { useSWR } from '@/hooks/use-swr';
import {
  apiFetch,
  type DashboardResponse,
  type PredictionResponse,
  type RecentTransaction,
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

function formatTxnSubtitle(category: string, isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return category;
  const dateLabel = parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const timeLabel = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${category} · ${dateLabel}, ${timeLabel}`;
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

function WeekBars({ dashboard, accent, neutralBar, ink3 }: {
  dashboard: DashboardResponse; accent: string; neutralBar: string; ink3: string;
}) {
  const bars = dashboard.seven_day_bars;
  const max = Math.max(...bars.map((b) => b.total_debit), 1);
  const today = todayKey();

  return (
    <View style={styles.weekBarsRow}>
      {bars.map((bar) => {
        const isToday = bar.date === today;
        const pct = Math.max(0.04, bar.total_debit / max);
        const color = bar.is_high_spend ? '#E5645B' : isToday ? accent : neutralBar;
        return (
          <View key={bar.date} style={styles.weekBarCol}>
            <View style={styles.weekBarTrack}>
              <View style={[styles.weekBarFill, { height: `${pct * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.weekBarLabel, { color: isToday ? accent : ink3 }, isToday && { fontWeight: '700' }]}>
              {bar.day_label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonikeHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, accent, accentTint, dark } = useAccent();

  const { data: dashboard, isLoading } = useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);

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
  const pctPillBg = isUp ? '#E5645B29' : accentTint;
  const transactions: RecentTransaction[] = dashboard.recent_transactions.slice(0, 6);

  // Pace dial color: red when projected to blow the budget, otherwise track the
  // regime (cool/steady = accent, elevated = amber, hot = red).
  const regimeState = (prediction?.regime?.state ?? 'steady') as RegimeState;
  const overBudget =
    !!prediction?.budget_pace &&
    prediction.budget_pace.budget > 0 &&
    !prediction.budget_pace.on_track;
  const paceColor = overBudget ? '#E5645B' : regimeColor(regimeState, accent);

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
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={[styles.heroLabel, { color: colors.ink2 }]}>SPENT IN {dashboard.month_label.toUpperCase()}</Text>
            <Text style={[styles.heroAmount, { color: colors.ink }]}>{formatNaira(dashboard.total_spent_this_month)}</Text>
            <View style={styles.pctRow}>
              <View style={[styles.pctPill, { backgroundColor: pctPillBg }]}>
                <Text style={[styles.pctPillText, { color: pctColor }]}>
                  {isUp ? '↑' : '↓'} {Math.abs(pctChange).toFixed(1)}%
                </Text>
              </View>
              <Text style={[styles.pctCaption, { color: colors.ink2 }]}>{isUp ? 'above' : 'below'} last month</Text>
            </View>
          </View>

          {/* Stat tile row */}
          <View style={[styles.statRow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>PACE</Text>
              <View style={styles.paceValueRow}>
                <View style={[styles.paceDot, { backgroundColor: accent }]} />
                <Text style={[styles.statValue, { color: colors.ink }]}>{dashboard.spend_health.pace}</Text>
              </View>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.line }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>DAILY AVG</Text>
              <Text style={[styles.statValue, { color: colors.ink }]}>{formatNaira(dashboard.avg_daily)}</Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.line }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>SAVED</Text>
              <Text style={[styles.statValue, { color: accent }]}>
                {formatNaira(dashboard.spend_health.saved_this_month)}
              </Text>
            </View>
          </View>

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
            <WeekBars dashboard={dashboard} accent={accent} neutralBar={neutralBar} ink3={colors.ink3} />
          </View>

          {/* Spending outlook — honest regime + budget pace */}
          {prediction && prediction.target_date ? (
            <View style={[styles.outlookCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.outlookCopy}>
                <Text style={[styles.outlookLabel, { color: colors.ink3 }]}>SPENDING OUTLOOK</Text>
                <Text style={[styles.outlookHeadline, { color: colors.ink }]}>
                  {regimeHeadline((prediction.regime?.state ?? 'steady') as RegimeState)}
                </Text>
                <Text style={[styles.outlookNarrative, { color: colors.ink2 }]} numberOfLines={3}>
                  {prediction.budget_pace?.narrative ??
                    prediction.regime?.narrative ??
                    'Based on your recent spending pattern.'}
                </Text>
              </View>
              <GaugeRing
                fill={
                  prediction.budget_pace && prediction.budget_pace.budget > 0
                    ? prediction.budget_pace.pct_of_budget_projected / 100
                    : Math.min(1, (prediction.regime?.ratio ?? 1) / 2)
                }
                label={
                  prediction.budget_pace && prediction.budget_pace.budget > 0
                    ? `${Math.round(prediction.budget_pace.pct_of_budget_projected)}%`
                    : '—'
                }
                color={paceColor}
                trackColor={colors.line}
                cardColor={colors.card}
              />
            </View>
          ) : null}

          {/* Recent activity */}
          <View>
            <View style={styles.recentHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Recent activity</Text>
              <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
            </View>
            {transactions.length > 0 ? transactions.map((t, i) => {
              const isCredit = t.credit > 0;
              const amount = isCredit ? t.credit : t.debit;
              return (
                <View
                  key={`${t.trans_date}-${i}`}
                  style={[styles.txRow, { borderBottomColor: colors.line }]}
                >
                  <View style={[styles.txDot, { backgroundColor: CATEGORY_DOT[t.category] ?? colors.ink3 }]} />
                  <View style={styles.txCenter}>
                    <Text style={[styles.txDescription, { color: colors.ink }]} numberOfLines={1}>{t.description}</Text>
                    <Text style={[styles.txSubtitle, { color: colors.ink2 }]}>{formatTxnSubtitle(t.category, t.trans_date)}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: isCredit ? accent : colors.ink }]}>
                    {isCredit ? '+' : '−'}{formatNaira(amount)}
                  </Text>
                </View>
              );
            }) : (
              <Text style={[styles.emptyText, { color: colors.ink2 }]}>No transactions yet this month.</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="home" />
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

  // Hero
  hero: { paddingBottom: 0 },
  heroLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.96 },
  heroAmount: { fontFamily: Fonts.heading, fontSize: 46, fontWeight: '600', letterSpacing: -1, lineHeight: 49, marginTop: 10 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  pctPill: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, gap: 4 },
  pctPillText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '500' },
  pctCaption: { fontFamily: Fonts.sans, fontSize: 13 },

  // Stat row
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 22, paddingVertical: 18,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 7 },
  statSep: { width: 1, height: 32 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },
  statValue: { fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600' },
  paceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paceDot: { width: 7, height: 7, borderRadius: 3.5 },

  // This week
  weekHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekTitle: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },
  weekTotal: { fontFamily: Fonts.mono, fontSize: 14 },
  highSpendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  highSpendDot: { width: 6, height: 6, borderRadius: 3 },
  highSpendText: { fontFamily: Fonts.sans, fontSize: 12 },

  // Week bars
  weekBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 8, marginTop: 20 },
  weekBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 9, height: '100%' },
  weekBarTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', maxWidth: 28, alignSelf: 'center', borderRadius: 8, minHeight: 6 },
  weekBarLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.5 },

  // Outlook
  outlookCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    borderWidth: 1, borderRadius: 22, padding: 18,
  },
  outlookCopy: { flex: 1, gap: 0 },
  outlookLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2 },
  outlookHeadline: { fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600', marginTop: 7 },
  outlookNarrative: { fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 17, marginTop: 4 },

  // Recent activity
  recentHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },
  seeAll: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1 },
  txDot: { width: 11, height: 11, borderRadius: 5.5, flexShrink: 0 },
  txCenter: { flex: 1, minWidth: 0 },
  txDescription: { fontFamily: Fonts.sans, fontSize: 14.5, fontWeight: '600' },
  txSubtitle: { fontFamily: Fonts.mono, fontSize: 11, marginTop: 3 },
  txAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '500', flexShrink: 0 },
  emptyText: { fontFamily: Fonts.sans, fontSize: 12, paddingVertical: 16 },
});

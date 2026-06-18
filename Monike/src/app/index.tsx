import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Settings } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import {
  apiFetch,
  type DashboardResponse,
  type PredictionResponse,
  type RecentTransaction,
} from '@/services/api';
import { BottomTabInset, Fonts, LightColors, ScreenPadding } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Risk = 'HIGH' | 'MEDIUM' | 'LOW';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
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

function normalizeRisk(risk: string | undefined): Risk {
  if (risk === 'HIGH' || risk === 'MEDIUM' || risk === 'LOW') return risk;
  return 'LOW';
}

function riskLabel(risk: Risk) {
  if (risk === 'HIGH') return 'High';
  if (risk === 'MEDIUM') return 'Medium';
  return 'Low';
}

function riskColor(risk: Risk) {
  if (risk === 'HIGH') return LightColors.red;
  if (risk === 'MEDIUM') return LightColors.amber;
  return LightColors.green;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatTxnSubtitle(category: string, isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return category;
  const dateLabel = parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  const timeLabel = parsed.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
  return `${category} · ${dateLabel}, ${timeLabel}`;
}

const CATEGORY_DOT: Record<string, string> = {
  'Person-to-Person': '#5B7CFA',
  'POS Purchase': LightColors.amber,
  Data: '#2FA98E',
  Airtime: '#A368E0',
  'Food & Dining': LightColors.amber,
  'Online Payment': '#5B7CFA',
  Electricity: '#D99A2B',
  'Family Transfer': LightColors.red,
  Savings: LightColors.green,
  'Loan Repayment': '#9B9D9F',
};

function categoryDotColor(category: string) {
  return CATEGORY_DOT[category] ?? LightColors.textMuted;
}

// ─── Outlook Ring ─────────────────────────────────────────────────────────────

function OutlookRing({ probability, risk }: { probability: number; risk: Risk }) {
  const size = 72;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, probability));
  const color = riskColor(risk);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={LightColors.barTrack} strokeWidth={stroke} fill="none" />
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
          <Text style={[ringStyles.pct, { color }]}>{Math.round(pct * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pct: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '800' },
});

// ─── Week Bars ────────────────────────────────────────────────────────────────

function WeekBars({ dashboard }: { dashboard: DashboardResponse }) {
  const bars = dashboard.seven_day_bars;
  const max = Math.max(...bars.map((b) => b.total_debit), 1);
  const today = todayKey();

  return (
    <View style={styles.weekBarsRow}>
      {bars.map((bar) => {
        const isToday = bar.date === today;
        const pct = Math.max(0.04, bar.total_debit / max);
        const color = bar.is_high_spend ? LightColors.red : isToday ? LightColors.green : LightColors.barTrack;
        return (
          <View key={bar.date} style={styles.weekBarCol}>
            <View style={styles.weekBarTrack}>
              <View style={[styles.weekBarFill, { height: `${pct * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.weekBarLabel, isToday && { color: LightColors.green, fontWeight: '700' }]}>
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

  const { data: dashboard, isLoading } = useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);

  const greeting = useMemo(() => getGreeting(), []);

  const weekTotal = useMemo(
    () => dashboard?.seven_day_bars.reduce((sum, b) => sum + b.total_debit, 0) ?? 0,
    [dashboard],
  );

  if (!dashboard) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          </View>
        </SafeAreaView>
        <BottomNavigation activeRoute="home" variant="light" />
      </View>
    );
  }

  const risk = normalizeRisk(prediction?.risk_level);
  const pctChange = dashboard.pct_change_vs_last_month;
  const isUp = pctChange >= 0;
  const pctColor = isUp ? LightColors.red : LightColors.green;
  const transactions: RecentTransaction[] = dashboard.recent_transactions.slice(0, 6);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting.toUpperCase()}</Text>
            <Text style={styles.greetingName}>Chijioke</Text>
          </View>
          <Pressable style={styles.gearButton} onPress={() => router.navigate('/profile' as any)} hitSlop={10}>
            <Settings size={18} color={LightColors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>SPENT IN {dashboard.month_label.toUpperCase()}</Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency}>₦</Text>
              <Text style={styles.heroAmount}>{formatNaira(dashboard.total_spent_this_month)}</Text>
            </View>
            <View style={styles.pctRow}>
              <View style={[styles.pctPill, { backgroundColor: isUp ? LightColors.redSoft : LightColors.greenSoft }]}>
                <Text style={[styles.pctPillText, { color: pctColor }]}>
                  {isUp ? '↑' : '↓'} {Math.abs(pctChange).toFixed(1)}%
                </Text>
              </View>
              <Text style={styles.pctCaption}>{isUp ? 'above' : 'below'} last month</Text>
            </View>
          </View>

          {/* Stat tile row */}
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>PACE</Text>
              <View style={styles.paceValueRow}>
                <View style={[styles.paceDot, { backgroundColor: LightColors.green }]} />
                <Text style={styles.statValue}>{dashboard.spend_health.pace}</Text>
              </View>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>DAILY AVG</Text>
              <Text style={styles.statValue}>₦{formatNaira(dashboard.avg_daily)}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>SAVED</Text>
              <Text style={[styles.statValue, { color: LightColors.green }]}>
                ₦{formatNaira(dashboard.spend_health.saved_this_month)}
              </Text>
            </View>
          </View>

          {/* This week */}
          <View>
            <View style={styles.weekHeaderRow}>
              <Text style={styles.weekTitle}>This week</Text>
              <Text style={styles.weekTotal}>₦{formatNaira(weekTotal)}</Text>
            </View>
            <View style={styles.highSpendRow}>
              <View style={[styles.highSpendDot, { backgroundColor: LightColors.red }]} />
              <Text style={styles.highSpendText}>
                {dashboard.high_spend_days} high-spend day{dashboard.high_spend_days === 1 ? '' : 's'} in {dashboard.month_label}
              </Text>
            </View>
            <WeekBars dashboard={dashboard} />
          </View>

          {/* Tomorrow's outlook */}
          {prediction && prediction.target_date ? (
            <View style={styles.outlookCard}>
              <View style={styles.outlookCopy}>
                <Text style={styles.outlookLabel}>TOMORROW&apos;S OUTLOOK</Text>
                <Text style={styles.outlookHeadline}>
                  {riskLabel(risk)} chance of overspending
                </Text>
                <Text style={styles.outlookNarrative} numberOfLines={3}>
                  {prediction.velocity?.narrative ?? 'Based on your recent spending pattern.'}
                </Text>
              </View>
              <OutlookRing probability={prediction.probability} risk={risk} />
            </View>
          ) : null}

          {/* Recent activity */}
          <View>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <View style={styles.activityCard}>
              {transactions.length > 0 ? transactions.map((t, i) => {
                const isCredit = t.credit > 0;
                const amount = isCredit ? t.credit : t.debit;
                return (
                  <View
                    key={`${t.trans_date}-${i}`}
                    style={[styles.txRow, i < transactions.length - 1 && styles.txRowSeparator]}
                  >
                    <View style={[styles.txDot, { backgroundColor: categoryDotColor(t.category) }]} />
                    <View style={styles.txCenter}>
                      <Text style={styles.txDescription} numberOfLines={1}>{t.description}</Text>
                      <Text style={styles.txSubtitle}>{formatTxnSubtitle(t.category, t.trans_date)}</Text>
                    </View>
                    <Text style={[styles.txAmount, isCredit && { color: LightColors.green }]}>
                      {isCredit ? '+' : '−'}₦{formatNaira(amount)}
                    </Text>
                  </View>
                );
              }) : (
                <Text style={styles.emptyText}>No transactions yet this month.</Text>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="home" variant="light" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LightColors.bg },
  safeArea: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: LightColors.textMuted, fontFamily: Fonts.sans, fontSize: 13 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  greeting: { color: LightColors.textMuted, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  greetingName: { color: LightColors.textPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', marginTop: 2 },
  gearButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: LightColors.card, borderWidth: 1, borderColor: LightColors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16, gap: 22 },

  // Hero
  hero: { gap: 6 },
  heroLabel: { color: LightColors.textMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heroCurrency: { color: LightColors.textPrimary, fontFamily: Fonts.mono, fontSize: 30, fontWeight: '700', marginBottom: 6, marginRight: 2 },
  heroAmount: { color: LightColors.textPrimary, fontFamily: Fonts.mono, fontSize: 48, fontWeight: '800', letterSpacing: -1.5 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pctPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pctPillText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  pctCaption: { color: LightColors.textSecondary, fontFamily: Fonts.sans, fontSize: 13 },

  // Stat row
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LightColors.card, borderRadius: 18, paddingVertical: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 6 },
  statSep: { width: 1, height: 28, backgroundColor: LightColors.divider },
  statLabel: { color: LightColors.textMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  statValue: { color: LightColors.textPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  paceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paceDot: { width: 7, height: 7, borderRadius: 3.5 },

  // This week
  weekHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTitle: { color: LightColors.textPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  weekTotal: { color: LightColors.textPrimary, fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700' },
  highSpendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 16 },
  highSpendDot: { width: 6, height: 6, borderRadius: 3 },
  highSpendText: { color: LightColors.textSecondary, fontFamily: Fonts.sans, fontSize: 12.5 },

  // Week bars
  weekBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 10 },
  weekBarCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekBarTrack: { width: '100%', height: 104, justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', borderRadius: 7, minHeight: 6 },
  weekBarLabel: { color: LightColors.textMuted, fontFamily: Fonts.sans, fontSize: 12 },

  // Outlook
  outlookCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    backgroundColor: LightColors.card, borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  outlookCopy: { flex: 1, gap: 6 },
  outlookLabel: { color: LightColors.textMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  outlookHeadline: { color: LightColors.textPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  outlookNarrative: { color: LightColors.textSecondary, fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 17 },

  // Recent activity
  sectionTitle: { color: LightColors.textPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  activityCard: {
    backgroundColor: LightColors.card, borderRadius: 18, paddingHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  txRowSeparator: { borderBottomWidth: 1, borderBottomColor: LightColors.divider },
  txDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  txCenter: { flex: 1, minWidth: 0 },
  txDescription: { color: LightColors.textPrimary, fontFamily: Fonts.sans, fontSize: 13.5, fontWeight: '600' },
  txSubtitle: { color: LightColors.textMuted, fontFamily: Fonts.sans, fontSize: 11.5, marginTop: 2 },
  txAmount: { color: LightColors.textPrimary, fontFamily: Fonts.mono, fontSize: 13.5, fontWeight: '700', flexShrink: 0 },
  emptyText: { color: LightColors.textMuted, fontFamily: Fonts.sans, fontSize: 12, paddingVertical: 16 },
});

import { useMemo, type ComponentType } from 'react';
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
import {
  Settings,
  Users,
  ShoppingBag,
  Wifi,
  Phone,
  Utensils,
  Globe,
  Zap,
  Landmark,
  Banknote,
  Repeat2,
  CreditCard,
  ChevronRight,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import { useAccent } from '@/contexts/accent-context';
import {
  apiFetch,
  type DashboardResponse,
  type PredictionResponse,
  type RecentTransaction,
} from '@/services/api';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

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

function riskColor(risk: Risk) {
  if (risk === 'HIGH') return MonikeColors.signalRed;
  if (risk === 'MEDIUM') return MonikeColors.signalAmber;
  return MonikeColors.accentPulse;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDayDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

const CATEGORY_ICON: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  'Person-to-Person': Users,
  'POS Purchase': ShoppingBag,
  Data: Wifi,
  Airtime: Phone,
  'Food & Dining': Utensils,
  'Online Payment': Globe,
  Electricity: Zap,
  'Family Transfer': Landmark,
  Savings: Banknote,
  'Loan Repayment': Repeat2,
};

function categoryIcon(category: string) {
  return CATEGORY_ICON[category] ?? CreditCard;
}

// ─── Risk Ring ────────────────────────────────────────────────────────────────

function RiskRing({ probability, risk }: { probability: number; risk: Risk }) {
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, probability));
  const color = riskColor(risk);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={MonikeColors.bgElevated}
          strokeWidth={stroke}
          fill="none"
        />
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
  pct: { fontFamily: Fonts.mono, fontSize: 18, fontWeight: '800' },
});

// ─── Week Bars ────────────────────────────────────────────────────────────────

function WeekBars({ dashboard, accent }: { dashboard: DashboardResponse; accent: string }) {
  const bars = dashboard.seven_day_bars;
  const max = Math.max(...bars.map((b) => b.total_debit), 1);
  const today = todayKey();

  return (
    <View style={styles.weekBarsRow}>
      {bars.map((bar) => {
        const isToday = bar.date === today;
        const pct = Math.max(0.04, bar.total_debit / max);
        const color = bar.is_high_spend ? MonikeColors.signalRed : isToday ? accent : MonikeColors.bgElevated;
        return (
          <View key={bar.date} style={styles.weekBarCol}>
            <View style={styles.weekBarTrack}>
              <View style={[styles.weekBarFill, { height: `${pct * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.weekBarLabel, isToday && { color: accent, fontWeight: '700' }]}>
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
  const { accent } = useAccent();

  const { data: dashboard, isLoading } = useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);

  const greeting = useMemo(() => getGreeting(), []);

  if (!dashboard) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          </View>
        </SafeAreaView>
        <BottomNavigation activeRoute="home" />
      </View>
    );
  }

  const risk = normalizeRisk(prediction?.risk_level);
  const pctChange = dashboard.pct_change_vs_last_month;
  const isUp = pctChange >= 0;
  const pctColor = isUp ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const transactions: RecentTransaction[] = dashboard.recent_transactions.slice(0, 6);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.greetingName}>Chijioke</Text>
          </View>
          <Pressable style={styles.gearButton} onPress={() => router.navigate('/profile' as any)} hitSlop={10}>
            <Settings size={18} color={MonikeColors.inkSecondary} strokeWidth={2} />
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
            <View style={[styles.pctPill, { backgroundColor: pctColor + '14', borderColor: pctColor + '40' }]}>
              <Text style={[styles.pctPillText, { color: pctColor }]}>
                {isUp ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}% vs last month
              </Text>
            </View>
          </View>

          {/* Stat tile row */}
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>PACE</Text>
              <Text style={styles.statValue}>{dashboard.spend_health.pace}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>DAILY AVG</Text>
              <Text style={styles.statValue}>₦{formatNaira(dashboard.avg_daily)}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>SAVED</Text>
              <Text style={[styles.statValue, { color: MonikeColors.accentPulse }]}>
                ₦{formatNaira(dashboard.spend_health.saved_this_month)}
              </Text>
            </View>
          </View>

          {/* This week */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>This week</Text>
            <WeekBars dashboard={dashboard} accent={accent} />
            <Text style={styles.sectionSub}>
              {dashboard.high_spend_days} high-spend day{dashboard.high_spend_days === 1 ? '' : 's'} in {dashboard.month_label}
            </Text>
          </View>

          {/* Tomorrow's outlook */}
          {prediction && prediction.target_date ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tomorrow&apos;s outlook</Text>
              <View style={styles.outlookRow}>
                <RiskRing probability={prediction.probability} risk={risk} />
                <View style={styles.outlookCopy}>
                  <View style={[styles.riskBadge, { borderColor: riskColor(risk) + '50', backgroundColor: riskColor(risk) + '14' }]}>
                    <Text style={[styles.riskBadgeText, { color: riskColor(risk) }]}>{risk} RISK</Text>
                  </View>
                  <Text style={styles.outlookDay}>{prediction.day_name}</Text>
                  <Text style={styles.outlookNarrative} numberOfLines={3}>
                    {prediction.velocity?.narrative ?? 'Based on your recent spending pattern.'}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Recent activity */}
          <View style={styles.sectionCard}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              <Pressable style={styles.seeAll} onPress={() => router.navigate('/insights' as any)} hitSlop={8}>
                <Text style={styles.seeAllText}>See all</Text>
                <ChevronRight size={13} color={MonikeColors.inkMuted} strokeWidth={2} />
              </Pressable>
            </View>

            {transactions.length > 0 ? transactions.map((t, i) => {
              const Icon = categoryIcon(t.category);
              const isCredit = t.credit > 0;
              const amount = isCredit ? t.credit : t.debit;
              return (
                <View
                  key={`${t.trans_date}-${i}`}
                  style={[styles.txRow, i < transactions.length - 1 && styles.txRowSeparator]}
                >
                  <View style={styles.txIconCircle}>
                    <Icon size={18} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
                  </View>
                  <View style={styles.txCenter}>
                    <Text style={styles.txDescription} numberOfLines={1}>{t.description}</Text>
                    <Text style={styles.txDate}>{formatDayDate(t.trans_date)}</Text>
                  </View>
                  <Text style={[styles.txAmount, isCredit && { color: MonikeColors.accentPulse }]}>
                    {isCredit ? '+' : '−'}₦{formatNaira(amount)}
                  </Text>
                </View>
              );
            }) : (
              <Text style={styles.emptyText}>No transactions yet this month.</Text>
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
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  greeting: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
  greetingName: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 19, fontWeight: '700', marginTop: 2 },
  gearButton: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    alignItems: 'center', justifyContent: 'center',
  },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16, gap: 18 },

  // Hero
  hero: { gap: 6 },
  heroLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heroCurrency: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 26, fontWeight: '700', marginBottom: 4, marginRight: 3 },
  heroAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 44, fontWeight: '800', letterSpacing: -1.5 },
  pctPill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  pctPillText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },

  // Stat row
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingVertical: 14,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 5 },
  statSep: { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },
  statLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  statValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },

  // Section card
  sectionCard: {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 16, gap: 12,
  },
  sectionTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' },
  sectionSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  // Week bars
  weekBarsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 8 },
  weekBarCol: { flex: 1, alignItems: 'center', gap: 6 },
  weekBarTrack: { width: '100%', height: 76, justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', borderRadius: 5, minHeight: 4 },
  weekBarLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },

  // Outlook
  outlookRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  outlookCopy: { flex: 1, gap: 6 },
  riskBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  riskBadgeText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  outlookDay: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  outlookNarrative: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17 },

  // Recent activity
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  txRowSeparator: { borderBottomWidth: 0.5, borderBottomColor: MonikeColors.inkGhost },
  txIconCircle: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txCenter: { flex: 1, minWidth: 0 },
  txDescription: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600' },
  txDate: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  txAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', flexShrink: 0 },
  emptyText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, paddingVertical: 8 },
});

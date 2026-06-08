import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  CreditCard,
  Globe,
  Phone,
  PieChart,
  PlusCircle,
  ShoppingBag,
  TrendingUp,
  Users,
  Utensils,
  Wifi,
  Zap,
  Minus,
  ArrowUpRight,
  Flame,
  Sparkles,
  ChevronRight,
  Activity,
  X,
  Tag,
  Clock,
  Calendar,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import { apiFetch, type DashboardResponse, type LogEntry, type PredictionResponse, type SummaryResponse } from '@/services/api';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Risk = 'HIGH' | 'MEDIUM' | 'LOW';
type PaceStatus = 'Ahead' | 'On Track' | 'Over';
type Category =
  | 'Person-to-Person'
  | 'POS Purchase'
  | 'Data'
  | 'Airtime'
  | 'Food & Dining'
  | 'Online Payment'
  | 'Electricity'
  | 'Other';

type Transaction = {
  id: string;
  description: string;
  category: Category;
  date: string;
  day: string;
  time: string;
  amount: number;
};

type DaySpend = {
  day: string;
  date: string;
  isoDate: string;
  total: number;
  limit: number;
  risk: Risk;
};

type CategoryTotal = {
  category: Category;
  total: number;
  color: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const loadingSteps = [
  'connecting to database...',
  'loading transactions...',
  'training model...',
  'ready.',
] as const;

const DAY_NAMES: Record<string, string> = {
  Mo: 'Monday',
  Tu: 'Tuesday',
  We: 'Wednesday',
  Th: 'Thursday',
  Fr: 'Friday',
  Sa: 'Saturday',
  Su: 'Sunday',
};

const CATEGORY_ALIASES: Record<string, Category> = {
  P2P: 'Person-to-Person',
  'Person-to-Person': 'Person-to-Person',
  Transfer: 'Person-to-Person',
  POS: 'POS Purchase',
  'POS Purchase': 'POS Purchase',
  Data: 'Data',
  Airtime: 'Airtime',
  Food: 'Food & Dining',
  'Food & Dining': 'Food & Dining',
  Online: 'Online Payment',
  'Online Payment': 'Online Payment',
  Electricity: 'Electricity',
};

const categoryPalette = ['#00E676', '#FFB300', '#FF3D3D', '#4FC3F7', '#69FF9C', '#A07000', '#8B0000', '#8B939E'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function moneySign(value: number) {
  return value < 0 ? '−' : '+';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function normalizeRisk(risk: string | undefined, fallbackHigh = false): Risk {
  if (risk === 'HIGH' || risk === 'MEDIUM' || risk === 'LOW') return risk;
  return fallbackHigh ? 'HIGH' : 'LOW';
}

function riskAccentColor(risk: Risk) {
  if (risk === 'HIGH') return MonikeColors.signalRed;
  if (risk === 'MEDIUM') return MonikeColors.signalAmber;
  return MonikeColors.accentPulse;
}

function daysLeftInCurrentMonth() {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - today.getDate() + 1, 1);
}

function normalizePace(pace: string | undefined): PaceStatus {
  if (pace === 'Ahead' || pace === 'Over' || pace === 'On Track') return pace;
  return 'On Track';
}

function normalizeCategory(category: string | undefined): Category {
  if (!category) return 'Other';
  return CATEGORY_ALIASES[category] ?? 'Other';
}

function formatDayDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function formatTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function currentSummaryPath() {
  const today = new Date();
  return `/summary/${today.getFullYear()}/${today.getMonth() + 1}`;
}

function dashboardBarsToDays(dashboard: DashboardResponse): DaySpend[] {
  const limit = Math.max(dashboard.avg_daily, 1);
  return dashboard.seven_day_bars.map((bar) => ({
    day: bar.day_label,
    date: formatDayDate(bar.date),
    isoDate: bar.date,
    total: bar.total_debit,
    limit,
    risk: normalizeRisk(undefined, bar.is_high_spend),
  }));
}

function dashboardTransactionsToRows(dashboard: DashboardResponse): Transaction[] {
  return dashboard.recent_transactions.map((transaction, index) => {
    const amount = transaction.credit > 0 ? transaction.credit : -transaction.debit;
    return {
      id: `${transaction.trans_date}-${index}`,
      description: transaction.description,
      category: normalizeCategory(transaction.category),
      date: formatDayDate(transaction.trans_date),
      day: '',
      time: formatTime(transaction.trans_date),
      amount,
    };
  });
}

function logEntryToCategoryTotals(entry?: LogEntry): CategoryTotal[] {
  if (!entry) return [];

  const rawTotals: [Category, number][] = [
    ['Person-to-Person', entry.p2p_spend],
    ['POS Purchase', entry.pos_spend],
    ['Data', entry.data_spend],
    ['Airtime', entry.airtime_spend],
    ['Online Payment', entry.online_spend],
    ['Person-to-Person', entry.family_spend],
    ['Person-to-Person', entry.savings_out],
  ];

  const totals = new Map<Category, number>();
  rawTotals.forEach(([category, total]) => {
    if (total > 0) totals.set(category, (totals.get(category) ?? 0) + total);
  });

  return Array.from(totals.entries()).map(([category, total], index) => ({
    category,
    total,
    color: categoryPalette[index % categoryPalette.length],
  }));
}

function categoryIcon(category: Category) {
  const map: Record<Category, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
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

// ─── Shared Components ────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: Risk }) {
  const palette = {
    HIGH:   { color: MonikeColors.signalRed,   backgroundColor: '#FF3D3D14', borderColor: '#FF3D3D35' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30014', borderColor: '#FFB30035' },
    LOW:    { color: MonikeColors.accentPulse, backgroundColor: '#00E67614', borderColor: '#00E67635' },
  }[risk];

  return <Text style={[styles.riskBadge, palette]}>{risk}</Text>;
}

function PressScale({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
let splashAlreadyShown = false;
function SplashScreen({ onComplete, dataReady }: { onComplete: () => void; dataReady: boolean }) {
  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const logoScale      = useRef(new Animated.Value(0.97)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(4)).current;
  const progress       = useRef(new Animated.Value(0)).current;
  const statusOpacity  = useRef(new Animated.Value(1)).current;
  const exitOpacity    = useRef(new Animated.Value(1)).current;
  const exitScale      = useRef(new Animated.Value(1)).current;
  const [statusIndex, setStatusIndex] = useState(0);

  const minTimeElapsed = useRef(false);
  const exitTriggered = useRef(false);

  const triggerExit = useCallback(() => {
    if (exitTriggered.current) return;
    exitTriggered.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(exitScale,   { toValue: 1.02, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(onComplete);
    });
  }, [exitOpacity, exitScale, onComplete, progress]);

  useEffect(() => {
    if (dataReady && minTimeElapsed.current) {
      triggerExit();
    }
  }, [dataReady, triggerExit]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const progressAnimation = Animated.timing(progress, {
      toValue: 0.88,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoScale,   { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    timers.push(
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(taglineOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(taglineY,       { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }, 200),
    );

    progressAnimation.start();

    [1, 2, 3].forEach((nextIndex) => {
      timers.push(
        setTimeout(() => {
          Animated.timing(statusOpacity, { toValue: 0, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
            setStatusIndex(nextIndex);
            Animated.timing(statusOpacity, { toValue: 1, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
          });
        }, ([500, 1000, 1400] as const)[nextIndex - 1]),
      );
    });

    timers.push(
      setTimeout(() => {
        minTimeElapsed.current = true;
        if (dataReady) triggerExit();
      }, 1500),
    );

    timers.push(setTimeout(() => { triggerExit(); }, 10000));

    return () => {
      timers.forEach(clearTimeout);
      progressAnimation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.splashRoot}>
      <Animated.View style={[styles.splashCenter, { opacity: exitOpacity, transform: [{ scale: exitScale }] }]}>
        <Animated.View style={[styles.logoUnit, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <View style={styles.monikeGlyph}>
            <View style={styles.glyphArrow}>
              <View style={styles.glyphArrowStem} />
              <View style={[styles.glyphArrowHead, styles.glyphArrowHeadLeft]} />
              <View style={[styles.glyphArrowHead, styles.glyphArrowHeadRight]} />
            </View>
          </View>
          <Text style={styles.wordmark}>MONIKE</Text>
        </Animated.View>
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
          KNOW WHERE YOUR MONEY GOES
        </Animated.Text>
        <View style={styles.splashProgressTrack}>
          <Animated.View
            style={[
              styles.splashProgressFill,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) },
            ]}
          />
        </View>
        <Animated.Text style={[styles.loadingStatus, { opacity: statusOpacity }]}>
          {loadingSteps[statusIndex]}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ onSettings: _onSettings }: { onSettings: () => void }) {
  return <MonikeHeader title="Home" home />;
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ dashboard, summary }: { dashboard: DashboardResponse; summary?: SummaryResponse }) {
  const animatedAmount = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  const monthlyBudget = summary?.budget_limit ?? 0;
  const budgetProgress = monthlyBudget > 0 ? dashboard.total_spent_this_month / monthlyBudget : 0;
  const pctChange = dashboard.pct_change_vs_last_month;
  const isUp = pctChange >= 0;
  const comparisonColor = isUp ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const risk = normalizeRisk(dashboard.prediction_risk);

  useEffect(() => {
    const listener = animatedAmount.addListener(({ value }) => setDisplayValue(value));
    animatedAmount.setValue(0);
    Animated.timing(animatedAmount, {
      toValue: dashboard.total_spent_this_month,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animatedAmount.removeListener(listener);
  }, [animatedAmount, dashboard.total_spent_this_month]);

  const greeting = getGreeting();

  const formatted = formatNaira(displayValue, 2);
  const parts = formatted.split('.');
  const intPart = parts[0];
  const decPart = parts[1] ?? '00';

  return (
    <View style={styles.heroCard}>
      {/* Greeting row */}
      <View style={styles.heroGreetingRow}>
        <View>
          <Text style={styles.heroGreetingLabel}>{greeting}, Chijioke</Text>
          <Text style={styles.heroMonthBadge}>{dashboard.month_label}</Text>
        </View>
        <RiskBadge risk={risk} />
      </View>

      {/* Amount block */}
      <View style={styles.heroAmountBlock}>
        <Text style={styles.heroSpentLabel}>TOTAL SPENT</Text>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroNairaPrefix}>₦</Text>
          <Text style={styles.heroAmount}>{intPart}</Text>
          <Text style={styles.heroAmountDec}>.{decPart}</Text>
        </View>
        <View style={[styles.comparisonChip, { borderColor: `${comparisonColor}35`, backgroundColor: `${comparisonColor}10` }]}>
          <ArrowUpRight
            size={10}
            color={comparisonColor}
            strokeWidth={2.5}
            style={{ transform: [{ rotate: isUp ? '0deg' : '90deg' }] }}
          />
          <Text style={[styles.comparisonChipText, { color: comparisonColor }]}>
            {Math.abs(pctChange).toFixed(1)}% vs last month
          </Text>
        </View>
      </View>

      {/* Budget bar */}
      {monthlyBudget > 0 ? (
        <View style={styles.budgetSection}>
          <View style={styles.budgetLabelRow}>
            <Text style={styles.budgetLabelLeft}>₦{formatNaira(dashboard.total_spent_this_month)} spent</Text>
            <Text style={styles.budgetLabelRight}>of ₦{formatNaira(monthlyBudget)} · {Math.round(budgetProgress * 100)}%</Text>
          </View>
          <View style={styles.budgetBarTrack}>
            <View
              style={[
                styles.budgetBarFill,
                {
                  width: `${Math.min(budgetProgress * 100, 100)}%` as any,
                  backgroundColor: budgetProgress > 0.85
                    ? MonikeColors.signalRed
                    : budgetProgress > 0.65
                    ? MonikeColors.signalAmber
                    : MonikeColors.accentPulse,
                },
              ]}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.budgetNoneText}>No monthly budget configured</Text>
      )}

      {/* Stat pills row */}
      <View style={styles.heroStatPills}>
        <View style={styles.heroStatPill}>
          <Text style={styles.heroStatPillValue}>₦{formatNaira(dashboard.avg_daily)}</Text>
          <Text style={styles.heroStatPillLabel}>daily avg</Text>
        </View>
        <View style={styles.heroStatPillDivider} />
        <View style={styles.heroStatPill}>
          <Text style={styles.heroStatPillValue}>{dashboard.high_spend_days}</Text>
          <Text style={styles.heroStatPillLabel}>high-spend days</Text>
        </View>
        <View style={styles.heroStatPillDivider} />
        <View style={styles.heroStatPill}>
          <Text style={styles.heroStatPillValue}>{Math.round(dashboard.prediction_prob * 100)}%</Text>
          <Text style={styles.heroStatPillLabel}>tomorrow risk</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Financial Coach ──────────────────────────────────────────────────────────

function FinancialCoachCard({
  dashboard,
  prediction,
  summary,
}: {
  dashboard: DashboardResponse;
  prediction?: PredictionResponse;
  summary?: SummaryResponse;
}) {
  const risk = normalizeRisk(prediction?.risk_level ?? dashboard.prediction_risk);
  const accent = riskAccentColor(risk);
  const probability = Math.round(((prediction?.probability ?? dashboard.prediction_prob) || 0) * 100);
  const daysLeft = daysLeftInCurrentMonth();
  const budget = summary?.budget_limit ?? 0;
  const remainingBudget = budget > 0 ? Math.max(0, budget - dashboard.total_spent_this_month) : 0;
  const safeDailyLimit = budget > 0 ? Math.floor(remainingBudget / daysLeft) : Math.max(0, Math.floor(dashboard.avg_daily * 0.85));
  const velocityDirection = prediction?.velocity.direction;
  const isAccelerating = velocityDirection === 'up';
  const Icon = risk === 'HIGH' ? Flame : risk === 'MEDIUM' || isAccelerating ? Activity : Sparkles;

  const headline = risk === 'HIGH'
    ? 'High-spend pattern detected today.'
    : risk === 'MEDIUM'
    ? 'Spend intentionally — momentum is building.'
    : "You're in control. Stay the course.";

  const advisorTips = prediction?.advisor_tips?.filter(Boolean).slice(0, 2) ?? [];
  const fallbackTips = [
    risk === 'HIGH'
      ? `Cap today at ₦${formatNaira(safeDailyLimit)}. Delay non-urgent transfers.`
      : risk === 'MEDIUM'
      ? `Soft-cap at ₦${formatNaira(safeDailyLimit)}, then pause when you hit it.`
      : `Move a win to savings first, then stay below ₦${formatNaira(safeDailyLimit)}.`,
    'Pause one avoidable spend category until tomorrow.',
  ];
  const tips = advisorTips.length > 0 ? advisorTips : fallbackTips;

  return (
    <View style={[styles.coachCard, { borderColor: `${accent}25` }]}>
      <View style={[styles.coachAccentBar, { backgroundColor: accent }]} />

      <View style={styles.coachBody}>
        {/* Header: icon + headline + risk % */}
        <View style={styles.coachHeaderRow}>
          <View style={[styles.coachIconCircle, { backgroundColor: `${accent}14` }]}>
            <Icon size={16} color={accent} strokeWidth={1.8} />
          </View>
          <View style={styles.coachHeaderCopy}>
            <Text style={[styles.coachEyebrow, { color: accent }]}>ML MONEY MOVE</Text>
            <Text style={styles.coachTitle}>{headline}</Text>
          </View>
          <View style={[styles.coachRiskPill, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]}>
            <Text style={[styles.coachRiskPct, { color: accent }]}>{probability}%</Text>
            <Text style={styles.coachRiskLabel}>risk</Text>
          </View>
        </View>

        {/* Metrics row */}
        <View style={styles.coachMetricRow}>
          <View style={styles.coachMetricBlock}>
            <Text style={styles.coachMetricLabel}>Safe today</Text>
            <Text style={[styles.coachMetricValue, { color: accent }]}>₦{formatNaira(safeDailyLimit)}</Text>
          </View>
          <View style={styles.coachMetricDivider} />
          <View style={styles.coachMetricBlock}>
            <Text style={styles.coachMetricLabel}>Budget left</Text>
            <Text style={styles.coachMetricValue}>₦{formatNaira(remainingBudget)}</Text>
          </View>
          <View style={styles.coachMetricDivider} />
          <View style={styles.coachMetricBlock}>
            <Text style={styles.coachMetricLabel}>Days left</Text>
            <Text style={styles.coachMetricValue}>{daysLeft}</Text>
          </View>
        </View>

        {/* Tips */}
        <View style={styles.coachTipsStack}>
          {tips.map((tip, index) => (
            <View key={`${tip}-${index}`} style={styles.coachTipRow}>
              <View style={[styles.coachTipBullet, { backgroundColor: accent }]} />
              <Text style={styles.coachTipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions() {
  const actions: {
    Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    label: string;
    active?: boolean;
    accent?: string;
  }[] = [
    { Icon: BarChart2,  label: 'Summary',    accent: '#4FC3F7' },
    { Icon: PieChart,   label: 'Categories', accent: '#FFB300' },
    { Icon: Zap,        label: 'Predict',    active: true },
    { Icon: PlusCircle, label: 'Log Spend',  accent: '#00E676' },
  ];

  return (
    <View style={styles.quickActionsRow}>
      {actions.map(({ Icon, label, active, accent }) => {
        const color = active ? MonikeColors.accentPulse : (accent ?? MonikeColors.inkSecondary);
        return (
          <PressScale key={label} style={styles.quickActionItem}>
            <View style={[
              styles.quickActionCircle,
              active && styles.quickActionCircleActive,
              { borderColor: active ? `${MonikeColors.accentPulse}40` : MonikeColors.inkGhost },
            ]}>
              <Icon size={18} color={color} strokeWidth={1.7} />
            </View>
            <Text style={[styles.quickActionLabel, { color: active ? MonikeColors.accentPulse : MonikeColors.inkSecondary }]}>
              {label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

// ─── 7-Day Chart ──────────────────────────────────────────────────────────────

function SevenDayChart({ days, averageDailySpend, onSelectDay }: { days: DaySpend[]; averageDailySpend: number; onSelectDay: (day: DaySpend) => void }) {
  const animations = useRef<Animated.Value[]>([]).current;
  while (animations.length < days.length) animations.push(new Animated.Value(0));
  if (animations.length > days.length) animations.splice(days.length);

  const chartLimit = Math.max(averageDailySpend, ...days.map((d) => d.limit), 1);
  const maxSpend  = Math.max(...days.map((d) => d.total), chartLimit);
  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
  const limitTop  = 100 - (chartLimit / maxSpend) * 100;
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    animations.forEach((animation) => animation.setValue(0));
    Animated.stagger(
      55,
      animations.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, [animations, days]);

  return (
    <View style={styles.chartSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>7-DAY SPEND</Text>
        <Text style={styles.sectionValue}>₦{formatNaira(weekTotal)} this week</Text>
      </View>
      <View style={styles.chartCard}>
        {/* Threshold line */}
        <View style={[styles.thresholdLine, { top: `${limitTop}%` as any }]} />
        <Text style={[styles.thresholdLabel, { top: `${Math.max(limitTop - 7, 0)}%` as any }]}>avg</Text>

        {days.map((day, index) => {
          const isHigh  = day.risk === 'HIGH';
          const isToday = day.isoDate === todayIso;
          const barColor = isToday
            ? MonikeColors.accentNeon
            : isHigh
            ? MonikeColors.signalRed
            : MonikeColors.accentPulse;

          const animatedHeight = animations[index].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 88 * (day.total / maxSpend)],
          });

          return (
            <PressScale key={day.isoDate} style={styles.chartColumn} onPress={() => onSelectDay(day)}>
              <View style={styles.barSlot}>
                <Animated.View
                  style={[
                    styles.dashboardBar,
                    isHigh && !isToday && styles.dashboardBarHigh,
                    isToday && styles.dashboardBarToday,
                    { height: animatedHeight },
                  ]}
                />
              </View>
              <Text style={[styles.chartDayLabel, isToday && styles.chartDayLabelToday]}>
                {day.day}
              </Text>
              {isToday && <View style={styles.todayDot} />}
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

// ─── Spend Health Strip ───────────────────────────────────────────────────────

function SpendHealthStrip({ dashboard, summary }: { dashboard: DashboardResponse; summary?: SummaryResponse }) {
  const paceStatus = normalizePace(dashboard.spend_health.pace);
  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const budgetText = summary?.budget_limit ? `₦${formatNaira(summary.budget_limit)}` : '—';

  const paceColor = {
    Ahead:      MonikeColors.signalRed,
    Over:       MonikeColors.signalAmber,
    'On Track': MonikeColors.accentPulse,
  }[paceStatus];

  return (
    <View style={styles.healthStrip}>
      {/* PACE block */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>PACE</Text>
        <View style={[styles.healthPacePill, { borderColor: `${paceColor}35`, backgroundColor: `${paceColor}10` }]}>
          <TrendingUp size={10} color={paceColor} strokeWidth={2} />
          <Text style={[styles.healthPaceText, { color: paceColor }]}>{paceStatus}</Text>
        </View>
        <Text style={styles.healthSubtext}>Day {daysElapsed}/{daysInMonth} · {budgetText}</Text>
      </View>

      <View style={styles.healthDivider} />

      {/* STREAK */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>STREAK</Text>
        <Text style={styles.streakValue}>{dashboard.spend_health.streak_days}d</Text>
        <View style={styles.dotRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.streakDot, i < Math.min(dashboard.spend_health.streak_days, 5) && styles.streakDotFilled]} />
          ))}
        </View>
        <Text style={styles.healthSubtext}>under threshold</Text>
      </View>

      <View style={styles.healthDivider} />

      {/* SAVED */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>SAVED</Text>
        <Text style={styles.savedValue}>₦{formatNaira(dashboard.spend_health.saved_this_month)}</Text>
        <Text style={styles.healthSubtext}>this month</Text>
      </View>
    </View>
  );
}

// ─── Transaction Detail Modal ─────────────────────────────────────────────────

function TransactionDetailModal({
  transaction,
  visible,
  onClose,
}: {
  transaction: Transaction | null;
  visible: boolean;
  onClose: () => void;
}) {
  const sheetY  = useRef(new Animated.Value(480)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetY,  { toValue: 0, speed: 16, bounciness: 4, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetY,  { toValue: 480, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [opacity, sheetY, visible]);

  if (!transaction) return null;

  const credit = transaction.amount > 0;
  const Icon = categoryIcon(transaction.category);
  const amountColor = credit ? MonikeColors.signalBlue : MonikeColors.inkPrimary;

  const detailRows: { icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; label: string; value: string }[] = [
    { icon: Tag,      label: 'Category', value: transaction.category },
    { icon: Calendar, label: 'Date',     value: transaction.date },
    { icon: Clock,    label: 'Time',     value: transaction.time || '—' },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropTint, { opacity }]} />
      </Pressable>
      <Animated.View style={[styles.txDetailSheet, { transform: [{ translateY: sheetY }] }]}>
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.txDetailHeader}>
          <View style={[styles.txDetailIconWrap, { backgroundColor: credit ? '#4FC3F714' : MonikeColors.bgElevated }]}>
            <Icon size={22} color={credit ? MonikeColors.signalBlue : MonikeColors.inkSecondary} strokeWidth={1.6} />
          </View>
          <Pressable style={styles.txDetailClose} onPress={onClose} hitSlop={12}>
            <X size={16} color={MonikeColors.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Amount */}
        <Text style={[styles.txDetailAmount, { color: amountColor }]}>
          {moneySign(transaction.amount)}₦{formatNaira(transaction.amount)}
        </Text>

        {/* Description */}
        <Text style={styles.txDetailDescription}>{transaction.description}</Text>

        {/* Divider */}
        <View style={styles.txDetailDivider} />

        {/* Detail rows */}
        <View style={styles.txDetailRows}>
          {detailRows.map(({ icon: RowIcon, label, value }) => (
            <View key={label} style={styles.txDetailRow}>
              <View style={styles.txDetailRowLeft}>
                <RowIcon size={13} color={MonikeColors.inkMuted} strokeWidth={1.8} />
                <Text style={styles.txDetailRowLabel}>{label}</Text>
              </View>
              <Text style={styles.txDetailRowValue}>{value}</Text>
            </View>
          ))}
          <View style={styles.txDetailRow}>
            <View style={styles.txDetailRowLeft}>
              <View style={[styles.txDetailTypeDot, { backgroundColor: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }]} />
              <Text style={styles.txDetailRowLabel}>Type</Text>
            </View>
            <Text style={[styles.txDetailRowValue, { color: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }]}>
              {credit ? 'Credit' : 'Debit'}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TransactionRow({
  transaction,
  showSeparator = true,
  onPress,
}: {
  transaction: Transaction;
  showSeparator?: boolean;
  onPress?: () => void;
}) {
  const credit  = transaction.amount > 0;
  const Icon    = categoryIcon(transaction.category);

  return (
    <PressScale onPress={onPress}>
      <View style={[styles.transactionRow, !showSeparator && styles.transactionRowLast]}>
        <View style={[styles.transactionIconCircle, { backgroundColor: credit ? '#4FC3F714' : MonikeColors.bgElevated }]}>
          <Icon
            size={14}
            color={credit ? MonikeColors.signalBlue : MonikeColors.inkSecondary}
            strokeWidth={1.8}
          />
        </View>
        <View style={styles.transactionCenter}>
          <Text numberOfLines={1} style={styles.transactionDescription}>
            {transaction.description}
          </Text>
          <View style={styles.transactionMetaRow}>
            <Text style={styles.transactionDate}>{transaction.date}</Text>
            {transaction.time ? <Text style={styles.transactionTimeMeta}>{transaction.time}</Text> : null}
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, { color: credit ? MonikeColors.signalBlue : MonikeColors.inkPrimary }]}>
            {moneySign(transaction.amount)}₦{formatNaira(transaction.amount)}
          </Text>
          <Text style={styles.transactionCategory}>{transaction.category}</Text>
        </View>
      </View>
    </PressScale>
  );
}

// ─── Recent Transactions ──────────────────────────────────────────────────────

function RecentTransactions({ transactions, onSeeAll }: { transactions: Transaction[]; onSeeAll?: () => void }) {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const openDetail = useCallback((t: Transaction) => {
    setSelectedTransaction(t);
    setDetailVisible(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
  }, []);

  return (
    <>
      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT</Text>
          <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See all</Text>
            <ChevronRight size={11} color={MonikeColors.accentPulse} strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={styles.transactionsCard}>
          {transactions.length > 0 ? transactions.map((t, i) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              showSeparator={i < Math.min(transactions.length, 5) - 1}
              onPress={() => openDetail(t)}
            />
          )) : (
            <Text style={styles.emptyStateText}>No recent transactions returned by the backend.</Text>
          )}
        </View>
      </View>

      <TransactionDetailModal
        transaction={selectedTransaction}
        visible={detailVisible}
        onClose={closeDetail}
      />
    </>
  );
}

// ─── Day Detail Sheet ─────────────────────────────────────────────────────────

function DayDetailSheet({
  day,
  visible,
  onClose,
}: {
  day: DaySpend | null;
  visible: boolean;
  onClose: () => void;
}) {
  const sheetY  = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const { data: logEntry, error: logError, isLoading: logLoading } = useSWR<LogEntry>(
    day ? `/log/${day.isoDate}` : null,
    apiFetch,
  );

  const categoryTotals = useMemo(() => logEntryToCategoryTotals(logEntry), [logEntry]);
  const totalDebit = logEntry?.total_debit ?? day?.total ?? 0;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetY,  { toValue: 0,   speed: 14, bounciness: 4, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetY,  { toValue: 420, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [opacity, sheetY, visible]);

  if (!day) return null;

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

        <Text style={styles.sheetDebit}>₦{formatNaira(totalDebit)}</Text>

        {logLoading ? <Text style={styles.sheetStatusText}>Loading daily breakdown…</Text> : null}
        {logError ? <Text style={styles.sheetStatusText}>No daily log breakdown for this date.</Text> : null}

        {categoryTotals.length > 0 ? (
          <>
            <View style={styles.breakdownTrack}>
              {categoryTotals.map((item) => (
                <View
                  key={item.category}
                  style={[
                    styles.breakdownSegment,
                    { backgroundColor: item.color, flex: item.total, minWidth: 4 },
                  ]}
                />
              ))}
            </View>
            <View style={styles.breakdownLabels}>
              {categoryTotals.map((item) => (
                <Text key={item.category} style={styles.breakdownLabel}>
                  {item.category.split(' ')[0]} · ₦{formatNaira(item.total)}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        <ScrollView style={styles.sheetTransactionList}>
          {categoryTotals.length > 0 ? categoryTotals.map((item, index) => (
            <TransactionRow
              key={item.category}
              transaction={{
                id: `${day.isoDate}-${item.category}`,
                description: `${item.category} spend`,
                category: item.category,
                date: day.date,
                day: day.day,
                time: logEntry?.source ?? 'backend',
                amount: -item.total,
              }}
              showSeparator={index < categoryTotals.length - 1}
            />
          )) : (
            <Text style={styles.emptyStateText}>No category-level detail available for this day.</Text>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

function DashboardScreen({
  prefetchedDashboard,
  prefetchedSummary,
  onNavigateToTransactions,
}: {
  prefetchedDashboard?: DashboardResponse;
  prefetchedSummary?: SummaryResponse;
  onNavigateToTransactions?: () => void;
}) {
  const [selectedDay,  setSelectedDay]  = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const { data: dashboard, error: dashboardError, isLoading: dashboardLoading } =
    useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: summary } = useSWR<SummaryResponse>(currentSummaryPath(), apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);

  const sevenDaySpend = useMemo(() => dashboard ? dashboardBarsToDays(dashboard) : [], [dashboard]);
  const recentTransactions = useMemo(() => dashboard ? dashboardTransactionsToRows(dashboard) : [], [dashboard]);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  const resolvedDashboard = dashboard ?? prefetchedDashboard;
  const resolvedSummary   = summary   ?? prefetchedSummary;

  if (!resolvedDashboard) {
    return null;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + BottomTabInset + 28 },
          ]}
        >
          <TopBar onSettings={() => {}} />
          {dashboardLoading ? <Text style={styles.screenStatusText}>Loading dashboard…</Text> : null}
          {dashboardError ? <Text style={styles.screenStatusText}>Unable to load dashboard: {dashboardError.message}</Text> : null}
          {dashboard ? (
            <>
              <HeroCard dashboard={resolvedDashboard} summary={resolvedSummary} />
              {/* Coach placed immediately after hero — most actionable context */}
              <FinancialCoachCard dashboard={resolvedDashboard} prediction={prediction} summary={resolvedSummary} />
              <QuickActions />
              <SevenDayChart days={sevenDaySpend} averageDailySpend={resolvedDashboard.avg_daily} onSelectDay={openDay} />
              <SpendHealthStrip dashboard={resolvedDashboard} summary={resolvedSummary} />
              <RecentTransactions transactions={recentTransactions} onSeeAll={onNavigateToTransactions} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="home" />
      <DayDetailSheet day={selectedDay} visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

// ─── Root Export ──────────────────────────────────────────────────────────────

export default function MonikeHome() {
  const { data: dashboard, isLoading: dashboardLoading } = useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: summary } = useSWR<SummaryResponse>(currentSummaryPath(), apiFetch);

  const dataReady = !dashboardLoading && !!dashboard;

  const [showSplash, setShowSplash] = useState(!splashAlreadyShown);

  const handleSplashComplete = useCallback(() => {
    splashAlreadyShown = true;
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} dataReady={dataReady} />;
  }

  return <DashboardScreen prefetchedDashboard={dashboard} prefetchedSummary={summary} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Splash ──────────────────────────────────────────────────────────────────
  splashRoot: {
    flex: 1,
    width: '100%',
    minHeight: 844,
    backgroundColor: MonikeColors.bgVoid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashCenter: { alignItems: 'center', justifyContent: 'center' },
  logoUnit: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 14 },
  monikeGlyph: {
    width: 24, height: 24,
    borderWidth: 1, borderColor: MonikeColors.accentPulse,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center', justifyContent: 'center',
  },
  glyphArrow: {
    width: 15, height: 15,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  glyphArrowStem:      { position: 'absolute', bottom: 2,  width: 1,  height: 12, backgroundColor: MonikeColors.accentPulse },
  glyphArrowHead:      { position: 'absolute', top: 2,     width: 7,  height: 1,  backgroundColor: MonikeColors.accentPulse },
  glyphArrowHeadLeft:  { transform: [{ translateX: -2.5 }, { rotate: '-45deg' }] },
  glyphArrowHeadRight: { transform: [{ translateX:  2.5 }, { rotate: '45deg'  }] },
  wordmark: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: 4.32,
  },
  tagline: {
    marginTop: 8,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 1.54,
    textTransform: 'uppercase',
  },
  splashProgressTrack: {
    width: 200, height: 1.5, marginTop: 40,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  splashProgressFill: { height: 1.5, backgroundColor: MonikeColors.accentPulse },
  loadingStatus: {
    marginTop: 18,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },

  // ── Layout ───────────────────────────────────────────────────────────────────
  root:    { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea:{ flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 4, gap: 16 },
  screenStatusText: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
  },

  // ── Hero Card ────────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  heroGreetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heroGreetingLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '600',
  },
  heroMonthBadge: {
    marginTop: 3,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  heroAmountBlock: {
    marginBottom: 20,
  },
  heroSpentLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  heroNairaPrefix: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '700',
    marginRight: 3,
    marginBottom: 6,
  },
  heroAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1,
  },
  heroAmountDec: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  comparisonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  comparisonChipText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '500',
  },
  budgetSection: { marginBottom: 18 },
  budgetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetLabelLeft:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11 },
  budgetLabelRight: { color: MonikeColors.inkMuted,     fontFamily: Fonts.mono, fontSize: 11 },
  budgetBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  budgetBarFill: { height: 3, borderRadius: 2 },
  budgetNoneText: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    marginBottom: 18,
  },
  heroStatPills: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingVertical: 12,
  },
  heroStatPill: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatPillDivider: { width: 1, height: 26, backgroundColor: MonikeColors.inkGhost },
  heroStatPillValue: { color: MonikeColors.inkPrimary,   fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  heroStatPillLabel: { color: MonikeColors.inkMuted,     fontFamily: Fonts.sans, fontSize: 9,  textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Risk Badge ───────────────────────────────────────────────────────────────
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    letterSpacing: 0.6,
  },

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickActionItem: { alignItems: 'center', width: 76, gap: 7 },
  quickActionCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionCircleActive: {
    backgroundColor: '#00E67610',
  },
  quickActionLabel: { fontFamily: Fonts.sans, fontSize: 10, letterSpacing: 0.2 },

  // ── Financial Coach ──────────────────────────────────────────────────────────
  coachCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  coachAccentBar: {
    height: 2,
    width: '100%',
  },
  coachBody: {
    paddingTop: 14,
    paddingBottom: 14,
  },
  coachHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  coachIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coachHeaderCopy: { flex: 1, minWidth: 0 },
  coachEyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  coachTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  coachRiskPill: {
    minWidth: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    flexShrink: 0,
  },
  coachRiskPct:  { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '800' },
  coachRiskLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 8, textTransform: 'uppercase', marginTop: 1 },
  coachMetricRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: MonikeColors.bgElevated,
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  coachMetricBlock: { flex: 1, gap: 3 },
  coachMetricLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  coachMetricValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  coachMetricDivider: { width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 8 },
  coachTipsStack: { gap: 6, paddingHorizontal: 16 },
  coachTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  coachTipBullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7, flexShrink: 0 },
  coachTipText: { flex: 1, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },

  // ── Chart ─────────────────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionValue:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  chartSection:  { gap: 12 },
  chartCard: {
    height: 128,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingRight: 40,
    position: 'relative',
  },
  chartColumn: { width: 32, alignItems: 'center', gap: 6 },
  barSlot: {
    height: 100, width: 28,
    justifyContent: 'flex-end', alignItems: 'center',
  },
  dashboardBar: {
    width: 20,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#00E67650',
  },
  dashboardBarHigh:  { backgroundColor: '#FF3D3D70' },
  dashboardBarToday: {
    backgroundColor: MonikeColors.accentNeon,
    width: 20,
  },
  chartDayLabel:      { color: MonikeColors.inkGhost,    fontFamily: Fonts.mono, fontSize: 10 },
  chartDayLabelToday: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  todayDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: MonikeColors.accentPulse,
    marginTop: -2,
  },
  thresholdLine: {
    position: 'absolute',
    left: 0, right: 40,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFB30050',
  },
  thresholdLabel: {
    position: 'absolute',
    right: 0,
    color: '#FFB300',
    fontFamily: Fonts.mono,
    fontSize: 9,
    opacity: 0.75,
  },

  // ── Health Strip ─────────────────────────────────────────────────────────────
  healthStrip: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  healthBlock: { flex: 1, gap: 5 },
  healthDivider: { width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 10, marginTop: 2 },
  healthLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  healthPacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  healthPaceText: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  healthSubtext: { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 9, lineHeight: 12 },
  streakValue: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700' },
  savedValue:  { color: MonikeColors.signalBlue,  fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  dotRow:      { flexDirection: 'row', gap: 4 },
  streakDot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: MonikeColors.inkGhost },
  streakDotFilled: { backgroundColor: MonikeColors.accentPulse },

  // ── Transaction Detail Modal ──────────────────────────────────────────────────
  txDetailSheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: MonikeColors.bgOverlay,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingHorizontal: ScreenPadding,
    paddingTop: 10,
    paddingBottom: 40,
  },
  txDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 6,
  },
  txDetailIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  txDetailClose: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: MonikeColors.bgElevated,
  },
  txDetailAmount: {
    fontFamily: Fonts.mono,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  txDetailDescription: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 22,
  },
  txDetailDivider: {
    height: 1,
    backgroundColor: MonikeColors.inkGhost,
    marginBottom: 18,
  },
  txDetailRows: { gap: 16 },
  txDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txDetailRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txDetailRowLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  txDetailRowValue: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '500',
  },
  txDetailTypeDot: {
    width: 8, height: 8, borderRadius: 4,
  },

  // ── Transactions ─────────────────────────────────────────────────────────────
  recentSection: { gap: 12 },
  seeAllButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText:   { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 11 },
  transactionsCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  emptyStateText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    padding: 16,
  },
  transactionRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${MonikeColors.inkGhost}50`,
  },
  transactionRowLast: { borderBottomWidth: 0 },
  transactionIconCircle: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  transactionCenter:    { flex: 1, minWidth: 0 },
  transactionDescription: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  transactionDate:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  transactionTimeMeta: { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 11 },
  transactionRight:  { alignItems: 'flex-end', marginLeft: 8, flexShrink: 0 },
  transactionAmount: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '600' },
  transactionCategory: { marginTop: 3, color: MonikeColors.inkGhost, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.2 },

  // ── Day Sheet ────────────────────────────────────────────────────────────────
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000000A0' },
  daySheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: 520,
    backgroundColor: MonikeColors.bgOverlay,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingHorizontal: ScreenPadding,
    paddingTop: 10,
    paddingBottom: 26,
  },
  sheetHandle: {
    width: 32, height: 3, borderRadius: 2,
    backgroundColor: `${MonikeColors.inkMuted}60`,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle:     { color: MonikeColors.inkPrimary,   fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetSubtitle:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans,    fontSize: 12, marginTop: 2 },
  sheetDebit:     { color: MonikeColors.signalRed,    fontFamily: Fonts.mono,    fontSize: 30, fontWeight: '700', marginTop: 12, marginBottom: 2 },
  sheetStatusText:{ color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginTop: 8 },
  breakdownTrack: {
    height: 6, borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: MonikeColors.bgElevated,
  },
  breakdownSegment: { height: 6 },
  breakdownLabels:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 12 },
  breakdownLabel:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  sheetTransactionList: { maxHeight: 260 },
});
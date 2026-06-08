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

function getGreetingEmoji(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '☀️';
  if (hour < 17) return '👋';
  return '🌙';
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
    HIGH:   { color: MonikeColors.signalRed,   backgroundColor: '#FF3D3D22', borderColor: '#FF3D3D44' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30022', borderColor: '#FFB30044' },
    LOW:    { color: MonikeColors.accentPulse, backgroundColor: '#00E67622', borderColor: '#00E67644' },
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
      toValue: 0.94,
      duration: 60,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 7,
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
  const logoScale      = useRef(new Animated.Value(0.95)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(4)).current;
  const progress       = useRef(new Animated.Value(0)).current;
  const shimmer        = useRef(new Animated.Value(0)).current;
  const statusOpacity  = useRef(new Animated.Value(1)).current;
  const exitOpacity    = useRef(new Animated.Value(1)).current;
  const exitScale      = useRef(new Animated.Value(1)).current;
  const halo           = useRef(new Animated.Value(0)).current;
  const [statusIndex, setStatusIndex] = useState(0);

  // Track whether the minimum animation time has elapsed
  const minTimeElapsed = useRef(false);
  // Track whether we've already triggered exit (avoid double-firing)
  const exitTriggered = useRef(false);

  const triggerExit = useCallback(() => {
    if (exitTriggered.current) return;
    exitTriggered.current = true;
    // Snap progress to 100% then exit
    Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(exitScale,   { toValue: 1.04, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(onComplete);
    });
  }, [exitOpacity, exitScale, onComplete, progress]);

  // When dataReady flips true, check if min time has passed
  useEffect(() => {
    if (dataReady && minTimeElapsed.current) {
      triggerExit();
    }
  }, [dataReady, triggerExit]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );

    // Progress bar animates to 0.88 (88%) over 1400ms — holds there waiting for data
    const progressAnimation = Animated.timing(progress, {
      toValue: 0.88,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    const shimmerAnimation = Animated.timing(shimmer, {
      toValue: 1,
      duration: 1500,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    haloLoop.start();
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoScale,   { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
    shimmerAnimation.start();

    // Cycle status text
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

    // Minimum display time: 1500ms
    timers.push(
      setTimeout(() => {
        minTimeElapsed.current = true;
        // If data already arrived while we were animating, exit now
        if (dataReady) {
          triggerExit();
        }
        // Otherwise we hold at 88% until dataReady flips true (handled in the useEffect above)
      }, 1500),
    );

    return () => {
      timers.forEach(clearTimeout);
      haloLoop.stop();
      progressAnimation.stop();
      shimmerAnimation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  return (
    <View style={styles.splashRoot}>
      <Animated.View
        style={[
          styles.splashHalo,
          {
            opacity:   halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
          },
        ]}
      />
      {/* Scan lines */}
      <View style={[styles.scanLine, styles.scanLineOne]} />
      <View style={[styles.scanLine, styles.scanLineTwo]} />
      <View style={[styles.scanLine, styles.scanLineThree]} />
      {/* Corner brackets */}
      <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
      <View style={[styles.cornerBracket, styles.cornerTopRight]} />
      <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
      <View style={[styles.cornerBracket, styles.cornerBottomRight]} />

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
          >
            <Animated.View
              style={[
                styles.progressShimmer,
                { transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 200] }) }] },
              ]}
            >
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentPulse }]} />
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentNeon }]} />
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentPulse }]} />
            </Animated.View>
          </Animated.View>
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
  const comparisonSymbol = pctChange >= 0 ? '▲' : '▼';
  const comparisonColor = pctChange >= 0 ? MonikeColors.signalRed : MonikeColors.accentPulse;

  useEffect(() => {
    const listener = animatedAmount.addListener(({ value }) => setDisplayValue(value));
    animatedAmount.setValue(0);
    Animated.timing(animatedAmount, {
      toValue: dashboard.total_spent_this_month,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animatedAmount.removeListener(listener);
  }, [animatedAmount, dashboard.total_spent_this_month]);

  const greeting = getGreeting();
  const emoji    = getGreetingEmoji();

  return (
    <View style={styles.heroCard}>
      {/* Diagonal texture */}
      <View pointerEvents="none" style={styles.diagonalTexture}>
        {Array.from({ length: 28 }).map((_, i) => (
          <View key={i} style={[styles.textureLine, { left: i * 14 - 120 }]} />
        ))}
      </View>

      {/* Top row */}
      <View style={styles.heroTopRow}>
        <Text style={styles.heroGreeting}>{greeting}, Chijioke {emoji}</Text>
        <Text style={styles.heroMonth}>{dashboard.month_label}</Text>
      </View>

      {/* Label */}
      <Text style={styles.heroLabel}>TOTAL SPENT THIS MONTH</Text>

      {/* Animated amount */}
      <View style={styles.heroAmountRow}>
        <Text style={styles.heroNairaPrefix}>₦</Text>
        <Text style={styles.heroAmount}>{formatNaira(displayValue, 2)}</Text>
      </View>

      {/* Comparison */}
      <Text style={[styles.comparisonText, { color: comparisonColor }]}>
        {comparisonSymbol} {Math.abs(pctChange).toFixed(1)}% vs last month
      </Text>

      {monthlyBudget > 0 ? (
        <>
          <View style={styles.budgetBarTrack}>
            <Animated.View
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
          <Text style={styles.budgetLabel}>
            ₦{formatNaira(dashboard.total_spent_this_month)} of ₦{formatNaira(monthlyBudget)} budget • {Math.round(budgetProgress * 100)}% used
          </Text>
        </>
      ) : (
        <Text style={styles.budgetLabel}>No monthly budget configured in backend settings</Text>
      )}

      <View style={styles.heroSeparator} />

      {/* Mini stats */}
      <View style={styles.heroStatsRow}>
        <View style={styles.heroStatColumn}>
          <Text style={styles.heroStatValue}>₦{formatNaira(dashboard.avg_daily)}</Text>
          <Text style={styles.heroStatLabel}>daily avg</Text>
        </View>
        <View style={styles.verticalSeparator} />
        <View style={styles.heroStatColumn}>
          <Text style={styles.heroStatValue}>{dashboard.high_spend_days}</Text>
          <Text style={styles.heroStatLabel}>high-spend days</Text>
        </View>
        <View style={styles.verticalSeparator} />
        <View style={styles.heroStatColumn}>
          <RiskBadge risk={normalizeRisk(dashboard.prediction_risk)} />
          <Text style={styles.heroStatLabel}>tomorrow · {Math.round(dashboard.prediction_prob * 100)}%</Text>
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
  const Icon = risk === 'HIGH' ? AlertTriangle : risk === 'MEDIUM' || isAccelerating ? Zap : CheckCircle2;

  const headline = risk === 'HIGH'
    ? 'Do not just track today — protect your cash.'
    : risk === 'MEDIUM'
    ? 'Spend intentionally today before the pattern gets expensive.'
    : 'You have room today. Use it to build savings, not impulse spend.';

  const primaryAction = risk === 'HIGH'
    ? `Keep today under ₦${formatNaira(safeDailyLimit)} and delay non-urgent transfers.`
    : risk === 'MEDIUM'
    ? `Make ₦${formatNaira(safeDailyLimit)} your soft cap, then stop spending when you hit it.`
    : `Move a small win to savings first; then keep spending below ₦${formatNaira(safeDailyLimit)}.`;

  const advisorTips = prediction?.advisor_tips?.filter(Boolean).slice(0, 2) ?? [];
  const fallbackTips = [
    primaryAction,
    'Pick one avoidable transaction category today and pause it until tomorrow.',
  ];
  const tips = advisorTips.length > 0 ? advisorTips : fallbackTips;

  return (
    <View style={[styles.coachCard, { borderColor: `${accent}55` }]}>
      <View style={styles.coachHeaderRow}>
        <View style={[styles.coachIconCircle, { backgroundColor: `${accent}22` }]}>
          <Icon size={18} color={accent} strokeWidth={2} />
        </View>
        <View style={styles.coachHeaderCopy}>
          <Text style={styles.coachEyebrow}>ML MONEY MOVE</Text>
          <Text style={styles.coachTitle}>{headline}</Text>
        </View>
        <View style={[styles.coachRiskPill, { borderColor: `${accent}66`, backgroundColor: `${accent}18` }]}>
          <Text style={[styles.coachRiskText, { color: accent }]}>{probability}%</Text>
          <Text style={styles.coachRiskLabel}>risk</Text>
        </View>
      </View>

      <Text style={styles.coachPrimaryAction}>{primaryAction}</Text>

      <View style={styles.coachPlanRow}>
        <View style={styles.coachMetricBlock}>
          <Text style={styles.coachMetricLabel}>Safe today</Text>
          <Text style={styles.coachMetricValue}>₦{formatNaira(safeDailyLimit)}</Text>
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

      <View style={styles.coachTipsStack}>
        {tips.map((tip, index) => (
          <View key={`${tip}-${index}`} style={styles.coachTipRow}>
            <View style={[styles.coachTipBullet, { backgroundColor: accent }]} />
            <Text style={styles.coachTipText}>{tip}</Text>
          </View>
        ))}
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
  }[] = [
    { Icon: BarChart2,  label: 'Summary' },
    { Icon: PieChart,   label: 'Categories' },
    { Icon: Zap,        label: 'Predict', active: true },
    { Icon: PlusCircle, label: 'Log Spend' },
  ];

  return (
    <View style={styles.quickActionsRow}>
      {actions.map(({ Icon, label, active }) => (
        <PressScale key={label} style={styles.quickActionItem}>
          <View style={[styles.quickActionCircle, active && styles.predictGlow]}>
            <Icon
              size={20}
              color={active ? MonikeColors.accentPulse : MonikeColors.inkSecondary}
              strokeWidth={1.8}
            />
          </View>
          <Text style={[styles.quickActionLabel, active && styles.quickActionLabelActive]}>
            {label}
          </Text>
        </PressScale>
      ))}
    </View>
  );
}

// ─── 7-Day Chart ──────────────────────────────────────────────────────────────

function SevenDayChart({ days, averageDailySpend, onSelectDay }: { days: DaySpend[]; averageDailySpend: number; onSelectDay: (day: DaySpend) => void }) {
  // useNativeDriver: false — height is a layout property, must run on JS thread
  const animations = useRef<Animated.Value[]>([]).current;
  while (animations.length < days.length) animations.push(new Animated.Value(0));
  if (animations.length > days.length) animations.splice(days.length);
  // Separate value for the opacity pulse — runs on native thread, no layout props
  const todayPulse = useRef(new Animated.Value(1)).current;

  const chartLimit = Math.max(averageDailySpend, ...days.map((d) => d.limit), 1);
  const maxSpend  = Math.max(...days.map((d) => d.total), chartLimit);
  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
  const limitTop  = 100 - (chartLimit / maxSpend) * 100;
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    animations.forEach((animation) => animation.setValue(0));
    // JS-driver stagger for bar heights
    Animated.stagger(
      50,
      animations.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height requires JS driver
        }),
      ),
    ).start();

    // Native-driver loop for today's bar opacity — completely separate Animated.Value
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(todayPulse, { toValue: 0.72, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(todayPulse, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animations, days, todayPulse]);

  return (
    <View style={styles.chartSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
        <Text style={styles.sectionValue}>₦{formatNaira(weekTotal)} for week</Text>
      </View>
      <View style={styles.chartCard}>
        {/* Threshold line */}
        <View style={[styles.thresholdLine, { top: `${limitTop}%` as any }]} />
        <Text style={[styles.thresholdLabel, { top: `${Math.max(limitTop - 6, 0)}%` as any }]}>avg daily</Text>

        {days.map((day, index) => {
          const isHigh  = day.risk === 'HIGH';
          const isToday = day.isoDate === todayIso;

          // JS-driver: animates height (layout property — cannot use native driver)
          const animatedHeight = animations[index].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 86 * (day.total / maxSpend)],
          });

          const bar = isToday ? (
            <Animated.View style={{ opacity: todayPulse }}>
              <Animated.View
                style={[
                  styles.dashboardBar,
                  styles.dashboardBarToday,
                  { height: animatedHeight },
                ]}
              />
            </Animated.View>
          ) : (
            <Animated.View
              style={[
                styles.dashboardBar,
                isHigh && styles.dashboardBarHigh,
                { height: animatedHeight },
              ]}
            />
          );

          return (
            <PressScale key={day.isoDate} style={styles.chartColumn} onPress={() => onSelectDay(day)}>
              <View style={styles.barSlot}>{bar}</View>
              <Text style={[styles.chartDayLabel, isToday && styles.chartDayLabelToday]}>
                {day.day}
              </Text>
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
  const budgetText = summary?.budget_limit ? `₦${formatNaira(summary.budget_limit)} budget` : 'budget not set';

  const paceColor = {
    Ahead:      MonikeColors.signalRed,
    Over:       MonikeColors.signalAmber,
    'On Track': MonikeColors.accentPulse,
  }[paceStatus];

  const PaceIcon = {
    Ahead:      TrendingUp,
    Over:       TrendingUp,
    'On Track': Minus,
  }[paceStatus];

  return (
    <View style={styles.healthStrip}>
      {/* PACE */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>PACE</Text>
        <View style={styles.healthValueRow}>
          <PaceIcon size={14} color={paceColor} strokeWidth={2} />
          <Text style={[styles.healthValue, { color: paceColor }]}>{paceStatus}</Text>
        </View>
        <Text style={styles.healthMonoSubtext}>
          Day {daysElapsed} of {daysInMonth}, {budgetText}
        </Text>
      </View>

      <View style={styles.healthDivider} />

      {/* STREAK */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>STREAK</Text>
        <Text style={styles.streakValue}>{dashboard.spend_health.streak_days} days</Text>
        <Text style={styles.healthSubtext}>under threshold</Text>
        <View style={styles.dotRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.streakDot, i < Math.min(dashboard.spend_health.streak_days, 5) && styles.streakDotFilled]} />
          ))}
        </View>
      </View>

      <View style={styles.healthDivider} />

      {/* SAVED */}
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>SAVED</Text>
        <Text style={styles.savedValue}>₦{formatNaira(dashboard.spend_health.saved_this_month)}</Text>
        <Text style={styles.healthSubtext}>moved to savings</Text>
      </View>
    </View>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TransactionRow({ transaction, showSeparator = true }: { transaction: Transaction; showSeparator?: boolean }) {
  const credit  = transaction.amount > 0;
  const Icon    = categoryIcon(transaction.category);

  return (
    <PressScale>
      <View style={[styles.transactionRow, !showSeparator && styles.transactionRowLast]}>
        <View style={styles.transactionIconCircle}>
          <Icon
            size={16}
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
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{transaction.category}</Text>
            </View>
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, { color: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }]}>
            {moneySign(transaction.amount)}₦{formatNaira(transaction.amount)}
          </Text>
          <Text style={styles.transactionTime}>{transaction.time}</Text>
        </View>
      </View>
    </PressScale>
  );
}

// ─── Recent Transactions ──────────────────────────────────────────────────────

function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  return (
    <View style={styles.recentSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>RECENT</Text>
        <Pressable>
          <Text style={styles.seeAllText}>See all →</Text>
        </Pressable>
      </View>
      <View style={styles.transactionsCard}>
        {transactions.length > 0 ? transactions.map((t, i) => (
          <TransactionRow
            key={t.id}
            transaction={t}
            showSeparator={i < transactions.length - 1}
          />
        )) : (
          <Text style={styles.emptyStateText}>No recent transactions returned by the backend.</Text>
        )}
      </View>
    </View>
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
        Animated.spring(sheetY,  { toValue: 0,   speed: 14, bounciness: 6, useNativeDriver: true }),
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
        {logError ? <Text style={styles.sheetStatusText}>No daily log breakdown returned for this date.</Text> : null}

        {/* Category breakdown bar */}
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
}: {
  prefetchedDashboard?: DashboardResponse;
  prefetchedSummary?: SummaryResponse;
}) {
  const [selectedDay,  setSelectedDay]  = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();

  // useSWR will return prefetched data immediately if you pass initialData,
  // or just use the props directly since MonikeHome already fetched them
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
    return
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + BottomTabInset + 22 },
          ]}
        >
          <TopBar onSettings={() => {}} />
          {dashboardLoading ? <Text style={styles.screenStatusText}>Loading dashboard from backend…</Text> : null}
          {dashboardError ? <Text style={styles.screenStatusText}>Unable to load backend dashboard: {dashboardError.message}</Text> : null}
          {dashboard ? (
            <>
              <HeroCard dashboard={resolvedDashboard} summary={resolvedSummary} />
              <FinancialCoachCard dashboard={resolvedDashboard} prediction={prediction} summary={resolvedSummary} />
              <QuickActions />
              <SevenDayChart days={sevenDaySpend} averageDailySpend={resolvedDashboard.avg_daily} onSelectDay={openDay} />
              <SpendHealthStrip dashboard={resolvedDashboard} summary={resolvedSummary} />
              <RecentTransactions transactions={recentTransactions} />
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

  // Module-level guard — once true, never show splash again this app session
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
    overflow: 'hidden',
  },
  splashHalo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#00E6760A',
    shadowColor: MonikeColors.accentPulse,
    shadowOpacity: 0.08,
    shadowRadius: 80,
  },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.015)' },
  scanLineOne:   { top: '25%' },
  scanLineTwo:   { top: '50%' },
  scanLineThree: { top: '75%' },
  cornerBracket: { position: 'absolute', width: 16, height: 16, borderColor: MonikeColors.inkGhost },
  cornerTopLeft:    { top: 20, left: 20,   borderTopWidth: 1,    borderLeftWidth: 1  },
  cornerTopRight:   { top: 20, right: 20,  borderTopWidth: 1,    borderRightWidth: 1 },
  cornerBottomLeft: { bottom: 20, left: 20,  borderBottomWidth: 1, borderLeftWidth: 1  },
  cornerBottomRight:{ bottom: 20, right: 20, borderBottomWidth: 1, borderRightWidth: 1 },
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
    width: 200, height: 2, marginTop: 40,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  splashProgressFill: { height: 2, overflow: 'hidden', backgroundColor: MonikeColors.accentPulse },
  progressShimmer:    { height: 2, width: 120, flexDirection: 'row' },
  shimmerStop:        { flex: 1, height: 2 },
  loadingStatus: {
    marginTop: 16,
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

  // ── Top Bar ──────────────────────────────────────────────────────────────────
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  topBrand: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.6,
  },
  bellButton: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  alertDot: {
    position: 'absolute',
    top: 6, right: 6,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: MonikeColors.accentPulse,
  },

  // ── Hero Card ────────────────────────────────────────────────────────────────
  heroCard: {
    overflow: 'hidden',
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  diagonalTexture: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 1 },
  textureLine: {
    position: 'absolute',
    top: -80,
    width: 1,
    height: 360,
    backgroundColor: 'rgba(255,255,255,0.012)',
    transform: [{ rotate: '45deg' }],
  },
  heroTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroGreeting: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600' },
  heroMonth:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  heroLabel: {
    marginTop: 14,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroAmountRow: { marginTop: 6, flexDirection: 'row', alignItems: 'baseline' },
  heroNairaPrefix: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    marginRight: 4,
  },
  heroAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '700',
    letterSpacing: -0.76,
  },
  comparisonText: { marginTop: 2, color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 12 },

  // Budget progress bar (improvement)
  budgetBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: MonikeColors.bgElevated,
    marginTop: 10,
    overflow: 'hidden',
  },
  budgetBarFill: { height: 3, borderRadius: 2 },
  budgetLabel: {
    marginTop: 5,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
  },

  heroSeparator: {
    height: 1,
    backgroundColor: MonikeColors.inkGhost,
    opacity: 0.5,
    marginTop: 16,
    marginBottom: 14,
  },
  heroStatsRow:  { flexDirection: 'row', alignItems: 'center' },
  heroStatColumn:{ flex: 1, alignItems: 'center', gap: 5 },
  heroStatValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  heroStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  verticalSeparator: { width: 1, height: 32, backgroundColor: MonikeColors.inkGhost },

  // ── Risk Badge ───────────────────────────────────────────────────────────────
  riskBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    alignSelf: 'center',
  },

  // ── Financial Coach ──────────────────────────────────────────────────────────
  coachCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderRadius: CardRadius,
    padding: 16,
    gap: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
  coachHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  coachIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachHeaderCopy: { flex: 1, minWidth: 0 },
  coachEyebrow: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  coachTitle: {
    marginTop: 3,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  coachRiskPill: {
    minWidth: 58,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  coachRiskText: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '800' },
  coachRiskLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, textTransform: 'uppercase' },
  coachPrimaryAction: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  coachPlanRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  coachMetricBlock: { flex: 1, gap: 4 },
  coachMetricLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, textTransform: 'uppercase' },
  coachMetricValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  coachMetricDivider: { width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 8 },
  coachTipsStack: { gap: 8 },
  coachTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  coachTipBullet: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  coachTipText: { flex: 1, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickActionItem: { alignItems: 'center', width: 76, gap: 7 },
  quickActionCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1, borderColor: MonikeColors.inkGhost,
    alignItems: 'center', justifyContent: 'center',
  },
  predictGlow: {
    shadowColor: MonikeColors.accentPulse,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    borderColor: '#00E67644',
  },
  quickActionLabel:       { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 10 },
  quickActionLabelActive: { color: MonikeColors.accentPulse },

  // ── Chart ─────────────────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '600', letterSpacing: 0.44, textTransform: 'uppercase' },
  sectionValue:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  chartSection:  { gap: 10 },
  chartCard: {
    height: 124,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingRight: 58,
    position: 'relative',
  },
  chartColumn: { width: 32, alignItems: 'center', gap: 7 },
  barSlot:     { height: 100, width: 28, justifyContent: 'flex-end', alignItems: 'center' },
  dashboardBar: {
    width: 24,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: MonikeColors.accentPulse,
  },
  dashboardBarHigh:  { backgroundColor: MonikeColors.signalRed },
  dashboardBarToday: {
    borderTopWidth: 2,
    borderTopColor: MonikeColors.accentNeon,
    backgroundColor: MonikeColors.accentNeon,
  },
  chartDayLabel:      { color: MonikeColors.inkMuted,    fontFamily: Fonts.mono, fontSize: 10 },
  chartDayLabelToday: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  thresholdLine: {
    position: 'absolute',
    left: 0, right: 58,
    borderTopWidth: 1,
    borderStyle: 'dotted',
    borderColor: MonikeColors.signalAmber,
    opacity: 0.65,
  },
  thresholdLabel: {
    position: 'absolute',
    right: 0,
    color: MonikeColors.signalAmber,
    fontFamily: Fonts.mono,
    fontSize: 9,
  },

  // ── Health Strip ─────────────────────────────────────────────────────────────
  healthStrip: {
    minHeight: 92,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  healthBlock:      { flex: 1, gap: 4 },
  healthDivider:    { width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 9 },
  healthLabel:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  healthValueRow:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  healthValue:      { fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700' },
  healthMonoSubtext:{ color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, lineHeight: 12 },
  streakValue:      { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  savedValue:       { color: MonikeColors.signalBlue,  fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  healthSubtext:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  dotRow:           { flexDirection: 'row', gap: 4, marginTop: 1 },
  streakDot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: MonikeColors.inkGhost },
  streakDotFilled:  { backgroundColor: MonikeColors.accentPulse },

  // ── Transactions ─────────────────────────────────────────────────────────────
  recentSection:    { gap: 10 },
  seeAllText:       { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 11 },
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
    padding: 14,
  },
  transactionRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A30404D',
  },
  transactionRowLast: { borderBottomWidth: 0 },
  transactionIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  transactionCenter:    { flex: 1, minWidth: 0 },
  transactionDescription: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 156,
  },
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  transactionDate:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  categoryPill: {
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 2,
    maxWidth: 96,
  },
  categoryPillText:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  transactionRight:  { alignItems: 'flex-end', minWidth: 86 },
  transactionAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  transactionTime:   { marginTop: 5, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },

  // ── Day Sheet ────────────────────────────────────────────────────────────────
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
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
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: MonikeColors.inkMuted,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle:     { color: MonikeColors.inkPrimary,   fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetSubtitle:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans,    fontSize: 12, marginTop: 2 },
  sheetDebit:     { color: MonikeColors.signalRed,    fontFamily: Fonts.mono,    fontSize: 32, fontWeight: '700', marginTop: 10 },
  sheetStatusText:{ color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginTop: 8 },
  breakdownTrack: {
    height: 10, borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: MonikeColors.bgElevated,
  },
  breakdownSegment: { height: 10 },
  breakdownLabels:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 10 },
  breakdownLabel:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  sheetTransactionList: { maxHeight: 260 },
});
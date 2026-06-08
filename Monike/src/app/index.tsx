import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  TouchableOpacity,
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
  ArrowDownLeft,
  Repeat2,
  Landmark,
  Banknote,
  MoreHorizontal,
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
  | 'Family Transfer'
  | 'Savings'
  | 'Loan Repayment'
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

type CategoryItem = {
  category: string;
  total: number;
  share_pct: number;
  transaction_count: number;
  avg_per_transaction: number;
};

type CategoryResponse = {
  period_label: string;
  total_real_spend: number;
  items: CategoryItem[];
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
  'Family Transfer': 'Family Transfer',
  Savings: 'Savings',
  'Loan Repayment': 'Loan Repayment',
};

// Category card colors — each gets a distinct bg/text pairing like the reference image
const CATEGORY_CARD_STYLES: Record<string, { bg: string; text: string; sub: string }> = {
  'Person-to-Person': { bg: '#7B61FF',   text: '#FFFFFF',   sub: '#FFFFFFB0' },
  'POS Purchase':     { bg: '#4FC3F7',   text: '#0A1628',   sub: '#0A162890' },
  'Data':             { bg: '#00E676',   text: '#0A1628',   sub: '#0A162890' },
  'Airtime':          { bg: '#FFB300',   text: '#0A1628',   sub: '#0A162890' },
  'Family Transfer':  { bg: '#FF7043',   text: '#FFFFFF',   sub: '#FFFFFFB0' },
  'Savings':          { bg: '#26C6DA',   text: '#0A1628',   sub: '#0A162890' },
  'Food & Dining':    { bg: '#EF5350',   text: '#FFFFFF',   sub: '#FFFFFFB0' },
  'Loan Repayment':   { bg: '#AB47BC',   text: '#FFFFFF',   sub: '#FFFFFFB0' },
  'Other':            { bg: '#37474F',   text: '#ECEFF1',   sub: '#B0BEC5' },
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

function currentCategoryPath() {
  const today = new Date();
  return `/categories?period=month`;
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
    'Family Transfer':  Landmark,
    'Savings':          Banknote,
    'Loan Repayment':   Repeat2,
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

// ─── Donut Gauge ──────────────────────────────────────────────────────────────
// Draws a semicircular gauge like the 47% arc in the reference image
function DonutGauge({ pct, risk }: { pct: number; risk: Risk }) {
  const animPct = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    const listener = animPct.addListener(({ value }) => setDisplayPct(value));
    animPct.setValue(0);
    Animated.timing(animPct, {
      toValue: pct,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animPct.removeListener(listener);
  }, [animPct, pct]);

  // Semicircle: we approximate with a View-based approach
  // Using border-radius trick for a half-circle arc
  const clampedPct = Math.max(0, Math.min(100, displayPct));
  const fillColor = risk === 'HIGH'
    ? MonikeColors.signalRed
    : risk === 'MEDIUM'
    ? MonikeColors.signalAmber
    : '#7B61FF';

  // Rotation: 0% = -180deg (left), 100% = 0deg (right)
  // The "fill" rotates a half-circle mask
  const rotation = -180 + (clampedPct / 100) * 180;

  return (
    <View style={styles.gaugeContainer}>
      {/* Track arc (gray) */}
      <View style={styles.gaugeTrack} />
      {/* Fill arc (colored) — clip mask trick */}
      <View style={styles.gaugeClip} pointerEvents="none">
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              backgroundColor: fillColor,
              transform: [{ rotate: `${rotation}deg` }],
            },
          ]}
        />
      </View>
      {/* Center label */}
      <View style={styles.gaugeCenter}>
        <Text style={[styles.gaugePct, { color: fillColor }]}>{Math.round(clampedPct)}%</Text>
      </View>
    </View>
  );
}

// ─── Expenses Section ─────────────────────────────────────────────────────────
// Mirrors "My Expenses" block: big amount + donut + category pill scroll

function ExpensesSection({
  dashboard,
  categoryData,
}: {
  dashboard: DashboardResponse;
  categoryData?: CategoryResponse;
}) {
  const risk = normalizeRisk(dashboard.prediction_risk);
  const totalSpend = dashboard.total_spent_this_month;

  // Build category items from /category endpoint or fall back to empty
  const items = categoryData?.items ?? [];
  const totalForPct = categoryData?.total_real_spend ?? totalSpend;

  // Animated amount counter
  const animatedAmount = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const listener = animatedAmount.addListener(({ value }) => setDisplayValue(value));
    animatedAmount.setValue(0);
    Animated.timing(animatedAmount, {
      toValue: totalSpend,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animatedAmount.removeListener(listener);
  }, [animatedAmount, totalSpend]);

  const formatted = formatNaira(displayValue, 2);
  const [intPart, decPart = '00'] = formatted.split('.');

  // Top category % for the gauge
  const topPct = items.length > 0 ? items[0].share_pct : 0;

  return (
    <View style={styles.expensesSection}>
      {/* Header row */}
      <View style={styles.expensesHeaderRow}>
        <View style={styles.expensesLeft}>
          <Text style={styles.expensesSectionLabel}>My Expenses</Text>
          <View style={styles.expensesAmountRow}>
            <Text style={styles.expensesCurrencySymbol}>₦</Text>
            <Text style={styles.expensesAmount}>{intPart}</Text>
            <Text style={styles.expensesAmountDec}>.{decPart}</Text>
          </View>
        </View>
        {/* Donut gauge */}
        <DonutGauge pct={topPct > 0 ? topPct : Math.min((totalSpend / 100000) * 100, 99)} risk={risk} />
      </View>

      {/* Category pill cards — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryCardScroll}
      >
        {/* Add card */}
        <PressScale>
          <View style={styles.categoryAddCard}>
            <Text style={styles.categoryAddPlus}>+</Text>
          </View>
        </PressScale>

        {items.length > 0 ? items.map((item) => {
          const cardStyle = CATEGORY_CARD_STYLES[item.category] ?? CATEGORY_CARD_STYLES['Other'];
          return (
            <PressScale key={item.category}>
              <View style={[styles.categoryCard, { backgroundColor: cardStyle.bg }]}>
                <Text style={[styles.categoryCardName, { color: cardStyle.text }]} numberOfLines={1}>
                  {item.category}
                </Text>
                <Text style={[styles.categoryCardAmount, { color: cardStyle.text }]}>
                  ₦{formatNaira(item.total)}
                </Text>
                <Text style={[styles.categoryCardPct, { color: cardStyle.sub }]}>
                  {item.share_pct.toFixed(0)}%
                </Text>
              </View>
            </PressScale>
          );
        }) : (
          // Fallback skeleton cards when no category data
          ['Transfers', 'POS', 'Data'].map((name, i) => (
            <View key={name} style={[styles.categoryCard, { backgroundColor: categoryPalette[i] + '22', borderWidth: 1, borderColor: categoryPalette[i] + '40' }]}>
              <Text style={[styles.categoryCardName, { color: MonikeColors.inkSecondary }]}>{name}</Text>
              <Text style={[styles.categoryCardAmount, { color: MonikeColors.inkMuted }]}>—</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Income / Credit Section ──────────────────────────────────────────────────
// Shows credit transactions as "income" in a horizontal scroll of cards

function IncomeSection({ transactions }: { transactions: Transaction[] }) {
  const credits = transactions.filter((t) => t.amount > 0);
  const totalCredit = credits.reduce((s, t) => s + t.amount, 0);

  const Icon = (category: Category) => {
    const map: Record<Category, React.ComponentType<any>> = {
      'Person-to-Person': Users,
      'POS Purchase':     ShoppingBag,
      'Data':             Wifi,
      'Airtime':          Phone,
      'Food & Dining':    Utensils,
      'Online Payment':   Globe,
      'Electricity':      Zap,
      'Family Transfer':  Landmark,
      'Savings':          Banknote,
      'Loan Repayment':   Repeat2,
      'Other':            CreditCard,
    };
    return map[category] ?? CreditCard;
  };

  return (
    <View style={styles.incomeSection}>
      <View style={styles.incomeSectionHeader}>
        <Text style={styles.incomeSectionLabel}>My Income</Text>
        {totalCredit > 0 && (
          <Text style={styles.incomeTotalText}>₦{formatNaira(totalCredit)}</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.incomeCardScroll}
      >
        {credits.length > 0 ? credits.map((t) => {
          const CardIcon = Icon(t.category);
          return (
            <View
        style={{
          backgroundColor: MonikeColors.grey,
          padding: 20,
          borderRadius: 20,
          marginRight: 15,
          width: 150,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              borderColor: "#666",
              borderWidth: 1,
              borderRadius: 50,
              padding: 5,
              alignSelf: "flex-start",
            }}
          >
            <CardIcon style={{size: 16, color: "#fff" }} />

          </View>
          <TouchableOpacity onPress={() => {}}>
            <MoreHorizontal size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={{ color: "#fff" }}>{t.category}</Text>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>
          ${t.amount}.
          <Text style={{ fontSize: 12, fontWeight: "400" }}>00</Text>
        </Text>
      </View>
          );
        }) : (
          <View style={styles.incomeEmptyState}>
            <Text style={styles.incomeEmptyText}>No credits this period</Text>
          </View>
        )}
      </ScrollView>
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

        <View style={styles.txDetailHeader}>
          <View style={[styles.txDetailIconWrap, { backgroundColor: credit ? '#4FC3F714' : MonikeColors.bgElevated }]}>
            <Icon size={22} color={credit ? MonikeColors.signalBlue : MonikeColors.inkSecondary} strokeWidth={1.6} />
          </View>
          <Pressable style={styles.txDetailClose} onPress={onClose} hitSlop={12}>
            <X size={16} color={MonikeColors.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <Text style={[styles.txDetailAmount, { color: amountColor }]}>
          {moneySign(transaction.amount)}₦{formatNaira(transaction.amount)}
        </Text>

        <Text style={styles.txDetailDescription}>{transaction.description}</Text>

        <View style={styles.txDetailDivider} />

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
  const Icon = categoryIcon(transaction.category);

  return (
    <PressScale onPress={onPress}>
      <View style={[
        styles.transactionRow,
        showSeparator && styles.transactionRowSeparator,
      ]}>
        {/* Icon circle — flat dark, no tinting */}
        <View style={styles.transactionIconCircle}>
          <Icon size={24} color="#ffffff" strokeWidth={1.8} />
        </View>

        {/* Center: description + date */}
        <View style={styles.transactionCenter}>
          <Text numberOfLines={1} style={styles.transactionDescription}>
            {transaction.category}
          </Text>
          <Text style={styles.transactionDate}>{transaction.date}</Text>
        </View>

        {/* Amount — always white */}
        <Text style={styles.transactionAmount}>
          {transaction.amount > 0 ? '+' : ''}₦{formatNaira(Math.abs(transaction.amount))}
        </Text>
      </View>
    </PressScale>
  );
}

// ─── Spending List ────────────────────────────────────────────────────────────
// "July Spending" section — all transactions listed

function SpendingList({
  transactions,
  monthLabel,
  onSeeAll,
  onSelectTransaction,
}: {
  transactions: Transaction[];
  monthLabel: string;
  onSeeAll?: () => void;
  onSelectTransaction: (t: Transaction) => void;
}) {
  // Show month label (e.g. "June Spending")
  const monthName = monthLabel.split(' ')[0] ?? 'Recent';

  return (
    <View style={styles.spendingSection}>
      <View style={styles.spendingSectionHeader}>
        <Text style={styles.spendingMonthLabel}>
          {monthName} <Text style={styles.spendingMonthBold}>Spending</Text>
        </Text>
        
      </View>

      <View style={styles.spendingList}>
        {transactions.length > 0 ? transactions.slice(0, 5).map((t, i) => (
          <TransactionRow
            key={t.id}
            transaction={t}
            showSeparator={i < transactions.length - 1}
            onPress={() => onSelectTransaction(t)}
          />
        )) : (
          <Text style={styles.emptyStateText}>No transactions this period.</Text>
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
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [txDetailVisible, setTxDetailVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const { data: dashboard, error: dashboardError, isLoading: dashboardLoading } =
    useSWR<DashboardResponse>('/dashboard', apiFetch);
  const { data: summary } = useSWR<SummaryResponse>(currentSummaryPath(), apiFetch);
  const { data: prediction } = useSWR<PredictionResponse>('/prediction', apiFetch);
  const { data: categoryData } = useSWR<CategoryResponse>(currentCategoryPath(), apiFetch);

  const recentTransactions = useMemo(
    () => (dashboard ? dashboardTransactionsToRows(dashboard) : []),
    [dashboard],
  );

  const sevenDaySpend = useMemo(
    () => (dashboard ? dashboardBarsToDays(dashboard) : []),
    [dashboard],
  );

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  const openTxDetail = useCallback((t: Transaction) => {
    setSelectedTransaction(t);
    setTxDetailVisible(true);
  }, []);

  const resolvedDashboard = dashboard ?? prefetchedDashboard;
  const resolvedSummary   = summary   ?? prefetchedSummary;

  if (!resolvedDashboard) return null;

  const risk = normalizeRisk(resolvedDashboard.prediction_risk);
  const pctChange = resolvedDashboard.pct_change_vs_last_month;
  const isUp = pctChange >= 0;
  const comparisonColor = isUp ? MonikeColors.signalRed : MonikeColors.accentPulse;

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
          {/* ── Top bar ───────────────────────────────────────────────── */}
          <View style={styles.topBar}>
            {/* Left: avatar + greeting */}
            <View style={styles.topBarLeft}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>CU</Text>
              </View>
              <View>
                <Text style={styles.topBarGreeting}>{getGreeting()}, Chijioke</Text>
                <Text style={styles.topBarSubtitle}>Your Budget</Text>
              </View>
            </View>
            {/* Right: transactions button */}
            <Pressable style={styles.transactionsButton} onPress={onNavigateToTransactions}>
              <Text style={styles.transactionsButtonText}>My Transactions</Text>
            </Pressable>
          </View>

          {/* ── Expenses + Category ─────────────────────────────────────── */}
          <ExpensesSection dashboard={resolvedDashboard} categoryData={categoryData} />

          {/* ── Income / Credits ─────────────────────────────────────────── */}
          <IncomeSection transactions={recentTransactions} />

          {/* ── Spending list ─────────────────────────────────────────────── */}
          <SpendingList
            transactions={recentTransactions}
            monthLabel={resolvedDashboard.month_label}
            onSeeAll={onNavigateToTransactions}
            onSelectTransaction={openTxDetail}
          />
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="home" />

      <DayDetailSheet
        day={selectedDay}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />

      <TransactionDetailModal
        transaction={selectedTransaction}
        visible={txDetailVisible}
        onClose={() => setTxDetailVisible(false)}
      />
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
    flex: 1, width: '100%', minHeight: 844,
    backgroundColor: MonikeColors.bgVoid,
    alignItems: 'center', justifyContent: 'center',
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
  transactionRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 13,
  paddingVertical: 12,
},
transactionRowSeparator: {
  borderBottomWidth: 0.5,
  borderBottomColor: MonikeColors.bgVoid,   // or MonikeColors.bgElevated if it matches this
},
transactionIconCircle: {
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: '#1C1C1E',    // flat dark, no conditional tinting
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
},
transactionCenter: {
  flex: 1,
  minWidth: 0,
},
transactionDescription: {
  fontSize: 18,
  fontWeight: '800',
  color: '#FFFFFF',              // was MonikeColors.inkPrimary — check it's true white
  letterSpacing: -0.2,
},
transactionDate: {
  fontSize: 12,
  color: '#636366',              // darker muted, not inkMuted if that's too light
  marginTop: 2,
},
transactionAmount: {
  fontSize: 15,
  fontWeight: '500',
  color: '#FFFFFF',              // always white — no credit/debit color split
  letterSpacing: -0.3,
  flexShrink: 0,
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
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content:  { paddingHorizontal: ScreenPadding, paddingTop: 8, gap: 24 },

  // ── Top Bar ───────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#7B61FF30',
    borderWidth: 1.5,
    borderColor: '#7B61FF60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#7B61FF',
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  topBarGreeting: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 14,
  },
  topBarSubtitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  transactionsButton: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  transactionsButtonText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Donut Gauge ───────────────────────────────────────────────────────────────
  gaugeContainer: {
    width: 90,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  gaugeTrack: {
    position: 'absolute',
    top: 0,
    width: 80,
    height: 40,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderWidth: 7,
    borderBottomWidth: 0,
    borderColor: MonikeColors.bgElevated,
  },
  gaugeClip: {
    position: 'absolute',
    top: 0,
    width: 80,
    height: 40,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    overflow: 'hidden',
  },
  gaugeFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    transformOrigin: 'center bottom',
  },
  gaugeCenter: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
  },
  gaugePct: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Expenses Section ──────────────────────────────────────────────────────────
  expensesSection: { gap: 16 },
  expensesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  expensesLeft: { flex: 1 },
  expensesSectionLabel: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  expensesAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  expensesCurrencySymbol: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    marginRight: 2,
  },
  expensesAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 42,
    fontWeight: '700',
    lineHeight: 50,
    letterSpacing: -1.5,
  },
  expensesAmountDec: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 7,
    letterSpacing: -0.3,
  },

  // Category pill scroll
  categoryCardScroll: {
    paddingLeft: 2,
    paddingRight: ScreenPadding,
    gap: 10,
    alignItems: 'flex-start',
  },
  categoryAddCard: {
    width: 68,
    height: 92,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: MonikeColors.inkGhost,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryAddPlus: {
    color: MonikeColors.inkMuted,
    fontSize: 24,
    fontFamily: Fonts.heading,
    fontWeight: '300',
  },
  categoryCard: {
    width: 100,
    height: 92,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  categoryCardName: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  categoryCardAmount: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  categoryCardPct: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Income Section ────────────────────────────────────────────────────────────
  incomeSection: { gap: 12 },
  incomeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incomeSectionLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  incomeTotalText: {
    color: MonikeColors.signalBlue ?? '#4FC3F7',
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '600',
  },
  incomeCardScroll: {
    gap: 10,
    paddingRight: ScreenPadding,
  },
  incomeCard: {
    width: 130,
    height: 100,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  incomeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incomeCardIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#4FC3F714',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeCardLabel: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 15,
  },
  incomeCardAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  incomeCardAmountDec: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  incomeEmptyState: {
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  incomeEmptyText: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },

  // ── Spending List ─────────────────────────────────────────────────────────────
  spendingSection: { gap: 14, paddingBottom: 8 },
  spendingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spendingMonthLabel: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '400',
  },
  spendingMonthBold: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  spendingList: {
    borderRadius: CardRadius,
    color: MonikeColors.inkPrimary,
    borderWidth: 1,
    borderColor: MonikeColors.bgVoid,
  },

  // ── Transaction Row ───────────────────────────────────────────────────────────
 
  transactionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  transactionTimeMeta: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },
  
  emptyStateText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    padding: 16,
  },

  // ── Risk Badge ────────────────────────────────────────────────────────────────
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

  // ── Sheets & Modals ───────────────────────────────────────────────────────────
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000000A0' },

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

  // ── Day Sheet ──────────────────────────────────────────────────────────────────
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
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
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
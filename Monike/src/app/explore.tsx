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
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Globe,
  Phone,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
  Wifi,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type Category =
  | 'Person-to-Person'
  | 'POS Purchase'
  | 'Data'
  | 'Airtime'
  | 'Food & Dining'
  | 'Online Payment'
  | 'Electricity'
  | 'Other';

type Risk = 'HIGH' | 'MEDIUM' | 'LOW';

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
  total: number;
  limit: number;
  risk: Risk;
};

type CalendarDay = {
  day: number;
  date: string;
  total: number | null;
  isToday?: boolean;
  risk: Risk;
};

type WeekBreakdown = {
  week: number;
  range: string;
  spend: number;
  txns: number;
};

type MonthSummary = {
  date: Date;
  realSpend: number;
  previousSpend: number;
  credits: number;
  budget: number;
  spendToDate: number;
  weekly: WeekBreakdown[];
  daily: CalendarDay[];
  dayDetails: Transaction[];
  previous7: number;
  last7: number;
};

const DAILY_PACE_REFERENCE = 64733;
const TODAY = new Date(2026, 5, 6);
const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

const juneDailyTotals = [
  38400, 51600, 1200, 40900, 88115.5, 27900, 20800,
  62100, 18450, 32800, 47300, 29200, 74200, 47300,
  12800, 53600, 61200, 22100, 38600, 94650, 18400,
  30600, 44200, 58800, 73000, 12950, 26800, 41600,
  33500, 52100,
];

const summaries: MonthSummary[] = [
  {
    date: new Date(2026, 5, 1),
    realSpend: 342115.5,
    previousSpend: 304373.22,
    credits: 180000,
    budget: 500000,
    spendToDate: 342115.5,
    weekly: [
      { week: 1, range: 'Jun 1–7', spend: 342115.5, txns: 42 },
      { week: 2, range: 'Jun 8–14', spend: 307350, txns: 37 },
      { week: 3, range: 'Jun 15–21', spend: 298350, txns: 34 },
      { week: 4, range: 'Jun 22–28', spend: 298350, txns: 31 },
      { week: 5, range: 'Jun 29–30', spend: 85600, txns: 9 },
    ],
    daily: juneDailyTotals.map((total, index) => ({
      day: index + 1,
      date: `${index + 1} Jun`,
      total,
      isToday: index + 1 === TODAY.getDate(),
      risk: total > 70000 ? 'HIGH' : total > 30000 ? 'MEDIUM' : 'LOW',
    })),
    dayDetails: [
      { id: 'jun-5-1', description: 'Chicken Republic Lekki', category: 'Food & Dining', date: '5 Jun', day: 'Fri', time: '13:06', amount: -7800 },
      { id: 'jun-5-2', description: 'Uber Trip to Yaba', category: 'POS Purchase', date: '5 Jun', day: 'Fri', time: '08:42', amount: -4200 },
      { id: 'jun-5-3', description: 'EKEDC electricity token', category: 'Electricity', date: '5 Jun', day: 'Fri', time: '19:48', amount: -25000 },
      { id: 'jun-5-4', description: 'Airtime recharge', category: 'Airtime', date: '5 Jun', day: 'Fri', time: '16:02', amount: -3000 },
      { id: 'jun-5-5', description: 'Market supplies transfer', category: 'Person-to-Person', date: '5 Jun', day: 'Fri', time: '10:20', amount: -48115.5 },
    ],
    previous7: 304373,
    last7: 342115.5,
  },
  {
    date: new Date(2026, 4, 1),
    realSpend: 304373.22,
    previousSpend: 318900,
    credits: 245000,
    budget: 500000,
    spendToDate: 304373.22,
    weekly: [
      { week: 1, range: 'May 1–7', spend: 66200, txns: 24 },
      { week: 2, range: 'May 8–14', spend: 81250, txns: 29 },
      { week: 3, range: 'May 15–21', spend: 57900, txns: 21 },
      { week: 4, range: 'May 22–28', spend: 74200, txns: 26 },
      { week: 5, range: 'May 29–31', spend: 24823.22, txns: 8 },
    ],
    daily: Array.from({ length: 31 }).map((_, index) => {
      const total = [8200, 14000, 19600, 32000, 5200, 0, 9800][index % 7] + (index % 4) * 3500;
      return {
        day: index + 1,
        date: `${index + 1} May`,
        total,
        risk: total > 40000 ? 'HIGH' : total > 18000 ? 'MEDIUM' : 'LOW',
      };
    }),
    dayDetails: [],
    previous7: 66200,
    last7: 70400,
  },
];

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function monthLabel(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function categoryIcon(category: Category) {
  const map: Record<Category, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    'Person-to-Person': Users,
    'POS Purchase': ShoppingBag,
    Data: Wifi,
    Airtime: Phone,
    'Food & Dining': Utensils,
    'Online Payment': Globe,
    Electricity: Zap,
    Other: CreditCard,
  };
  return map[category] ?? CreditCard;
}

function PressScale({
  children,
  disabled,
  style,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: 0.94,
      duration: 60,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { opacity: disabled ? 0.46 : 1, transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function TopBar() {
  return (
    <View style={styles.topBar}>
      <PressScale style={styles.avatarButton}>
        <Text style={styles.avatarText}>C</Text>
      </PressScale>
      <Text style={styles.topBrand}>MONIKE</Text>
      <PressScale style={styles.bellButton}>
        <Bell size={20} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
        <View style={styles.notificationDot} />
      </PressScale>
    </View>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function MonthSelector({ canGoForward, label, onAttemptFuture, onNext, onPrevious }: {
  canGoForward: boolean;
  label: string;
  onAttemptFuture: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <View style={styles.monthSelector}>
      <PressScale style={styles.monthChevron} onPress={onPrevious}>
        <ChevronLeft size={24} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
      </PressScale>
      <Text style={styles.monthLabel}>{label}</Text>
      <PressScale style={styles.monthChevron} onPress={canGoForward ? onNext : onAttemptFuture}>
        <ChevronRight size={24} color={canGoForward ? MonikeColors.inkSecondary : MonikeColors.inkGhost} strokeWidth={1.8} />
      </PressScale>
    </View>
  );
}

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
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: fade, transform: [{ translateY: lift }] }] }>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

function CountUpAmount({ value }: { value: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    progress.setValue(0);
    const listener = progress.addListener(({ value: animatedValue }) => {
      setDisplayValue(value * animatedValue);
    });
    Animated.timing(progress, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(listener);
  }, [progress, value]);

  return (
    <Text style={styles.heroAmount}>
      <Text style={styles.heroCurrency}>₦</Text>{formatNaira(displayValue, 2)}
    </Text>
  );
}

function HeroSpendBlock({ summary }: { summary: MonthSummary }) {
  const change = ((summary.realSpend - summary.previousSpend) / summary.previousSpend) * 100;
  const paceDelta = summary.spendToDate - DAILY_PACE_REFERENCE * TODAY.getDate();
  const isUnderPace = paceDelta < 0;

  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroLabel}>REAL SPENDING</Text>
      <CountUpAmount value={summary.realSpend} />
      <View style={styles.heroMetricRow}>
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }] }>
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </Text>
          <Text style={styles.heroMetricLabel}>vs {MONTHS[summary.date.getMonth() - 1]?.slice(0, 3) ?? 'May'} {summary.date.getFullYear()}</Text>
        </View>
        <View style={styles.heroMetricDivider} />
        <View style={styles.heroMetricBlock}>
          <Text style={[styles.heroMetricValue, { color: isUnderPace ? MonikeColors.accentPulse : MonikeColors.signalRed }] }>
            ₦{formatNaira(paceDelta)}
          </Text>
          <Text style={styles.heroMetricLabel}>{isUnderPace ? 'under pace' : 'over daily pace'}</Text>
        </View>
      </View>
    </View>
  );
}

function BudgetProgress({ summary }: { summary: MonthSummary }) {
  const ratio = Math.min(summary.realSpend / summary.budget, 1.08);
  const fillPercent = Math.min(ratio * 100, 100);
  const fillColor = ratio >= 0.9 ? MonikeColors.signalRed : ratio >= 0.7 ? MonikeColors.signalAmber : MonikeColors.accentPulse;
  const daysRemaining = Math.max(30 - TODAY.getDate(), 0);
  const dailyToStay = Math.max((summary.budget - summary.realSpend) / Math.max(daysRemaining, 1), 0);

  return (
    <View style={styles.budgetBlock}>
      <View style={styles.budgetScaleRow}>
        <Text style={styles.budgetScale}>₦0</Text>
        <Text style={styles.budgetScale}>₦{formatNaira(summary.budget)}</Text>
      </View>
      <View style={styles.progressMarkerLayer}>
        <View style={[styles.progressAmountMarker, { left: `${Math.max(0, Math.min(fillPercent - 8, 82))}%` }] }>
          <Text style={[styles.progressAmountLabel, { color: fillColor }]}>₦{formatNaira(summary.realSpend)}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fillPercent}%`, backgroundColor: fillColor }] }>
          <View style={styles.progressTick} />
        </View>
      </View>
      <View style={styles.budgetFootRow}>
        <Text style={styles.budgetFootLeft}>{daysRemaining} days remaining</Text>
        <Text style={styles.budgetFootRight}>₦{formatNaira(dailyToStay)}/day to stay on track</Text>
      </View>
    </View>
  );
}

function SpendBar({ color, delay, label, percent }: { color: string; delay: number; label?: string; percent: number }) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    width.setValue(0);
    Animated.timing(width, {
      toValue: percent,
      delay,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [delay, percent, width]);

  return (
    <View style={styles.weekBarTrack}>
      <Animated.View style={[styles.weekBarFill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }] }>
        {percent > 42 && label ? <Text style={styles.weekBarLabel}>₦{label}</Text> : null}
      </Animated.View>
    </View>
  );
}

function WeeklyBreakdown({ summary }: { summary: MonthSummary }) {
  const maxSpend = Math.max(...summary.weekly.map((week) => week.spend));
  const avgSpend = summary.weekly.reduce((sum, week) => sum + week.spend, 0) / summary.weekly.length;

  return (
    <View style={styles.sectionGap}>
      <SectionTitle>WEEKLY BREAKDOWN</SectionTitle>
      <View style={styles.weeklyCard}>
        {summary.weekly.map((week, index) => {
          const aboveAvg = (week.spend - avgSpend) / avgSpend;
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

function KeyStatsCard({ summary }: { summary: MonthSummary }) {
  const spendDays = summary.daily.filter((day) => day.total !== null);
  const dailyAvg = summary.realSpend / 30;
  const peakDay = spendDays.reduce((peak, day) => ((day.total ?? 0) > (peak.total ?? 0) ? day : peak), spendDays[0]);
  const lowestDay = spendDays.reduce((low, day) => ((day.total ?? 0) < (low.total ?? 0) ? day : low), spendDays[0]);
  const highDays = spendDays.filter((day) => (day.total ?? 0) > dailyAvg).slice(0, 8).map((day) => day.day);
  const netFlow = summary.credits - summary.realSpend;

  return (
    <View style={styles.sectionGap}>
      <View style={styles.statsCard}>
        <StatCell title="DAILY AVG" value={`₦${formatNaira(dailyAvg)}`} />
        <StatCell title="PEAK DAY" value={`₦${formatNaira(peakDay.total ?? 0)}`} color={MonikeColors.signalRed} sub={peakDay.date} />
        <StatCell title="HIGH-SPEND DAYS" value={`${highDays.length} / 30`} color={MonikeColors.signalRed} wideDots highDays={highDays} />
        <StatCell title="LOWEST DAY" value={`₦${formatNaira(lowestDay.total ?? 0)}`} color={MonikeColors.accentPulse} sub={lowestDay.date} />
        <StatCell title="TOTAL CREDITS" value={`₦${formatNaira(summary.credits)}`} color={MonikeColors.signalBlue} sub="money in" />
        <StatCell title="NET FLOW" value={`${netFlow < 0 ? '−' : '+'}₦${formatNaira(netFlow)}`} color={netFlow < 0 ? MonikeColors.signalRed : MonikeColors.accentPulse} sub="in − out" />
      </View>
    </View>
  );
}

function StatCell({ color = MonikeColors.inkPrimary, highDays, sub, title, value, wideDots }: {
  color?: string;
  highDays?: number[];
  sub?: string;
  title: string;
  value: string;
  wideDots?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      {wideDots ? (
        <View style={styles.highDotGrid}>
          {Array.from({ length: 30 }).map((_, index) => (
            <View key={index} style={[styles.highDot, highDays?.includes(index + 1) && styles.highDotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SevenDayComparison({ summary }: { summary: MonthSummary }) {
  const max = Math.max(summary.previous7, summary.last7);
  const change = ((summary.last7 - summary.previous7) / summary.previous7) * 100;
  const difference = summary.last7 - summary.previous7;
  const directionColor = difference > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const BarIcon = difference > 0 ? TrendingUp : TrendingDown;

  return (
    <View style={styles.sectionGap}>
      <SectionTitle>HOW DID LAST WEEK LAND?</SectionTitle>
      <View style={styles.comparisonCard}>
        <View style={styles.comparisonBars}>
          <ComparisonBar color={MonikeColors.accentPulse} height={(summary.previous7 / max) * 120} label="prev 7d" value={summary.previous7} />
          <View style={[styles.changeBadge, { borderColor: directionColor }] }>
            <BarIcon size={14} color={directionColor} strokeWidth={2} />
            <Text style={[styles.changeBadgeText, { color: directionColor }]}>{Math.abs(change).toFixed(1)}%</Text>
          </View>
          <ComparisonBar color={directionColor} height={(summary.last7 / max) * 120} label="last 7d" value={summary.last7} />
        </View>
        <Text style={styles.comparisonFooter}>₦{formatNaira(difference)} {difference > 0 ? 'more' : 'less'} than the week before</Text>
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

function DailyHeatmap({ onSelectDay, summary }: { onSelectDay: (day: DaySpend) => void; summary: MonthSummary }) {
  const firstDayOffset = (new Date(summary.date.getFullYear(), summary.date.getMonth(), 1).getDay() + 6) % 7;
  const cells = [...Array.from({ length: firstDayOffset }).map(() => null), ...summary.daily];
  const threshold = summary.realSpend / 30;

  return (
    <View style={styles.sectionGap}>
      <SectionTitle>DAILY HEATMAP — {MONTHS[summary.date.getMonth()]}</SectionTitle>
      <View style={styles.heatmapCard}>
        <View style={styles.weekdayRow}>
          {DOW.map((day) => <Text key={day} style={styles.weekdayLabel}>{day}</Text>)}
        </View>
        <View style={styles.heatGrid}>
          {cells.map((cell, index) => {
            if (!cell) return <View key={`blank-${index}`} style={styles.heatCellBlank} />;
            const { backgroundColor, textColor, showDot } = heatColor(cell.total, threshold);
            return (
              <Pressable
                key={cell.date}
                onPress={() => onSelectDay({ day: DOW[index % 7], date: cell.date, total: cell.total ?? 0, limit: threshold, risk: cell.risk })}
                style={[styles.heatCell, { backgroundColor }, cell.isToday && styles.todayCell]}
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

function heatColor(total: number | null, threshold: number) {
  if (total === null) return { backgroundColor: MonikeColors.bgElevated, textColor: MonikeColors.inkMuted, showDot: false };
  if (total === 0) return { backgroundColor: MonikeColors.bgElevated, textColor: MonikeColors.inkSecondary, showDot: true };
  if (total < threshold * 0.5) return { backgroundColor: 'rgba(0,230,118,0.3)', textColor: MonikeColors.inkPrimary, showDot: false };
  if (total <= threshold) return { backgroundColor: 'rgba(255,179,0,0.4)', textColor: MonikeColors.inkPrimary, showDot: false };
  if (total <= threshold * 2) return { backgroundColor: 'rgba(255,61,61,0.5)', textColor: MonikeColors.inkPrimary, showDot: false };
  return { backgroundColor: 'rgba(255,61,61,0.85)', textColor: MonikeColors.bgVoid, showDot: false };
}

function RiskBadge({ risk }: { risk: Risk }) {
  const palette = {
    HIGH: { color: MonikeColors.signalRed, backgroundColor: '#FF3D3D22', borderColor: '#FF3D3D44' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30022', borderColor: '#FFB30044' },
    LOW: { color: MonikeColors.accentPulse, backgroundColor: '#00E67622', borderColor: '#00E67644' },
  }[risk];

  return <Text style={[styles.riskBadge, palette]}>{risk}</Text>;
}

function TransactionRow({ transaction, showSeparator = true }: { transaction: Transaction; showSeparator?: boolean }) {
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
        <Text style={[styles.transactionAmount, { color: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }] }>
          {credit ? '+' : '−'}₦{formatNaira(transaction.amount)}
        </Text>
        <Text style={styles.transactionTime}>{transaction.time}</Text>
      </View>
    </View>
  );
}

function DayDetailSheet({ day, summary, visible, onClose }: {
  day: DaySpend | null;
  summary: MonthSummary;
  visible: boolean;
  onClose: () => void;
}) {
  const sheetY = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const transactions = summary.dayDetails.filter((transaction) => transaction.date === day?.date);
  const fallbackTransaction = day ? [{
    id: `auto-${day.date}`,
    description: 'Aggregated card and transfer spend',
    category: 'Other' as const,
    date: day.date,
    day: day.day,
    time: '23:59',
    amount: -day.total,
  }] : [];
  const detailTransactions = transactions.length ? transactions : fallbackTransaction;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sheetY, { toValue: visible ? 0 : 420, duration: visible ? 220 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [opacity, sheetY, visible]);

  if (!day) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropTint, { opacity }]} />
      </Pressable>
      <Animated.View style={[styles.daySheet, { transform: [{ translateY: sheetY }] }] }>
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
          {detailTransactions.map((transaction, index) => (
            <TransactionRow key={transaction.id} transaction={transaction} showSeparator={index < detailTransactions.length - 1} />
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

export default function MonthlySummaryScreen() {
  const [summaryIndex, setSummaryIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const summary = summaries[summaryIndex];
  const canGoForward = summaryIndex > 0;

  const transitionTo = useCallback((nextIndex: number, direction: 1 | -1) => {
    if (nextIndex < 0 || nextIndex >= summaries.length) return;
    Animated.timing(slide, {
      toValue: -direction * 420,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setSummaryIndex(nextIndex);
      slide.setValue(direction * 420);
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [slide]);

  const attemptFuture = useCallback(() => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1500);
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -48) {
        if (canGoForward) transitionTo(summaryIndex - 1, -1);
        else attemptFuture();
      }
      if (gesture.dx > 48) transitionTo(summaryIndex + 1, 1);
    },
  }), [attemptFuture, canGoForward, summaryIndex, transitionTo]);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.stickyHeader}>
          <TopBar />
          <MonthSelector
            canGoForward={canGoForward}
            label={monthLabel(summary.date)}
            onAttemptFuture={attemptFuture}
            onNext={() => transitionTo(summaryIndex - 1, -1)}
            onPrevious={() => transitionTo(summaryIndex + 1, 1)}
          />
        </View>
        <ScrollView
          {...panResponder.panHandlers}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 24 }]}
        >
          <Animated.View style={[styles.monthContent, { transform: [{ translateX: slide }] }] }>
            <HeroSpendBlock summary={summary} />
            <BudgetProgress summary={summary} />
            <WeeklyBreakdown summary={summary} />
            <KeyStatsCard summary={summary} />
            <SevenDayComparison summary={summary} />
            <DailyHeatmap summary={summary} onSelectDay={openDay} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      <Toast message="No data yet" visible={toastVisible} />
      <BottomNavigation activeRoute="explore" />
      <DayDetailSheet day={selectedDay} summary={summary} visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  stickyHeader: {
    zIndex: 5,
    backgroundColor: MonikeColors.bgVoid,
    paddingHorizontal: ScreenPadding,
    paddingBottom: 8,
  },
  content: {
    paddingHorizontal: ScreenPadding,
    gap: 18,
  },
  monthContent: { gap: 18 },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: MonikeColors.accentPulse, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '800' },
  topBrand: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MonikeColors.signalRed,
  },
  monthSelector: {
    height: 48,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthChevron: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 20,
  },
  toastText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  heroCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 18,
  },
  heroLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroAmount: {
    marginTop: 8,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -2,
  },
  heroCurrency: { color: MonikeColors.inkSecondary, fontSize: 24 },
  heroMetricRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  heroMetricBlock: { flex: 1, gap: 3 },
  heroMetricDivider: { width: 1, height: 38, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 14 },
  heroMetricValue: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  heroMetricLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  budgetBlock: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 16,
  },
  budgetScaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  budgetScale: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
  progressMarkerLayer: { height: 16, marginTop: -8 },
  progressAmountMarker: { position: 'absolute', top: 0 },
  progressAmountLabel: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, alignItems: 'flex-end' },
  progressTick: { width: 2, height: 8, backgroundColor: MonikeColors.inkPrimary },
  budgetFootRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  budgetFootLeft: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  budgetFootRight: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 11 },
  sectionGap: { gap: 10 },
  sectionTitle: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  weeklyCard: {
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
    backgroundColor: MonikeColors.bgSurface,
  },
  weekRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  weekRowStripe: { backgroundColor: MonikeColors.bgStripe },
  weekLeft: { width: 58 },
  weekCode: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  weekRange: { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  weekCenter: { flex: 1, paddingHorizontal: 10 },
  weekBarTrack: { height: 22, backgroundColor: MonikeColors.bgElevated, borderRadius: 11, overflow: 'hidden' },
  weekBarFill: { height: 22, borderRadius: 11, justifyContent: 'center', paddingLeft: 8 },
  weekBarLabel: { color: MonikeColors.bgVoid, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  weekRight: { width: 78, alignItems: 'flex-end' },
  weekAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  weekTxn: { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  statsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
  },
  statCell: {
    width: '33.333%',
    minHeight: 116,
    padding: 14,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: MonikeColors.inkGhost,
  },
  statTitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { marginTop: 8, fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700' },
  statSub: { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  highDotGrid: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 3, width: 70 },
  highDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: MonikeColors.bgElevated },
  highDotActive: { backgroundColor: MonikeColors.signalRed },
  comparisonCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 18,
  },
  comparisonBars: { minHeight: 178, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 20 },
  comparisonBarWrap: { alignItems: 'center' },
  comparisonValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  comparisonBarSlot: { width: 80, height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  comparisonBar: { width: 80, maxHeight: 120, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  comparisonLabel: { marginTop: 8, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  changeBadge: {
    alignSelf: 'center',
    marginBottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: MonikeColors.bgOverlay,
  },
  changeBadgeText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  comparisonFooter: { marginTop: 10, textAlign: 'center', color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  heatmapCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 12,
  },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekdayLabel: { width: 36, textAlign: 'center', color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heatCellBlank: { width: 36, height: 36 },
  heatCell: { width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  todayCell: { borderWidth: 1, borderColor: MonikeColors.inkPrimary },
  heatCellText: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700' },
  zeroDot: { position: 'absolute', bottom: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkSecondary },
  riskBadge: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  transactionCenter: { flex: 1, minWidth: 0 },
  transactionDescription: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  transactionDate: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  transactionRight: { alignItems: 'flex-end', minWidth: 88 },
  transactionAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  transactionTime: { marginTop: 5, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  daySheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonikeColors.inkMuted,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetSubtitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, marginTop: 2 },
  sheetDebit: { color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 32, fontWeight: '700', marginTop: 10, marginBottom: 12 },
  sheetTransactionList: { maxHeight: 280 },
});

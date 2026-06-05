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
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

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

const loadingSteps = [
  'connecting to database...',
  'loading transactions...',
  'training model...',
  'ready.',
] as const;

const monthSpend = 342115.5;
const monthlyBudget = 1850000;
const daysElapsed = 5;
const daysInMonth = 30;
const highSpendDays = 8;
const dailyLimit = 62000;
const sevenDaySpend: DaySpend[] = [
  { day: 'Mo', date: '1 Jun', total: 38400, limit: dailyLimit, risk: 'LOW' },
  { day: 'Tu', date: '2 Jun', total: 51600, limit: dailyLimit, risk: 'LOW' },
  { day: 'We', date: '3 Jun', total: 74300, limit: dailyLimit, risk: 'HIGH' },
  { day: 'Th', date: '4 Jun', total: 40900, limit: dailyLimit, risk: 'LOW' },
  { day: 'Fr', date: '5 Jun', total: 88115.5, limit: dailyLimit, risk: 'HIGH' },
  { day: 'Sa', date: '6 Jun', total: 27900, limit: dailyLimit, risk: 'LOW' },
  { day: 'Su', date: '7 Jun', total: 20800, limit: dailyLimit, risk: 'LOW' },
];

const recentTransactions: Transaction[] = [
  { id: 't-01', description: 'Paystack merchant payout', category: 'Online Payment', date: '5 Jun', day: 'Fr', time: '14:32', amount: 185000 },
  { id: 't-02', description: 'Chicken Republic Lekki', category: 'Food & Dining', date: '5 Jun', day: 'Fr', time: '13:06', amount: -7800 },
  { id: 't-03', description: 'Uber Trip to Yaba', category: 'POS Purchase', date: '5 Jun', day: 'Fr', time: '08:42', amount: -4200 },
  { id: 't-04', description: 'MTN Data 20GB Bundle', category: 'Data', date: '4 Jun', day: 'Th', time: '21:14', amount: -6500 },
  { id: 't-05', description: 'Cowrywise automated save', category: 'Person-to-Person', date: '4 Jun', day: 'Th', time: '09:10', amount: -50000 },
];

const dayDetailTransactions: Transaction[] = [
  ...recentTransactions.filter((transaction) => transaction.date === '5 Jun'),
  { id: 't-06', description: 'EKEDC electricity token', category: 'Electricity', date: '5 Jun', day: 'Fr', time: '19:48', amount: -25000 },
  { id: 't-07', description: 'Airtime recharge', category: 'Airtime', date: '5 Jun', day: 'Fr', time: '16:02', amount: -3000 },
];

const categoryPalette = ['#00E676', '#FFB300', '#FF3D3D', '#4FC3F7', '#69FF9C', '#A07000', '#8B0000', '#8B939E'];
const navTabs = ['Home', 'Insights', 'Log', 'Settings'] as const;

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function moneySign(value: number) {
  return value < 0 ? '−' : '+';
}

function RiskBadge({ risk }: { risk: Risk }) {
  const palette = {
    HIGH: { color: MonikeColors.signalRed, backgroundColor: '#FF3D3D22', borderColor: '#FF3D3D44' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30022', borderColor: '#FFB30044' },
    LOW: { color: MonikeColors.accentPulse, backgroundColor: '#00E67622', borderColor: '#00E67644' },
  }[risk];

  return <Text style={[styles.riskBadge, palette]}>{risk}</Text>;
}

function IconGlyph({ name, color = MonikeColors.inkSecondary, size = 20 }: { name: string; color?: string; size?: number }) {
  const scale = size / 20;
  return (
    <View style={[styles.iconCanvas, { width: size, height: size }]}>
      {name === 'bell' && (
        <>
          <View style={[styles.bellBody, { borderColor: color, width: 13 * scale, height: 13 * scale, borderRadius: 7 * scale }]} />
          <View style={[styles.bellClapper, { backgroundColor: color, width: 5 * scale, height: 1.5 * scale, bottom: 2 * scale }]} />
        </>
      )}
      {name === 'bar' && [0, 1, 2].map((item) => <View key={item} style={[styles.barIconBar, { backgroundColor: color, height: (7 + item * 4) * scale, left: (2 + item * 6) * scale, width: 3 * scale }]} />)}
      {name === 'pie' && <View style={[styles.pieIcon, { borderColor: color, width: 16 * scale, height: 16 * scale, borderRadius: 8 * scale }]} />}
      {name === 'zap' && <Text style={[styles.textIcon, { color, fontSize: 18 * scale }]}>ϟ</Text>}
      {name === 'plus' && (
        <>
          <View style={[styles.plusCircle, { borderColor: color, width: 17 * scale, height: 17 * scale, borderRadius: 9 * scale }]} />
          <View style={[styles.plusLineHorizontal, { backgroundColor: color, width: 9 * scale }]} />
          <View style={[styles.plusLineVertical, { backgroundColor: color, height: 9 * scale }]} />
        </>
      )}
      {['users', 'shopping', 'wifi', 'phone', 'utensils', 'globe', 'credit', 'home', 'insights', 'log', 'settings'].includes(name) && (
        <View style={[styles.genericIcon, { borderColor: color, width: 15 * scale, height: 15 * scale, borderRadius: name === 'globe' ? 8 * scale : 4 * scale }]} />
      )}
      {name === 'trend-up' && <Text style={[styles.textIcon, { color, fontSize: 16 * scale }]}>↗</Text>}
    </View>
  );
}

function PressScale({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.timing(scale, { toValue: 0.94, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.95)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(4)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const progressAnimation = Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: false });
    const shimmerAnimation = Animated.timing(shimmer, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true });

    haloLoop.start();
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    timers.push(setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(taglineY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 200));
    progressAnimation.start();
    shimmerAnimation.start();
    [1, 2, 3].forEach((nextIndex) => {
      timers.push(setTimeout(() => {
        Animated.timing(statusOpacity, { toValue: 0, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          setStatusIndex(nextIndex);
          Animated.timing(statusOpacity, { toValue: 1, duration: 75, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        });
      }, [500, 1000, 1400][nextIndex - 1]));
    });
    timers.push(setTimeout(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(exitScale, { toValue: 1.04, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(onComplete);
    }, 1800));

    return () => {
      timers.forEach(clearTimeout);
      haloLoop.stop();
      progressAnimation.stop();
      shimmerAnimation.stop();
    };
  }, [exitOpacity, exitScale, halo, logoOpacity, logoScale, onComplete, progress, shimmer, statusOpacity, taglineOpacity, taglineY]);

  return (
    <View style={styles.splashRoot}>
      <Animated.View style={[styles.splashHalo, { opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }] }]} />
      <View style={[styles.scanLine, styles.scanLineOne]} />
      <View style={[styles.scanLine, styles.scanLineTwo]} />
      <View style={[styles.scanLine, styles.scanLineThree]} />
      <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
      <View style={[styles.cornerBracket, styles.cornerTopRight]} />
      <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
      <View style={[styles.cornerBracket, styles.cornerBottomRight]} />
      <Animated.View style={[styles.splashCenter, { opacity: exitOpacity, transform: [{ scale: exitScale }] }]}> 
        <Animated.View style={[styles.logoUnit, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}> 
          <View style={styles.monikeGlyph}><View style={styles.glyphArrow}><View style={styles.glyphArrowStem} /><View style={[styles.glyphArrowHead, styles.glyphArrowHeadLeft]} /><View style={[styles.glyphArrowHead, styles.glyphArrowHeadRight]} /></View></View>
          <Text style={styles.wordmark}>MONIKE</Text>
        </Animated.View>
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>KNOW WHERE YOUR MONEY GOES</Animated.Text>
        <View style={styles.splashProgressTrack}>
          <Animated.View style={[styles.splashProgressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) }]}> 
            <Animated.View style={[styles.progressShimmer, { transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 200] }) }] }]}> 
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentPulse }]} />
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentNeon }]} />
              <View style={[styles.shimmerStop, { backgroundColor: MonikeColors.accentPulse }]} />
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.Text style={[styles.loadingStatus, { opacity: statusOpacity }]}>{loadingSteps[statusIndex]}</Animated.Text>
      </Animated.View>
    </View>
  );
}

function TopBar({ onSettings }: { onSettings: () => void }) {
  return (
    <View style={styles.topBar}>
      <PressScale style={styles.avatarButton} onPress={onSettings}>
        <Text style={styles.avatarText}>C</Text>
      </PressScale>
      <Text style={styles.topBrand}>MONIKE</Text>
      <PressScale style={styles.bellButton}>
        <IconGlyph name="bell" size={20} />
        <View style={styles.alertDot} />
      </PressScale>
    </View>
  );
}

function HeroCard() {
  const animatedAmount = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const listener = animatedAmount.addListener(({ value }) => setDisplayValue(value));
    Animated.timing(animatedAmount, { toValue: monthSpend, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => animatedAmount.removeListener(listener);
  }, [animatedAmount]);

  return (
    <View style={styles.heroCard}>
      <View pointerEvents="none" style={styles.diagonalTexture}>
        {Array.from({ length: 28 }).map((_, index) => <View key={index} style={[styles.textureLine, { left: index * 14 - 120 }]} />)}
      </View>
      <View style={styles.heroTopRow}>
        <Text style={styles.heroGreeting}>Hey, Chijioke 👋</Text>
        <Text style={styles.heroMonth}>JUNE 2026</Text>
      </View>
      <Text style={styles.heroLabel}>TOTAL SPENT THIS MONTH</Text>
      <View style={styles.heroAmountRow}>
        <Text style={styles.heroNairaPrefix}>₦</Text>
        <Text style={styles.heroAmount}>{formatNaira(displayValue, 2)}</Text>
      </View>
      <Text style={styles.comparisonText}>▲ 12.4% vs May</Text>
      <View style={styles.heroSeparator} />
      <View style={styles.heroStatsRow}>
        <View style={styles.heroStatColumn}>
          <Text style={styles.heroStatValue}>₦11,483</Text>
          <Text style={styles.heroStatLabel}>daily avg</Text>
        </View>
        <View style={styles.verticalSeparator} />
        <View style={styles.heroStatColumn}>
          <Text style={styles.heroStatValue}>{highSpendDays}</Text>
          <Text style={styles.heroStatLabel}>high-spend days</Text>
        </View>
        <View style={styles.verticalSeparator} />
        <View style={styles.heroStatColumn}>
          <RiskBadge risk="HIGH" />
          <Text style={styles.heroStatLabel}>tomorrow</Text>
        </View>
      </View>
    </View>
  );
}

function QuickActions() {
  const actions = [
    { icon: 'bar', label: 'Summary' },
    { icon: 'pie', label: 'Categories' },
    { icon: 'zap', label: 'Predict', active: true },
    { icon: 'plus', label: 'Log Spend' },
  ];

  return (
    <View style={styles.quickActionsRow}>
      {actions.map((action) => (
        <PressScale key={action.label} style={styles.quickActionItem}>
          <View style={[styles.quickActionCircle, action.active && styles.predictGlow]}>
            <IconGlyph name={action.icon} color={action.active ? MonikeColors.accentPulse : MonikeColors.inkSecondary} size={20} />
          </View>
          <Text style={[styles.quickActionLabel, action.active && styles.quickActionLabelActive]}>{action.label}</Text>
        </PressScale>
      ))}
    </View>
  );
}

function SevenDayChart({ onSelectDay }: { onSelectDay: (day: DaySpend) => void }) {
  const animations = useRef(sevenDaySpend.map(() => new Animated.Value(0))).current;
  const maxSpend = Math.max(...sevenDaySpend.map((day) => day.total), dailyLimit);
  const weekTotal = sevenDaySpend.reduce((sum, day) => sum + day.total, 0);
  const limitTop = 100 - (dailyLimit / maxSpend) * 100;

  useEffect(() => {
    Animated.stagger(
      50,
      animations.map((animation) => Animated.timing(animation, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false })),
    ).start();
  }, [animations]);

  return (
    <View style={styles.chartSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
        <Text style={styles.sectionValue}>₦{formatNaira(weekTotal)} for week</Text>
      </View>
      <View style={styles.chartCard}>
        <View style={[styles.thresholdLine, { top: `${limitTop}%` }]} />
        <Text style={[styles.thresholdLabel, { top: `${Math.max(limitTop - 6, 0)}%` }]}>daily limit</Text>
        {sevenDaySpend.map((day, index) => {
          const isHigh = day.total > day.limit;
          const isToday = day.date === '5 Jun';
          const animatedHeight = animations[index].interpolate({ inputRange: [0, 1], outputRange: [0, 86 * (day.total / maxSpend)] });
          return (
            <Pressable key={day.day} style={styles.chartColumn} onPress={() => onSelectDay(day)}>
              <View style={styles.barSlot}>
                <Animated.View style={[styles.dashboardBar, isHigh && styles.dashboardBarHigh, isToday && styles.dashboardBarToday, { height: animatedHeight }]} />
              </View>
              <Text style={styles.chartDayLabel}>{day.day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SpendHealthStrip() {
  const currentDailyPace = monthSpend / daysElapsed;
  const budgetDailyPace = monthlyBudget / daysInMonth;
  const paceOver = currentDailyPace > budgetDailyPace;
  const lowSpendStreak = 4;

  return (
    <View style={styles.healthStrip}>
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>PACE</Text>
        <View style={styles.healthValueRow}>
          <IconGlyph name="trend-up" size={14} color={MonikeColors.signalRed} />
          <Text style={[styles.healthValue, { color: paceOver ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>{paceOver ? 'Ahead' : 'On Track'}</Text>
        </View>
        <Text style={styles.healthMonoSubtext}>Day 5 of 30, ₦{formatNaira(monthlyBudget)} budget</Text>
      </View>
      <View style={styles.healthDivider} />
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>STREAK</Text>
        <Text style={styles.streakValue}>{lowSpendStreak} days</Text>
        <Text style={styles.healthSubtext}>under threshold</Text>
        <View style={styles.dotRow}>{Array.from({ length: 5 }).map((_, index) => <View key={index} style={[styles.streakDot, index < lowSpendStreak && styles.streakDotFilled]} />)}</View>
      </View>
      <View style={styles.healthDivider} />
      <View style={styles.healthBlock}>
        <Text style={styles.healthLabel}>SAVED</Text>
        <Text style={styles.savedValue}>₦23,500</Text>
        <Text style={styles.healthSubtext}>moved to savings</Text>
      </View>
    </View>
  );
}

function categoryIcon(category: Category) {
  return {
    'Person-to-Person': 'users',
    'POS Purchase': 'shopping',
    Data: 'wifi',
    Airtime: 'phone',
    'Food & Dining': 'utensils',
    'Online Payment': 'globe',
    Electricity: 'zap',
    Other: 'credit',
  }[category];
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const credit = transaction.amount > 0;
  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionIconCircle}>
        <IconGlyph name={categoryIcon(transaction.category)} size={16} color={credit ? MonikeColors.signalBlue : MonikeColors.inkSecondary} />
      </View>
      <View style={styles.transactionCenter}>
        <Text numberOfLines={1} style={styles.transactionDescription}>{transaction.description}</Text>
        <View style={styles.transactionMetaRow}>
          <Text style={styles.transactionDate}>{transaction.date}</Text>
          <View style={styles.categoryPill}><Text style={styles.categoryPillText}>{transaction.category}</Text></View>
        </View>
      </View>
      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, { color: credit ? MonikeColors.signalBlue : MonikeColors.signalRed }]}>{moneySign(transaction.amount)}₦{formatNaira(transaction.amount)}</Text>
        <Text style={styles.transactionTime}>{transaction.time}</Text>
      </View>
    </View>
  );
}

function RecentTransactions() {
  return (
    <View style={styles.recentSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>RECENT</Text>
        <Pressable><Text style={styles.seeAllText}>See all →</Text></Pressable>
      </View>
      <View style={styles.transactionsCard}>{recentTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</View>
    </View>
  );
}

function DayDetailSheet({ day, visible, onClose }: { day: DaySpend | null; visible: boolean; onClose: () => void }) {
  const sheetY = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const detailTransactions = dayDetailTransactions.filter((transaction) => !day || transaction.date === day.date);
  const categoryTotals = useMemo(() => {
    const totals = new Map<Category, number>();
    detailTransactions.forEach((transaction) => {
      if (transaction.amount < 0) totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + Math.abs(transaction.amount));
    });
    return Array.from(totals.entries()).map(([category, total], index) => ({ category, total, color: categoryPalette[index % categoryPalette.length] }));
  }, [detailTransactions]);
  const totalDebit = categoryTotals.reduce((sum, item) => sum + item.total, 0);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetY, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetY, { toValue: 420, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
          <View><Text style={styles.sheetTitle}>{day.date}</Text><Text style={styles.sheetSubtitle}>{day.day === 'Fr' ? 'Friday' : day.day}</Text></View>
          <RiskBadge risk={day.risk} />
        </View>
        <Text style={styles.sheetDebit}>₦{formatNaira(totalDebit)}</Text>
        <View style={styles.breakdownTrack}>{categoryTotals.map((item) => <View key={item.category} style={[styles.breakdownSegment, { backgroundColor: item.color, flex: item.total }]} />)}</View>
        <View style={styles.breakdownLabels}>{categoryTotals.map((item) => <Text key={item.category} style={styles.breakdownLabel}>{item.category.split(' ')[0]}</Text>)}</View>
        <ScrollView style={styles.sheetTransactionList}>{detailTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

function BottomNavigation() {
  return (
    <View style={styles.bottomNav}>
      {navTabs.map((tab, index) => {
        const active = index === 0;
        const iconName = (['home', 'insights', 'log', 'settings'] as const)[index];
        return (
          <PressScale key={tab} style={styles.navItem}>
            <IconGlyph name={iconName} size={24} color={active ? MonikeColors.accentPulse : MonikeColors.inkMuted} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab}</Text>
            {active && <View style={styles.navDot} />}
          </PressScale>
        );
      })}
    </View>
  );
}

function DashboardScreen() {
  const [selectedDay, setSelectedDay] = useState<DaySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openDay = useCallback((day: DaySpend) => {
    setSelectedDay(day);
    setSheetVisible(true);
  }, []);

  const openSettings = useCallback(() => {
    // Settings screen is intentionally not navigated in this static screen build.
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <TopBar onSettings={openSettings} />
          <HeroCard />
          <QuickActions />
          <SevenDayChart onSelectDay={openDay} />
          <SpendHealthStrip />
          <RecentTransactions />
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation />
      <DayDetailSheet day={selectedDay} visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

export default function MonikeHome() {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) return <SplashScreen onComplete={() => setLoaded(true)} />;
  return <DashboardScreen />;
}

const styles = StyleSheet.create({
  splashRoot: { flex: 1, width: '100%', minHeight: 844, backgroundColor: MonikeColors.bgVoid, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  splashHalo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#00E6760A', shadowColor: MonikeColors.accentPulse, shadowOpacity: 0.08, shadowRadius: 80 },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.015)' },
  scanLineOne: { top: '25%' },
  scanLineTwo: { top: '50%' },
  scanLineThree: { top: '75%' },
  cornerBracket: { position: 'absolute', width: 16, height: 16, borderColor: MonikeColors.inkGhost },
  cornerTopLeft: { top: 20, left: 20, borderTopWidth: 1, borderLeftWidth: 1 },
  cornerTopRight: { top: 20, right: 20, borderTopWidth: 1, borderRightWidth: 1 },
  cornerBottomLeft: { bottom: 20, left: 20, borderBottomWidth: 1, borderLeftWidth: 1 },
  cornerBottomRight: { bottom: 20, right: 20, borderBottomWidth: 1, borderRightWidth: 1 },
  splashCenter: { alignItems: 'center', justifyContent: 'center' },
  logoUnit: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 14 },
  monikeGlyph: { width: 24, height: 24, borderWidth: 1, borderColor: MonikeColors.accentPulse, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  glyphArrow: { width: 15, height: 15, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-45deg' }] },
  glyphArrowStem: { position: 'absolute', bottom: 2, width: 1, height: 12, backgroundColor: MonikeColors.accentPulse },
  glyphArrowHead: { position: 'absolute', top: 2, width: 7, height: 1, backgroundColor: MonikeColors.accentPulse },
  glyphArrowHeadLeft: { transform: [{ translateX: -2.5 }, { rotate: '-45deg' }] },
  glyphArrowHeadRight: { transform: [{ translateX: 2.5 }, { rotate: '45deg' }] },
  wordmark: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: 4.32 },
  tagline: { marginTop: 8, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, fontWeight: '400', letterSpacing: 1.54, textTransform: 'uppercase' },
  splashProgressTrack: { width: 200, height: 2, marginTop: 40, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  splashProgressFill: { height: 2, overflow: 'hidden', backgroundColor: MonikeColors.accentPulse },
  progressShimmer: { height: 2, width: 120, flexDirection: 'row' },
  shimmerStop: { flex: 1, height: 2 },
  loadingStatus: { marginTop: 16, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16 },
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 4, paddingBottom: BottomTabInset + 22, gap: 16 },
  topBar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: MonikeColors.accentPulse, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  topBrand: { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700', letterSpacing: 2.6 },
  bellButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  alertDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.accentPulse },
  heroCard: { minHeight: 218, overflow: 'hidden', backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 8 },
  diagonalTexture: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 1 },
  textureLine: { position: 'absolute', top: -80, width: 1, height: 360, backgroundColor: 'rgba(255,255,255,0.012)', transform: [{ rotate: '45deg' }] },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroGreeting: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600' },
  heroMonth: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  heroLabel: { marginTop: 14, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  heroAmountRow: { marginTop: 6, flexDirection: 'row', alignItems: 'baseline' },
  heroNairaPrefix: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 22, fontWeight: '700', marginRight: 4 },
  heroAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 38, lineHeight: 46, fontWeight: '700', letterSpacing: -0.76 },
  comparisonText: { marginTop: 2, color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 12 },
  heroSeparator: { height: 1, backgroundColor: MonikeColors.inkGhost, opacity: 0.5, marginTop: 16, marginBottom: 14 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center' },
  heroStatColumn: { flex: 1, alignItems: 'center', gap: 5 },
  heroStatValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  heroStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  verticalSeparator: { width: 1, height: 32, backgroundColor: MonikeColors.inkGhost },
  riskBadge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', alignSelf: 'center' },
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickActionItem: { alignItems: 'center', width: 76, gap: 7 },
  quickActionCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, alignItems: 'center', justifyContent: 'center' },
  predictGlow: { shadowColor: MonikeColors.accentPulse, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10, borderColor: '#00E67644' },
  quickActionLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 10 },
  quickActionLabelActive: { color: MonikeColors.accentPulse },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '600', letterSpacing: 0.44, textTransform: 'uppercase' },
  sectionValue: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  chartSection: { gap: 10 },
  chartCard: { height: 124, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 10, paddingRight: 58, position: 'relative' },
  chartColumn: { width: 32, alignItems: 'center', gap: 7 },
  barSlot: { height: 100, width: 28, justifyContent: 'flex-end', alignItems: 'center' },
  dashboardBar: { width: 24, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: MonikeColors.accentPulse },
  dashboardBarHigh: { backgroundColor: MonikeColors.signalRed },
  dashboardBarToday: { borderTopWidth: 2, borderTopColor: MonikeColors.accentNeon, backgroundColor: MonikeColors.accentNeon },
  chartDayLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  thresholdLine: { position: 'absolute', left: 0, right: 58, borderTopWidth: 1, borderStyle: 'dotted', borderColor: MonikeColors.signalAmber, opacity: 0.65 },
  thresholdLabel: { position: 'absolute', right: 0, color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 9 },
  healthStrip: { minHeight: 92, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'stretch' },
  healthBlock: { flex: 1, gap: 4 },
  healthDivider: { width: 1, backgroundColor: MonikeColors.inkGhost, marginHorizontal: 9 },
  healthLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  healthValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  healthValue: { fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700' },
  healthMonoSubtext: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, lineHeight: 12 },
  streakValue: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  savedValue: { color: MonikeColors.signalBlue, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  healthSubtext: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  dotRow: { flexDirection: 'row', gap: 4, marginTop: 1 },
  streakDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: MonikeColors.inkGhost },
  streakDotFilled: { backgroundColor: MonikeColors.accentPulse },
  recentSection: { gap: 10 },
  seeAllText: { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 11 },
  transactionsCard: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, overflow: 'hidden' },
  transactionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#2A30404D' },
  transactionIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  transactionCenter: { flex: 1, minWidth: 0 },
  transactionDescription: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500', maxWidth: 156 },
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  transactionDate: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  categoryPill: { backgroundColor: MonikeColors.bgElevated, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 2, maxWidth: 96 },
  categoryPillText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  transactionRight: { alignItems: 'flex-end', minWidth: 86 },
  transactionAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  transactionTime: { marginTop: 5, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BottomTabInset, backgroundColor: '#0F1214F2', borderTopWidth: 1, borderTopColor: MonikeColors.inkGhost, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  navItem: { width: 78, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  navLabelActive: { color: MonikeColors.accentPulse },
  navDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: MonikeColors.accentPulse },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  daySheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: 520, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingTop: 10, paddingBottom: 26 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center', marginBottom: 14 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetSubtitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, marginTop: 2 },
  sheetDebit: { color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 32, fontWeight: '700', marginTop: 10 },
  breakdownTrack: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginTop: 14, backgroundColor: MonikeColors.bgElevated },
  breakdownSegment: { height: 10 },
  breakdownLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 10 },
  breakdownLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  sheetTransactionList: { maxHeight: 260 },
  iconCanvas: { alignItems: 'center', justifyContent: 'center' },
  bellBody: { position: 'absolute', borderWidth: 1.6, borderBottomWidth: 0, top: 3 },
  bellClapper: { position: 'absolute', borderRadius: 1 },
  barIconBar: { position: 'absolute', bottom: 3, borderRadius: 2 },
  pieIcon: { borderWidth: 1.8, borderRightColor: MonikeColors.accentPulse },
  textIcon: { fontFamily: Fonts.mono, fontWeight: '700', lineHeight: 20 },
  plusCircle: { position: 'absolute', borderWidth: 1.8 },
  plusLineHorizontal: { position: 'absolute', height: 1.5, borderRadius: 1 },
  plusLineVertical: { position: 'absolute', width: 1.5, borderRadius: 1 },
  genericIcon: { borderWidth: 1.7 },
});

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
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
import Svg, { Circle, G, Path, Polygon } from 'react-native-svg';
import {
  Bell,
  CreditCard,
  Globe,
  PieChart,
  Phone,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Users,
  Utensils,
  Wifi,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type Period = 'This Month' | '3 Months' | 'All Time';
type CategoryName =
  | 'Person-to-Person'
  | 'POS Purchase'
  | 'Food & Dining'
  | 'Online Payment'
  | 'Family Transfer'
  | 'Data'
  | 'Airtime'
  | 'Electricity'
  | 'Subscription'
  | 'Savings'
  | 'Other';

type Transaction = {
  id: string;
  description: string;
  category: CategoryName;
  date: string;
  time: string;
  amount: number;
};

type CategorySpend = {
  category: CategoryName;
  color: string;
  total: number;
  transactions: number;
  lastMonth: number;
  sixMonthSpend: number[];
  txns: Transaction[];
};

const PERIODS: Period[] = ['This Month', '3 Months', 'All Time'];
const totalSpend = 342115;

const categoryData: CategorySpend[] = [
  {
    category: 'Person-to-Person',
    color: '#00E676',
    total: 130004,
    transactions: 42,
    lastMonth: 114800,
    sixMonthSpend: [82000, 97000, 91000, 108000, 114800, 130004],
    txns: [
      { id: 'p2p-1', description: 'Tunde split apartment supplies', category: 'Person-to-Person', date: '5 Jun', time: '10:20', amount: -48115 },
      { id: 'p2p-2', description: 'Market supplies transfer', category: 'Person-to-Person', date: '4 Jun', time: '16:42', amount: -32000 },
      { id: 'p2p-3', description: 'Aisha weekend reimbursement', category: 'Person-to-Person', date: '2 Jun', time: '09:31', amount: -24000 },
      { id: 'p2p-4', description: 'Driver balance transfer', category: 'Person-to-Person', date: '1 Jun', time: '18:04', amount: -25889 },
    ],
  },
  {
    category: 'POS Purchase',
    color: '#4FC3F7',
    total: 71844,
    transactions: 31,
    lastMonth: 86500,
    sixMonthSpend: [71000, 76000, 83000, 79000, 86500, 71844],
    txns: [
      { id: 'pos-1', description: 'Shoprite groceries POS', category: 'POS Purchase', date: '6 Jun', time: '14:16', amount: -18800 },
      { id: 'pos-2', description: 'Uber Trip to Yaba', category: 'POS Purchase', date: '5 Jun', time: '08:42', amount: -4200 },
      { id: 'pos-3', description: 'Pharmacy card payment', category: 'POS Purchase', date: '3 Jun', time: '20:09', amount: -12800 },
      { id: 'pos-4', description: 'Fuel station POS', category: 'POS Purchase', date: '1 Jun', time: '07:56', amount: -36044 },
    ],
  },
  {
    category: 'Food & Dining',
    color: '#FF8A65',
    total: 47280,
    transactions: 18,
    lastMonth: 50150,
    sixMonthSpend: [38600, 44200, 49000, 46300, 50150, 47280],
    txns: [
      { id: 'food-1', description: 'Chicken Republic Lekki', category: 'Food & Dining', date: '5 Jun', time: '13:06', amount: -7800 },
      { id: 'food-2', description: 'Coffee and pastry', category: 'Food & Dining', date: '4 Jun', time: '08:18', amount: -5200 },
      { id: 'food-3', description: 'Dinner at Terra Kulture', category: 'Food & Dining', date: '2 Jun', time: '21:02', amount: -24600 },
      { id: 'food-4', description: 'Office lunch bowls', category: 'Food & Dining', date: '1 Jun', time: '12:44', amount: -9680 },
    ],
  },
  {
    category: 'Online Payment',
    color: '#CE93D8',
    total: 34000,
    transactions: 12,
    lastMonth: 29800,
    sixMonthSpend: [18000, 22500, 26000, 24100, 29800, 34000],
    txns: [
      { id: 'online-1', description: 'Paystack marketplace order', category: 'Online Payment', date: '6 Jun', time: '11:04', amount: -14000 },
      { id: 'online-2', description: 'Bolt food online checkout', category: 'Online Payment', date: '4 Jun', time: '19:37', amount: -9200 },
      { id: 'online-3', description: 'Jumia household cart', category: 'Online Payment', date: '1 Jun', time: '17:14', amount: -10800 },
    ],
  },
  {
    category: 'Family Transfer',
    color: '#FFF176',
    total: 25000,
    transactions: 5,
    lastMonth: 22000,
    sixMonthSpend: [12000, 15000, 18000, 21000, 22000, 25000],
    txns: [
      { id: 'family-1', description: 'Mum monthly support', category: 'Family Transfer', date: '3 Jun', time: '07:40', amount: -15000 },
      { id: 'family-2', description: 'Sibling exam materials', category: 'Family Transfer', date: '2 Jun', time: '15:22', amount: -10000 },
    ],
  },
  {
    category: 'Data',
    color: '#80DEEA',
    total: 12900,
    transactions: 4,
    lastMonth: 11800,
    sixMonthSpend: [9000, 9800, 10200, 11000, 11800, 12900],
    txns: [
      { id: 'data-1', description: 'MTN Data 20GB Bundle', category: 'Data', date: '4 Jun', time: '21:14', amount: -6500 },
      { id: 'data-2', description: 'Airtel MiFi top-up', category: 'Data', date: '1 Jun', time: '09:11', amount: -6400 },
    ],
  },
  {
    category: 'Airtime',
    color: '#A5D6A7',
    total: 9300,
    transactions: 6,
    lastMonth: 7600,
    sixMonthSpend: [5200, 6100, 6600, 7000, 7600, 9300],
    txns: [
      { id: 'airtime-1', description: 'Airtime recharge', category: 'Airtime', date: '5 Jun', time: '16:02', amount: -3000 },
      { id: 'airtime-2', description: 'Family airtime share', category: 'Airtime', date: '2 Jun', time: '13:49', amount: -6300 },
    ],
  },
  {
    category: 'Electricity',
    color: '#FFB74D',
    total: 6500,
    transactions: 1,
    lastMonth: 25000,
    sixMonthSpend: [18500, 24000, 20000, 22500, 25000, 6500],
    txns: [
      { id: 'power-1', description: 'EKEDC electricity token', category: 'Electricity', date: '5 Jun', time: '19:48', amount: -6500 },
    ],
  },
  {
    category: 'Subscription',
    color: '#EF9A9A',
    total: 2900,
    transactions: 3,
    lastMonth: 2014,
    sixMonthSpend: [1600, 1600, 1900, 2014, 2014, 2900],
    txns: [
      { id: 'sub-1', description: 'Spotify Premium', category: 'Subscription', date: '2 Jun', time: '00:10', amount: -1200 },
      { id: 'sub-2', description: 'iCloud storage', category: 'Subscription', date: '1 Jun', time: '00:08', amount: -1700 },
    ],
  },
  {
    category: 'Savings',
    color: '#90CAF9',
    total: 1700,
    transactions: 1,
    lastMonth: 50000,
    sixMonthSpend: [25000, 30000, 30000, 45000, 50000, 1700],
    txns: [
      { id: 'save-1', description: 'Emergency wallet sweep', category: 'Savings', date: '1 Jun', time: '06:00', amount: -1700 },
    ],
  },
  {
    category: 'Other',
    color: '#B0BEC5',
    total: 687,
    transactions: 2,
    lastMonth: 1400,
    sixMonthSpend: [600, 1200, 900, 1800, 1400, 687],
    txns: [
      { id: 'other-1', description: 'Bank stamp duty', category: 'Other', date: '6 Jun', time: '22:10', amount: -500 },
      { id: 'other-2', description: 'Rounding adjustment', category: 'Other', date: '1 Jun', time: '03:20', amount: -187 },
    ],
  },
];

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function shareOfTotal(value: number) {
  return (value / totalSpend) * 100;
}

function categoryIcon(category: CategoryName) {
  const map: Record<CategoryName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    'Person-to-Person': Users,
    'POS Purchase': ShoppingBag,
    'Food & Dining': Utensils,
    'Online Payment': Globe,
    'Family Transfer': Users,
    Data: Wifi,
    Airtime: Phone,
    Electricity: Zap,
    Subscription: CreditCard,
    Savings: TrendingUp,
    Other: ReceiptText,
  };
  return map[category] ?? CreditCard;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function donutSlicePath(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const safeEnd = endAngle - startAngle >= 359.8 ? startAngle + 359.8 : endAngle;
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = safeEnd - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function sparklinePoints(values: number[], width: number, height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return { x, y };
  });
}

function linePath(values: number[], width: number, height: number) {
  return sparklinePoints(values, width, height)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function areaPoints(values: number[], width: number, height: number) {
  const points = sparklinePoints(values, width, height)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  return `0,${height} ${points} ${width},${height}`;
}

function PressScale({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.timing(scale, {
      toValue: 0.96,
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

function TopBar() {
  return <MonikeHeader title="Categories" />;
}

function PeriodToggle({ activePeriod, onChange }: { activePeriod: Period; onChange: (period: Period) => void }) {
  return (
    <View style={styles.periodToggle}>
      {PERIODS.map((period) => {
        const active = period === activePeriod;
        return (
          <Pressable key={period} onPress={() => onChange(period)} style={[styles.periodSegment, active && styles.periodSegmentActive]}>
            <Text style={[styles.periodText, active && styles.periodTextActive]}>{period}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DonutChart({ selectedCategory, onSelect }: {
  selectedCategory: CategorySpend | null;
  onSelect: (category: CategorySpend | null) => void;
}) {
  const [drawProgress, setDrawProgress] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const selected = selectedCategory;

  useEffect(() => {
    progress.setValue(0);
    const listener = progress.addListener(({ value }) => setDrawProgress(value));
    Animated.timing(progress, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(listener);
  }, [progress]);

  let runningAngle = 0;

  return (
    <View style={styles.chartSection}>
      <View style={styles.chartPressLayer}>
        <Svg width={300} height={300} viewBox="0 0 300 300">
          <Circle cx={150} cy={150} r={90} fill={MonikeColors.bgVoid} />
          <G>
            {categoryData.map((item, index) => {
              const fullAngle = (item.total / totalSpend) * 360;
              const startAngle = runningAngle + 1;
              const endAngle = runningAngle + fullAngle - 1;
              runningAngle += fullAngle;
              const segmentProgress = Math.max(0, Math.min(1, (drawProgress - index * 0.045) / 0.55));
              const drawnEnd = startAngle + (endAngle - startAngle) * segmentProgress;
              const isSelected = selected?.category === item.category;
              const dimmed = Boolean(selected && !isSelected);
              if (drawnEnd <= startAngle) return null;
              return (
                <Path
                  key={item.category}
                  d={donutSlicePath(150, 150, isSelected ? 148 : 140, 90, startAngle, drawnEnd)}
                  fill={item.color}
                  opacity={dimmed ? 0.4 : 1}
                  onPress={() => onSelect(isSelected ? null : item)}
                />
              );
            })}
          </G>
        </Svg>
        <Pressable onPress={() => onSelect(null)} style={styles.donutCenter}>
          {selected ? (
            <>
              <Text style={styles.centerTop}>{selected.category}</Text>
              <Text style={[styles.centerAmount, { color: selected.color }]}>₦{formatNaira(selected.total)}</Text>
              <Text style={styles.centerBottom}>{shareOfTotal(selected.total).toFixed(1)}% of total</Text>
            </>
          ) : (
            <>
              <Text style={styles.centerTop}>TOTAL REAL SPEND</Text>
              <Text style={styles.centerAmount}>₦{formatNaira(totalSpend)}</Text>
              <Text style={styles.centerBottom}>Jun 2026</Text>
            </>
          )}
        </Pressable>
      </View>
      <Legend />
    </View>
  );
}

function Legend() {
  const visibleItems = categoryData.slice(0, 6);
  const remaining = categoryData.length - visibleItems.length;
  return (
    <View style={styles.legendGrid}>
      {visibleItems.map((item) => (
        <View key={item.category} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.category}</Text>
        </View>
      ))}
      <Text style={styles.legendMore}>+ {remaining} more</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function CategoryRow({ category, index, onPress }: { category: CategorySpend; index: number; onPress: () => void }) {
  const Icon = categoryIcon(category.category);
  const percentage = shareOfTotal(category.total);

  return (
    <PressScale onPress={onPress}>
      <View style={[styles.categoryRow, index % 2 === 1 && styles.categoryRowStripe]}>
        <View style={[styles.categoryPill, { backgroundColor: category.color }]} />
        <View style={styles.categoryIconCircle}>
          <Icon size={20} color={category.color} strokeWidth={1.9} />
        </View>
        <View style={styles.categoryCenter}>
          <Text style={styles.categoryName}>{category.category}</Text>
          <Text style={styles.categoryMeta}>{category.transactions} transactions · avg ₦{formatNaira(category.total / category.transactions)}</Text>
        </View>
        <View style={styles.categoryRight}>
          <Text style={[styles.categoryAmount, { color: category.color }]}>₦{formatNaira(category.total)}</Text>
          <Text style={styles.categoryShare}>{percentage.toFixed(1)}%</Text>
        </View>
        <View style={styles.rowProgressTrack}>
          <View style={[styles.rowProgressFill, { width: `${percentage}%`, backgroundColor: `${category.color}99` }]} />
        </View>
      </View>
    </PressScale>
  );
}

function CategoryList({ onSelect }: { onSelect: (category: CategorySpend) => void }) {
  return (
    <View style={styles.breakdownSection}>
      <SectionTitle>BREAKDOWN</SectionTitle>
      <View style={styles.categoryList}>
        {categoryData.map((category, index) => (
          <CategoryRow key={category.category} category={category} index={index} onPress={() => onSelect(category)} />
        ))}
      </View>
    </View>
  );
}

function Sparkline({ category }: { category: CategorySpend }) {
  return (
    <View style={styles.sparklineWrap}>
      <Svg width="100%" height={60} viewBox="0 0 320 60">
        <Polygon points={areaPoints(category.sixMonthSpend, 320, 60)} fill={category.color} opacity={0.15} />
        <Path d={linePath(category.sixMonthSpend, 320, 60)} fill="none" stroke={category.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function TransactionRow({ transaction, color, showSeparator = true }: { transaction: Transaction; color: string; showSeparator?: boolean }) {
  const Icon = categoryIcon(transaction.category);

  return (
    <View style={[styles.transactionRow, !showSeparator && styles.transactionRowLast]}>
      <View style={styles.transactionIconCircle}>
        <Icon size={16} color={color} strokeWidth={1.8} />
      </View>
      <View style={styles.transactionCenter}>
        <Text numberOfLines={1} style={styles.transactionDescription}>{transaction.description}</Text>
        <Text style={styles.transactionDate}>{transaction.date}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, { color }]}>−₦{formatNaira(transaction.amount)}</Text>
        <Text style={styles.transactionTime}>{transaction.time}</Text>
      </View>
    </View>
  );
}

function CategorySheet({ category, visible, onClose }: { category: CategorySpend | null; visible: boolean; onClose: () => void }) {
  const height = Dimensions.get('window').height * 0.9;
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const current = category;
  const Icon = current ? categoryIcon(current.category) : CreditCard;
  const change = current ? ((current.total - current.lastMonth) / current.lastMonth) * 100 : 0;

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8,
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90) onClose();
      else Animated.spring(translateY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }).start();
    },
  }), [onClose, translateY]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : height, duration: visible ? 240 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, height, translateY, visible]);

  if (!current) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropTint, { opacity: backdropOpacity }]} />
      </Pressable>
      <Animated.View style={[styles.categorySheet, { height, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={styles.sheetDragZone}>
          <View style={styles.sheetHandle} />
        </View>
        <View style={styles.sheetHeaderRow}>
          <View style={styles.sheetTitleRow}>
            <View style={styles.sheetIconCircle}>
              <Icon size={24} color={current.color} strokeWidth={1.9} />
            </View>
            <View>
              <Text style={styles.sheetTitle}>{current.category}</Text>
              <Text style={[styles.sheetTotal, { color: current.color }]}>₦{formatNaira(current.total)}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.sheetCloseButton}>
            <Text style={styles.sheetCloseText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.sheetStatsRow}>
          <View style={styles.sheetStatCell}>
            <Text style={styles.sheetStatLabel}>This Month</Text>
            <Text style={[styles.sheetStatValue, { color: current.color }]}>₦{formatNaira(current.total)}</Text>
          </View>
          <View style={styles.sheetStatCell}>
            <Text style={styles.sheetStatLabel}>Last Month</Text>
            <Text style={styles.sheetStatValue}>₦{formatNaira(current.lastMonth)}</Text>
          </View>
          <View style={styles.sheetStatCell}>
            <Text style={styles.sheetStatLabel}>% Change</Text>
            <Text style={[styles.sheetStatValue, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>{change > 0 ? '+' : ''}{change.toFixed(1)}%</Text>
          </View>
        </View>
        <Sparkline category={current} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetTransactionList}>
          {current.txns.map((transaction, index) => (
            <TransactionRow key={transaction.id} transaction={transaction} color={current.color} showSeparator={index < current.txns.length - 1} />
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function InsightsStrip() {
  const p2p = categoryData[0];
  const food = categoryData.find((item) => item.category === 'Food & Dining')!;
  const subscriptions = categoryData.find((item) => item.category === 'Subscription')!;
  const subscriptionChange = ((subscriptions.total - subscriptions.lastMonth) / subscriptions.lastMonth) * 100;
  const insights = [
    { icon: PieChart, text: `P2P is ${shareOfTotal(p2p.total).toFixed(0)}% of your spend — the largest single category.`, tone: MonikeColors.signalRed },
    { icon: Utensils, text: `Food is ₦${formatNaira(food.total)} this month. Watch the lunch creep.`, tone: MonikeColors.signalAmber },
    { icon: TrendingUp, text: `Subscriptions grew ${subscriptionChange.toFixed(0)}% since last month.`, tone: MonikeColors.signalRed },
  ];

  return (
    <View style={styles.insightsSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.insightsContent}>
        {insights.map(({ icon: Icon, text, tone }, index) => (
          <View key={index} style={styles.insightChip}>
            <Icon size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
            <Text style={styles.insightText}>{text}</Text>
            <View style={[styles.insightAccent, { backgroundColor: tone }]} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function CategoriesScreen() {
  const [period, setPeriod] = useState<Period>('This Month');
  const [selectedDonutCategory, setSelectedDonutCategory] = useState<CategorySpend | null>(null);
  const [sheetCategory, setSheetCategory] = useState<CategorySpend | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const openCategory = (category: CategorySpend) => {
    setSelectedDonutCategory(category);
    setSheetCategory(category);
    setSheetVisible(true);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 24 }]}
        >
          <TopBar />
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>CATEGORIES</Text>
            <Text style={styles.screenSubtitle}>Jun 2026</Text>
          </View>
          <PeriodToggle activePeriod={period} onChange={setPeriod} />
          <DonutChart selectedCategory={selectedDonutCategory} onSelect={setSelectedDonutCategory} />
          <CategoryList onSelect={openCategory} />
          <InsightsStrip />
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="categories" />
      <CategorySheet category={sheetCategory} visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, gap: 18 },
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
  topBrand: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
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
  notificationDot: { position: 'absolute', top: 9, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.signalRed },
  titleBlock: { alignItems: 'center', gap: 5 },
  screenTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', letterSpacing: 0.8 },
  screenSubtitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 13 },
  periodToggle: {
    alignSelf: 'center',
    width: 240,
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    padding: 3,
  },
  periodSegment: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  periodSegmentActive: { backgroundColor: MonikeColors.accentPulse },
  periodText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700' },
  periodTextActive: { color: MonikeColors.bgVoid },
  chartSection: { alignItems: 'center', gap: 10 },
  chartPressLayer: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', width: 150, alignItems: 'center', justifyContent: 'center', gap: 5 },
  centerTop: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  centerAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  centerBottom: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12, textAlign: 'center' },
  legendGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 2 },
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11 },
  legendMore: { width: '50%', color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  sectionTitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  breakdownSection: { gap: 10 },
  categoryList: { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden' },
  categoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', backgroundColor: MonikeColors.bgSurface, paddingLeft: 0, paddingRight: 12, position: 'relative' },
  categoryRowStripe: { backgroundColor: MonikeColors.bgStripe },
  categoryPill: { alignSelf: 'stretch', width: 8, borderRadius: 4 },
  categoryIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  categoryCenter: { flex: 1, minWidth: 0, marginLeft: 12 },
  categoryName: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },
  categoryMeta: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  categoryRight: { alignItems: 'flex-end', minWidth: 96 },
  categoryAmount: { fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700' },
  categoryShare: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, marginTop: 3 },
  rowProgressTrack: { position: 'absolute', left: 8, right: 0, bottom: 0, height: 3, backgroundColor: MonikeColors.bgElevated },
  rowProgressFill: { height: 3 },
  insightsSection: { marginHorizontal: -ScreenPadding },
  insightsContent: { paddingHorizontal: ScreenPadding, gap: 16 },
  insightChip: { width: 160, height: 80, borderRadius: 12, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 12, overflow: 'hidden' },
  insightText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 15, marginTop: 8 },
  insightAccent: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  categorySheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingBottom: 26 },
  sheetDragZone: { paddingTop: 10, paddingBottom: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center' },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  sheetTotal: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginTop: 4 },
  sheetCloseButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 22, lineHeight: 24 },
  sheetStatsRow: { flexDirection: 'row', marginTop: 18, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: MonikeColors.inkGhost },
  sheetStatCell: { flex: 1, backgroundColor: MonikeColors.bgSurface, padding: 10, borderRightWidth: 1, borderRightColor: MonikeColors.inkGhost },
  sheetStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginBottom: 5 },
  sheetStatValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  sparklineWrap: { height: 60, marginTop: 16, marginBottom: 10, backgroundColor: MonikeColors.bgSurface, borderRadius: 12, overflow: 'hidden', padding: 6 },
  sheetTransactionList: { flex: 1 },
  transactionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#2A30404D', backgroundColor: MonikeColors.bgSurface },
  transactionRowLast: { borderBottomWidth: 0 },
  transactionIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  transactionCenter: { flex: 1, minWidth: 0 },
  transactionDescription: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  transactionDate: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  transactionRight: { alignItems: 'flex-end', minWidth: 88 },
  transactionAmount: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
  transactionTime: { marginTop: 5, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
});

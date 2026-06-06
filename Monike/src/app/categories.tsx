import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import Svg, { Circle, G, Path } from 'react-native-svg';
import {
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
import {
  apiFetch,
  periodToApiParam,
  type ApiPeriod,
  type CategoriesResponse,
  type CategoryItem,
  type CategoryTransactionsResponse,
  type CategoryTransaction,
} from '@/services/api';
import { useSWR } from '@/hooks/use-swr';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'This Month' | '3 Months' | 'All Time';
type SelectedCategory = { item: CategoryItem; index: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: Period[] = ['This Month', '3 Months', 'All Time'];

const CATEGORY_COLORS = [
  '#00E676', '#4FC3F7', '#FF8A65', '#CE93D8', '#FFF176',
  '#80DEEA', '#A5D6A7', '#FFB74D', '#EF9A9A', '#90CAF9', '#B0BEC5',
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function colorForIndex(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length] ?? '#B0BEC5';
}

function formatNaira(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function categoryIcon(
  category: string,
): React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> {
  const map: Record<
    string,
    React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  > = {
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

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number,
) {
  const rad = ((angleInDegrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function donutSlicePath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const safeEnd =
    endAngle - startAngle >= 359.8 ? startAngle + 359.8 : endAngle;
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd   = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const innerEnd   = polarToCartesian(cx, cy, innerRadius, startAngle);
  const large = safeEnd - startAngle <= 180 ? '0' : '1';
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

// ─── SkeletonBox ──────────────────────────────────────────────────────────────

function SkeletonBox({
  width,
  height,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  style?: ViewStyle;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as never,
          height,
          borderRadius: 6,
          backgroundColor: MonikeColors.bgElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function CategoriesSkeleton() {
  return (
    <View style={skeletonSt.root}>
      <SkeletonBox
        width={240}
        height={36}
        style={{ alignSelf: 'center', borderRadius: 999 }}
      />

      <View style={skeletonSt.donutWrap}>
        <Svg width={300} height={300} viewBox="0 0 300 300">
          <Circle
            cx={150}
            cy={150}
            r={140}
            fill="none"
            stroke={MonikeColors.bgElevated}
            strokeWidth={50}
          />
          <Circle cx={150} cy={150} r={90} fill={MonikeColors.bgVoid} />
        </Svg>
        <View style={skeletonSt.donutCenter}>
          <SkeletonBox width={80} height={10} style={{ marginBottom: 8 }} />
          <SkeletonBox width={120} height={22} style={{ marginBottom: 8 }} />
          <SkeletonBox width={60} height={10} />
        </View>
      </View>

      <View style={skeletonSt.legendGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={skeletonSt.legendItem}>
            <SkeletonBox width={8} height={8} style={{ borderRadius: 4 }} />
            <SkeletonBox width={80} height={10} />
          </View>
        ))}
      </View>

      <View style={skeletonSt.rowList}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={[skeletonSt.row, i % 2 === 1 && skeletonSt.rowStripe]}
          >
            <SkeletonBox width={8} height={68} style={{ borderRadius: 4 }} />
            <SkeletonBox
              width={36}
              height={36}
              style={{ borderRadius: 18, marginLeft: 12 }}
            />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <SkeletonBox width={'60%'} height={12} />
              <SkeletonBox width={'40%'} height={10} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <SkeletonBox width={80} height={14} />
              <SkeletonBox width={30} height={10} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const skeletonSt = StyleSheet.create({
  root: { gap: 18, paddingHorizontal: ScreenPadding },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 300,
    alignSelf: 'center',
  },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  legendItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rowList: {
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
  },
  row: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgSurface,
    paddingRight: 12,
  },
  rowStripe: { backgroundColor: MonikeColors.bgStripe },
});

// ─── PressScale ───────────────────────────────────────────────────────────────

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
  const pressIn = () =>
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 60,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── PeriodToggle ─────────────────────────────────────────────────────────────

function PeriodToggle({
  activePeriod,
  onChange,
}: {
  activePeriod: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <View style={st.periodToggle}>
      {PERIODS.map((period) => {
        const active = period === activePeriod;
        return (
          <Pressable
            key={period}
            onPress={() => onChange(period)}
            style={[st.periodSegment, active && st.periodSegmentActive]}
          >
            <Text style={[st.periodText, active && st.periodTextActive]}>
              {period}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({
  items,
  totalSpend,
  periodLabel,
  selectedCategory,
  onSelect,
}: {
  items: CategoryItem[];
  totalSpend: number;
  periodLabel: string;
  selectedCategory: SelectedCategory | null;
  onSelect: (cat: SelectedCategory | null) => void;
}) {
  const [drawProgress, setDrawProgress] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    setDrawProgress(0);
    const id = progress.addListener(({ value }) => setDrawProgress(value));
    Animated.timing(progress, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(id);
  }, [items, progress]);

  let runningAngle = 0;

  return (
    <View style={st.chartSection}>
      <View style={st.chartPressLayer}>
        <Svg width={300} height={300} viewBox="0 0 300 300">
          <Circle cx={150} cy={150} r={90} fill={MonikeColors.bgVoid} />
          <G>
            {items.map((item, index) => {
              const fullAngle = (item.total / totalSpend) * 360;
              const startAngle = runningAngle + 1;
              const endAngle = runningAngle + fullAngle - 1;
              runningAngle += fullAngle;
              const seg = Math.max(
                0,
                Math.min(1, (drawProgress - index * 0.045) / 0.55),
              );
              const drawnEnd = startAngle + (endAngle - startAngle) * seg;
              if (drawnEnd <= startAngle) return null;
              const isSelected =
                selectedCategory?.item.category === item.category;
              const dimmed = Boolean(selectedCategory && !isSelected);
              const color = colorForIndex(index);
              return (
                <Path
                  key={item.category}
                  d={donutSlicePath(
                    150, 150,
                    isSelected ? 148 : 140,
                    90,
                    startAngle,
                    drawnEnd,
                  )}
                  fill={color}
                  opacity={dimmed ? 0.4 : 1}
                  onPress={() =>
                    onSelect(isSelected ? null : { item, index })
                  }
                />
              );
            })}
          </G>
        </Svg>
        <Pressable onPress={() => onSelect(null)} style={st.donutCenter}>
          {selectedCategory ? (
            <>
              <Text style={st.centerTop}>
                {selectedCategory.item.category}
              </Text>
              <Text
                style={[
                  st.centerAmount,
                  { color: colorForIndex(selectedCategory.index) },
                ]}
              >
                ₦{formatNaira(selectedCategory.item.total)}
              </Text>
              <Text style={st.centerBottom}>
                {selectedCategory.item.share_pct.toFixed(1)}% of total
              </Text>
            </>
          ) : (
            <>
              <Text style={st.centerTop}>TOTAL REAL SPEND</Text>
              <Text style={st.centerAmount}>₦{formatNaira(totalSpend)}</Text>
              <Text style={st.centerBottom}>{periodLabel}</Text>
            </>
          )}
        </Pressable>
      </View>
      <Legend items={items} />
    </View>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ items }: { items: CategoryItem[] }) {
  const visible = items.slice(0, 6);
  const remaining = items.length - visible.length;
  return (
    <View style={st.legendGrid}>
      {visible.map((item, index) => (
        <View key={item.category} style={st.legendItem}>
          <View
            style={[st.legendDot, { backgroundColor: colorForIndex(index) }]}
          />
          <Text style={st.legendText}>{item.category}</Text>
        </View>
      ))}
      {remaining > 0 && (
        <Text style={st.legendMore}>+ {remaining} more</Text>
      )}
    </View>
  );
}

// ─── CategoryRow ─────────────────────────────────────────────────────────────
// FIX: prop is `item: CategoryItem` not `category: CategorySpend`
// FIX: uses item.share_pct instead of shareOfTotal() (no more totalSpend ref)
// FIX: uses colorForIndex(index) instead of item.color
// FIX: uses item.transaction_count instead of item.transactions

function CategoryRow({
  item,
  index,
  onPress,
}: {
  item: CategoryItem;
  index: number;
  onPress: () => void;
}) {
  const Icon = categoryIcon(item.category);
  const color = colorForIndex(index);

  return (
    <PressScale onPress={onPress}>
      <View style={[st.categoryRow, index % 2 === 1 && st.categoryRowStripe]}>
        <View style={[st.categoryPill, { backgroundColor: color }]} />
        <View style={st.categoryIconCircle}>
          <Icon size={20} color={color} strokeWidth={1.9} />
        </View>
        <View style={st.categoryCenter}>
          <Text style={st.categoryName}>{item.category}</Text>
          <Text style={st.categoryMeta}>
            {item.transaction_count} transactions · avg ₦
            {formatNaira(item.avg_per_transaction)}
          </Text>
        </View>
        <View style={st.categoryRight}>
          <Text style={[st.categoryAmount, { color }]}>
            ₦{formatNaira(item.total)}
          </Text>
          <Text style={st.categoryShare}>{item.share_pct.toFixed(1)}%</Text>
        </View>
        <View style={st.rowProgressTrack}>
          <View
            style={[
              st.rowProgressFill,
              {
                width: `${item.share_pct}%` as `${number}%`,
                backgroundColor: `${color}99`,
              },
            ]}
          />
        </View>
      </View>
    </PressScale>
  );
}

// ─── CategoryList ─────────────────────────────────────────────────────────────
// FIX: passes `item` prop to CategoryRow (was accidentally passing `category`)

function CategoryList({
  items,
  onSelect,
}: {
  items: CategoryItem[];
  onSelect: (item: CategoryItem, index: number) => void;
}) {
  return (
    <View style={st.breakdownSection}>
      <Text style={st.sectionTitle}>BREAKDOWN</Text>
      <View style={st.categoryList}>
        {items.map((item, index) => (
          <CategoryRow
            key={item.category}
            item={item}
            index={index}
            onPress={() => onSelect(item, index)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

function TransactionRow({
  txn,
  color,
  category,
  showSeparator = true,
}: {
  txn: CategoryTransaction;
  color: string;
  category: string;
  showSeparator?: boolean;
}) {
  const Icon = categoryIcon(category);

  const label = (() => {
    const d = new Date(txn.trans_date);
    return isNaN(d.getTime())
      ? txn.trans_date
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  })();

  return (
    <View style={[txnSt.row, !showSeparator && txnSt.rowLast]}>
      <View style={txnSt.iconCircle}>
        <Icon size={16} color={color} strokeWidth={1.8} />
      </View>
      <View style={txnSt.center}>
        <Text numberOfLines={1} style={txnSt.description}>
          {txn.description}
        </Text>
        <Text style={txnSt.date}>{label}</Text>
      </View>
      <View style={txnSt.right}>
        <Text style={[txnSt.amount, { color }]}>
          −₦{formatNaira(txn.debit)}
        </Text>
      </View>
    </View>
  );
}

// ─── TransactionSkeleton ──────────────────────────────────────────────────────

function TransactionSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[txnSt.row, i === 3 && txnSt.rowLast]}>
          <SkeletonBox width={36} height={36} style={{ borderRadius: 18 }} />
          <View style={{ flex: 1, marginLeft: 10, gap: 8 }}>
            <SkeletonBox width={'65%'} height={12} />
            <SkeletonBox width={'35%'} height={10} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <SkeletonBox width={80} height={13} />
            <SkeletonBox width={50} height={10} />
          </View>
        </View>
      ))}
    </>
  );
}

// ─── CategorySheet ────────────────────────────────────────────────────────────

function CategorySheet({
  item,
  index,
  period,
  visible,
  onClose,
}: {
  item: CategoryItem | null;
  index: number;
  period: ApiPeriod;
  visible: boolean;
  onClose: () => void;
}) {
  const windowHeight = Dimensions.get('window').height;
  const height = windowHeight * 0.9;
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const txnKey =
    item && visible
      ? `/categories/${encodeURIComponent(item.category)}/transactions?period=${period}`
      : null;

  const txnFetcher = useCallback(
    (key: string) => apiFetch<CategoryTransactionsResponse>(key),
    [],
  );

  const {
    data: txnData,
    isLoading: txnLoading,
    error: txnError,
  } = useSWR<CategoryTransactionsResponse>(txnKey, txnFetcher);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => {
          translateY.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90) onClose();
          else
            Animated.spring(translateY, {
              toValue: 0,
              speed: 18,
              bounciness: 5,
              useNativeDriver: true,
            }).start();
        },
      }),
    [onClose, translateY],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : height,
        duration: visible ? 240 : 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, height, translateY, visible]);

  if (!item) return null;

  const color = colorForIndex(index);
  const Icon = categoryIcon(item.category);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={sheetSt.backdrop} onPress={onClose}>
        <Animated.View
          style={[sheetSt.backdropTint, { opacity: backdropOpacity }]}
        />
      </Pressable>

      <Animated.View
        style={[sheetSt.sheet, { height, transform: [{ translateY }] }]}
      >
        <View {...panResponder.panHandlers} style={sheetSt.dragZone}>
          <View style={sheetSt.handle} />
        </View>

        <View style={sheetSt.headerRow}>
          <View style={sheetSt.titleRow}>
            <View style={sheetSt.iconCircle}>
              <Icon size={24} color={color} strokeWidth={1.9} />
            </View>
            <View>
              <Text style={sheetSt.title}>{item.category}</Text>
              <Text style={[sheetSt.total, { color }]}>
                ₦{formatNaira(item.total)}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={sheetSt.closeBtn}>
            <Text style={sheetSt.closeTxt}>×</Text>
          </Pressable>
        </View>

        <View style={sheetSt.statsRow}>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Spend</Text>
            <Text style={[sheetSt.statValue, { color }]}>
              ₦{formatNaira(item.total)}
            </Text>
          </View>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Transactions</Text>
            <Text style={sheetSt.statValue}>{item.transaction_count}</Text>
          </View>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Avg / Txn</Text>
            <Text style={sheetSt.statValue}>
              ₦{formatNaira(item.avg_per_transaction)}
            </Text>
          </View>
        </View>

        <View style={sheetSt.shareRow}>
          <Text style={sheetSt.shareLabel}>
            {item.share_pct.toFixed(1)}% of total spend
          </Text>
          <View style={sheetSt.shareTrack}>
            <View
              style={[
                sheetSt.shareFill,
                {
                  width: `${Math.min(item.share_pct, 100)}%` as `${number}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        </View>

        <Text style={sheetSt.txnHeading}>TRANSACTIONS</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={sheetSt.txnList}
        >
          {txnLoading && <TransactionSkeleton />}

          {txnError && !txnLoading && (
            <View style={sheetSt.note}>
              <Text style={sheetSt.noteTxt}>
                Could not load transactions.
              </Text>
            </View>
          )}

          {txnData && !txnLoading && txnData.items.length === 0 && (
            <View style={sheetSt.note}>
              <Text style={sheetSt.noteTxt}>
                No transactions for this period.
              </Text>
            </View>
          )}

          {txnData &&
            !txnLoading &&
            txnData.items.map((txn, i) => (
              <TransactionRow
                key={`${txn.trans_date}-${i}`}
                txn={txn}
                color={color}
                category={item.category}
                showSeparator={i < txnData.items.length - 1}
              />
            ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── InsightsStrip ────────────────────────────────────────────────────────────

function InsightsStrip({
  items,
}: {
  items: CategoryItem[];
}) {
  const top  = items[0];
  const food = items.find((i) => i.category === 'Food & Dining');
  const sub  = items.find((i) => i.category === 'Subscription');

  const insights: { icon: typeof PieChart; text: string; tone: string }[] = [];

  if (top) {
    insights.push({
      icon: PieChart,
      text: `${top.category} is ${top.share_pct.toFixed(0)}% of your spend — the largest single category.`,
      tone: MonikeColors.signalRed,
    });
  }
  if (food) {
    insights.push({
      icon: Utensils,
      text: `Food is ₦${formatNaira(food.total)} this period. Watch the lunch creep.`,
      tone: MonikeColors.signalAmber,
    });
  }
  if (sub) {
    insights.push({
      icon: TrendingUp,
      text: `Subscriptions account for ${sub.share_pct.toFixed(1)}% of spend this period.`,
      tone: MonikeColors.signalRed,
    });
  }

  if (insights.length === 0) return null;

  return (
    <View style={st.insightsSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.insightsContent}
      >
        {insights.map(({ icon: Icon, text, tone }, i) => (
          <View key={i} style={st.insightChip}>
            <Icon size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
            <Text style={st.insightText}>{text}</Text>
            <View style={[st.insightAccent, { backgroundColor: tone }]} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── ErrorBanner ──────────────────────────────────────────────────────────────

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={st.errorWrap}>
      <Text style={st.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={st.retryBtn}>
        <Text style={st.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ─── CategoriesScreen ─────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const [period, setPeriod] = useState<Period>('This Month');
  const [selectedDonut, setSelectedDonut] =
    useState<SelectedCategory | null>(null);
  const [sheetItem, setSheetItem] = useState<{
    item: CategoryItem;
    index: number;
  } | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const apiPeriod: ApiPeriod = periodToApiParam[period] ?? 'month';
  const swrKey = `/categories?period=${apiPeriod}`;

  const fetcher = useCallback(
    (key: string) => apiFetch<CategoriesResponse>(key),
    [],
  );

  const { data, error, isLoading, mutate } =
    useSWR<CategoriesResponse>(swrKey, fetcher);

  useEffect(() => {
    setSelectedDonut(null);
  }, [swrKey]);

  const openCategory = (item: CategoryItem, index: number) => {
    setSelectedDonut({ item, index });
    setSheetItem({ item, index });
    setSheetVisible(true);
  };

  return (
    <View style={st.root}>
      <SafeAreaView style={st.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            st.content,
            { paddingBottom: insets.bottom + BottomTabInset + 24 },
          ]}
        >
          <MonikeHeader title="Categories" />

          <View style={st.titleBlock}>
            <Text style={st.screenTitle}>CATEGORIES</Text>
            {data && (
              <Text style={st.screenSubtitle}>{data.period_label}</Text>
            )}
          </View>

          <PeriodToggle activePeriod={period} onChange={setPeriod} />

          {isLoading && <CategoriesSkeleton />}

          {error && !isLoading && (
            <ErrorBanner
              message={error.message ?? 'Failed to load categories.'}
              onRetry={() => void mutate()}
            />
          )}

          {data && !isLoading && (
            <>
              <DonutChart
                items={data.items}
                totalSpend={data.total_real_spend}
                periodLabel={data.period_label}
                selectedCategory={selectedDonut}
                onSelect={setSelectedDonut}
              />
              <CategoryList
                items={data.items}
                onSelect={openCategory}
              />
              <InsightsStrip items={data.items} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="categories" />

      <CategorySheet
        item={sheetItem?.item ?? null}
        index={sheetItem?.index ?? 0}
        period={apiPeriod}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, gap: 18 },

  titleBlock: { alignItems: 'center', gap: 5 },
  screenTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', letterSpacing: 0.8 },
  screenSubtitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 13 },

  periodToggle: { alignSelf: 'center', width: 240, minHeight: 36, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', padding: 3 },
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
  categoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', backgroundColor: MonikeColors.bgSurface, paddingRight: 12, position: 'relative' },
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

  errorWrap: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  errorText: { color: MonikeColors.signalRed, fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  retryText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
});

const sheetSt = StyleSheet.create({
  backdrop:     { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  sheet:        { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingBottom: 26 },
  dragZone:     { paddingTop: 10, paddingBottom: 12 },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center' },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle:   { width: 44, height: 44, borderRadius: 22, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  title:        { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  total:        { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginTop: 4 },
  closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  closeTxt:     { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 22, lineHeight: 24 },
  statsRow:     { flexDirection: 'row', marginTop: 18, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: MonikeColors.inkGhost },
  statCell:     { flex: 1, backgroundColor: MonikeColors.bgSurface, padding: 10, borderRightWidth: 1, borderRightColor: MonikeColors.inkGhost },
  statLabel:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginBottom: 5 },
  statValue:    { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  shareRow:     { marginTop: 14, gap: 6 },
  shareLabel:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  shareTrack:   { height: 6, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  shareFill:    { height: 6, borderRadius: 3 },
  txnHeading:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 18, marginBottom: 8 },
  txnList:      { flex: 1 },
  note:         { padding: 16, borderRadius: 12, backgroundColor: MonikeColors.bgSurface, marginTop: 4 },
  noteTxt:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
});

const txnSt = StyleSheet.create({
  row:         { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#2A30404D', backgroundColor: MonikeColors.bgSurface },
  rowLast:     { borderBottomWidth: 0 },
  iconCircle:  { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  center:      { flex: 1, minWidth: 0 },
  description: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  date:        { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  right:       { alignItems: 'flex-end', minWidth: 88 },
  amount:      { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' },
});
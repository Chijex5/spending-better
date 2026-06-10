/**
 * Categories — spend breakdown by category
 *
 * Sections:
 *  1. Period picker (pill chips)
 *  2. Summary callout
 *  3. P2P recipients (shown when Person-to-Person category exists — the grouping insight)
 *  4. Category cards (ranked by total spend)
 *  5. CategorySheet (bottom modal — transactions drill-down)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  CreditCard,
  Globe,
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

// Derived from P2P transaction descriptions for the selected period
type ParsedRecipient = {
  name: string;
  total_sent: number;
  transfer_count: number;
  avg_per_transfer: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: Period[] = ['This Month', '3 Months', 'All Time'];

// One consistent palette, same for donut + cards
const PALETTE = [
  '#FF6633', '#7B61FF', '#00C9A7', '#FF9500',
  '#FF3B7A', '#34AADC', '#A5D6A7', '#FFB74D',
  '#EF9A9A', '#90CAF9', '#B0BEC5',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colorForIndex(i: number) { return PALETTE[i % PALETTE.length]; }

function formatNaira(v: number) {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(v));
}
function formatCompact(v: number) {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₦${(v / 1_000).toFixed(0)}K`;
  return `₦${formatNaira(v)}`;
}

function categoryIcon(cat: string) {
  const MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    'Person-to-Person': Users,
    'POS Purchase':     ShoppingBag,
    'Food & Dining':    Utensils,
    'Online Payment':   Globe,
    'Family Transfer':  Users,
    Data:               Wifi,
    Airtime:            Phone,
    Electricity:        Zap,
    Subscription:       CreditCard,
    Savings:            TrendingUp,
    Other:              ReceiptText,
  };
  return MAP[cat] ?? CreditCard;
}

// Extract "Transfer to NAME | REF..." → "NAME"
function extractRecipientName(description: string): string | null {
  const m = description.match(/^Transfer to (.+?)(?:\s*\||\s*$)/i);
  return m ? m[1].trim() : null;
}

// Group P2P transactions by recipient name for the current period
function groupP2PRecipients(txns: CategoryTransaction[]): ParsedRecipient[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const txn of txns) {
    const name = extractRecipientName(txn.description);
    if (!name) continue;
    const prev = map.get(name) ?? { total: 0, count: 0 };
    map.set(name, { total: prev.total + txn.debit, count: prev.count + 1 });
  }
  return Array.from(map.entries())
    .map(([name, { total, count }]) => ({
      name,
      total_sent: total,
      transfer_count: count,
      avg_per_transfer: total / count,
    }))
    .sort((a, b) => b.total_sent - a.total_sent);
}

// Deterministic color from name
function nameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

function Shimmer({ style }: { style?: ViewStyle }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, [a]);
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.16] });
  return <Animated.View style={[{ borderRadius: 8, backgroundColor: MonikeColors.inkPrimary, opacity }, style]} />;
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <View style={{ gap: 24, paddingHorizontal: ScreenPadding, paddingTop: 16 }}>
      <Shimmer style={{ height: 44, borderRadius: CardRadius }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Shimmer style={{ width: 40, height: 40, borderRadius: 20 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Shimmer style={{ height: 12, width: '50%' }} />
              <Shimmer style={{ height: 10, width: '35%' }} />
            </View>
            <Shimmer style={{ height: 20, width: 64 }} />
          </View>
          <Shimmer style={{ height: 6, borderRadius: 3 }} />
        </View>
      ))}
    </View>
  );
}

// ─── Period picker ────────────────────────────────────────────────────────────

function PeriodPicker({ active, onChange }: { active: Period; onChange: (p: Period) => void }) {
  return (
    <View style={st.periodRow}>
      {PERIODS.map((p) => {
        const on = p === active;
        return (
          <Pressable key={p} style={[st.periodChip, on && st.periodChipActive]} onPress={() => onChange(p)}>
            <Text style={[st.periodChipText, on && st.periodChipTextActive]}>{p}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Summary callout ──────────────────────────────────────────────────────────

function SummaryCallout({ data }: { data: CategoriesResponse }) {
  const topCat = data.items[0];
  const sub = topCat
    ? `${topCat.category} leads at ${topCat.share_pct.toFixed(0)}% of spend`
    : `${data.items.length} categories`;

  return (
    <View style={st.summaryCard}>
      <Text style={st.summaryLabel}>TOTAL SPEND · {data.period_label.toUpperCase()}</Text>
      <Text style={st.summaryAmount}>₦{formatNaira(data.total_real_spend)}</Text>
      <Text style={st.summarySub}>{sub}</Text>
    </View>
  );
}

// ─── P2P Recipients section ───────────────────────────────────────────────────

function PersonCard({
  item,
  totalP2P,
  onPress,
}: {
  item: ParsedRecipient;
  totalP2P: number;
  onPress: () => void;
}) {
  const color     = nameColor(item.name);
  const share     = totalP2P > 0 ? (item.total_sent / totalP2P) * 100 : 0;
  const firstName = item.name.split(' ')[0];

  return (
    <Pressable onPress={onPress}>
      <View style={st.personCard}>
        <View style={[st.personAvatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[st.personInitials, { color }]}>{initials(item.name)}</Text>
        </View>
        <Text style={st.personName} numberOfLines={1}>{firstName}</Text>
        <Text style={[st.personAmount, { color }]}>{formatCompact(item.total_sent)}</Text>
        <View style={st.personMeta}>
          <Text style={st.personMetaText}>{item.transfer_count} sends</Text>
        </View>
        <View style={st.personBarTrack}>
          <View style={[st.personBarFill, { width: `${Math.min(share, 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={[st.personShare, { color }]}>{share.toFixed(0)}%</Text>
        <Text style={[st.personTapHint, { color }]}>Tap to view →</Text>
      </View>
    </Pressable>
  );
}

function P2PSection({
  p2pTotal,
  recipients,
  isLoading,
  onPersonPress,
}: {
  p2pTotal: number;
  recipients: ParsedRecipient[];
  isLoading: boolean;
  onPersonPress: (item: ParsedRecipient) => void;
}) {
  const items    = recipients;
  const totalAll = items.reduce((s, i) => s + i.total_sent, 0);

  return (
    <View style={st.sectionWrap}>
      {/* Section head */}
      <View style={st.sectionHead}>
        <View style={[st.sectionIconWrap, { backgroundColor: MonikeColors.accentOrange + '18', borderColor: MonikeColors.accentOrange + '44' }]}>
          <Users size={13} color={MonikeColors.accentOrange} strokeWidth={2.5} />
        </View>
        <Text style={st.sectionLabel}>PERSON-TO-PERSON BREAKDOWN</Text>
      </View>
      <Text style={st.sectionHeadline}>
        {items.length > 0
          ? `${formatCompact(p2pTotal)} sent to ${items.length} ${items.length === 1 ? 'person' : 'people'}`
          : `${formatCompact(p2pTotal)} in P2P transfers`}
      </Text>
      {items.length > 0 && (
        <Text style={st.sectionSub}>
          {items.length >= 3
            ? `${items[0].name.split(' ')[0]}, ${items[1].name.split(' ')[0]}, ${items[2].name.split(' ')[0]} are your top 3 recipients`
            : `${items[0].name.split(' ')[0]} is your biggest recipient`}
        </Text>
      )}

      {/* Person cards */}
      {isLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.personRow, { marginTop: 12 }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={st.personCard}>
              <Shimmer style={{ width: 42, height: 42, borderRadius: 21, alignSelf: 'center' }} />
              <Shimmer style={{ height: 10, width: '75%', alignSelf: 'center', marginTop: 8 }} />
              <Shimmer style={{ height: 16, width: '55%', alignSelf: 'center', marginTop: 6 }} />
            </View>
          ))}
        </ScrollView>
      ) : items.length === 0 ? (
        <View style={[st.card, { padding: 16, marginTop: 10 }]}>
          <Text style={{ color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 12 }}>
            No named recipients found for this period.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.personRow}
          style={{ marginTop: 12 }}
        >
          {items.map((item) => (
            <PersonCard key={item.name} item={item} totalP2P={totalAll} onPress={() => onPersonPress(item)} />
          ))}
        </ScrollView>
      )}

      <Text style={st.p2pNote}>Parsed from transaction descriptions for the selected period</Text>
    </View>
  );
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  item,
  index,
  onPress,
}: {
  item: CategoryItem;
  index: number;
  onPress: () => void;
}) {
  const color    = colorForIndex(index);
  const Icon     = categoryIcon(item.category);
  const barAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: item.share_pct / 100,
      duration: 600,
      delay: index * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [barAnim, item.share_pct, index]);

  const animWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const pressIn  = () => Animated.timing(scaleAnim, { toValue: 0.97, duration: 60, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scaleAnim, { toValue: 1, speed: 22, bounciness: 6, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[st.catCard, { transform: [{ scale: scaleAnim }] }]}>
        {/* Left accent bar */}
        <View style={[st.catAccentBar, { backgroundColor: color }]} />

        <View style={st.catCardInner}>
          {/* Top row: icon + name + amount */}
          <View style={st.catTopRow}>
            <View style={[st.catIconCircle, { backgroundColor: color + '18' }]}>
              <Icon size={18} color={color} strokeWidth={1.9} />
            </View>
            <View style={st.catNameWrap}>
              <Text style={st.catName}>{item.category}</Text>
              <Text style={st.catMeta}>{item.transaction_count} txns · avg ₦{formatNaira(item.avg_per_transaction)}</Text>
            </View>
            <View style={st.catAmountWrap}>
              <Text style={[st.catAmount, { color }]}>₦{formatNaira(item.total)}</Text>
              <Text style={st.catShare}>{item.share_pct.toFixed(1)}%</Text>
            </View>
          </View>

          {/* Share bar */}
          <View style={st.catBarTrack}>
            <Animated.View style={[st.catBarFill, { width: animWidth, backgroundColor: color + 'AA' }]} />
          </View>

          {/* Tap hint */}
          <Text style={st.catTapHint}>Tap to see transactions →</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── PersonTransactionSheet ───────────────────────────────────────────────────

function PersonTransactionSheet({
  person,
  transactions,
  isLoading,
  visible,
  onClose,
}: {
  person: ParsedRecipient | null;
  transactions: { trans_date: string; debit: number }[];
  isLoading: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const windowHeight    = Dimensions.get('window').height;
  const height          = windowHeight * 0.82;
  const translateY      = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => { translateY.setValue(Math.max(0, g.dy)); },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90) onClose();
          else Animated.spring(translateY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : height, duration: visible ? 240 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, height, translateY, visible]);

  if (!person) return null;
  const color = nameColor(person.name);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={sheetSt.backdrop} onPress={onClose}>
        <Animated.View style={[sheetSt.backdropTint, { opacity: backdropOpacity }]} />
      </Pressable>

      <Animated.View style={[sheetSt.sheet, { height, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={sheetSt.dragZone}>
          <View style={sheetSt.handle} />
        </View>

        {/* Header */}
        <View style={sheetSt.headerRow}>
          <View style={sheetSt.titleRow}>
            <View style={[sheetSt.iconCircle, { backgroundColor: color + '22', borderColor: color + '55', borderWidth: 1.5 }]}>
              <Text style={{ fontFamily: Fonts.heading, fontSize: 16, fontWeight: '800', color }}>{initials(person.name)}</Text>
            </View>
            <View>
              <Text style={sheetSt.title}>{person.name}</Text>
              <Text style={[sheetSt.totalText, { color }]}>₦{formatNaira(person.total_sent)}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={sheetSt.closeBtn}>
            <Text style={sheetSt.closeTxt}>×</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={sheetSt.statsRow}>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Total Sent</Text>
            <Text style={[sheetSt.statValue, { color }]}>₦{formatNaira(person.total_sent)}</Text>
          </View>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Transfers</Text>
            <Text style={sheetSt.statValue}>{person.transfer_count}</Text>
          </View>
          <View style={[sheetSt.statCell, { borderRightWidth: 0 }]}>
            <Text style={sheetSt.statLabel}>Avg / Send</Text>
            <Text style={sheetSt.statValue}>₦{formatNaira(person.avg_per_transfer)}</Text>
          </View>
        </View>

        <Text style={sheetSt.txnHeading}>TRANSACTIONS</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={sheetSt.txnList}>
          {isLoading && <TransactionSkeleton />}
          {!isLoading && transactions.length === 0 && (
            <View style={sheetSt.note}><Text style={sheetSt.noteTxt}>No transactions found.</Text></View>
          )}
          {!isLoading && transactions.map((txn, i) => (
            <View key={`${txn.trans_date}-${i}`} style={[txnSt.row, i === transactions.length - 1 && txnSt.rowLast]}>
              <View style={[txnSt.iconCircle, { backgroundColor: color + '18' }]}>
                <Users size={15} color={color} strokeWidth={1.8} />
              </View>
              <View style={txnSt.center}>
                <Text style={txnSt.recipient}>Transfer</Text>
                <Text style={txnSt.date}>{formatDate(txn.trans_date)}</Text>
              </View>
              <Text style={[txnSt.amount, { color }]}>−₦{formatNaira(txn.debit)}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Transaction row (sheet) ──────────────────────────────────────────────────

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
  const Icon  = categoryIcon(category);
  const label = (() => {
    const d = new Date(txn.trans_date);
    return isNaN(d.getTime())
      ? txn.trans_date
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  })();

  // For P2P transactions, extract recipient name from description
  const isPTOP = category === 'Person-to-Person';
  const recipientName = isPTOP
    ? txn.description.replace(/^Transfer to (.+?) \|.*$/, '$1').replace(/^Transfer to /, '')
    : null;

  return (
    <View style={[txnSt.row, !showSeparator && txnSt.rowLast]}>
      <View style={[txnSt.iconCircle, { backgroundColor: color + '18' }]}>
        <Icon size={15} color={color} strokeWidth={1.8} />
      </View>
      <View style={txnSt.center}>
        {isPTOP && recipientName ? (
          <>
            <Text style={txnSt.recipient} numberOfLines={1}>{recipientName}</Text>
            <Text style={txnSt.description} numberOfLines={1}>{txn.description}</Text>
          </>
        ) : (
          <Text numberOfLines={1} style={txnSt.description}>{txn.description}</Text>
        )}
        <Text style={txnSt.date}>{label}</Text>
      </View>
      <Text style={[txnSt.amount, { color }]}>−₦{formatNaira(txn.debit)}</Text>
    </View>
  );
}

function TransactionSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[txnSt.row, i === 3 && txnSt.rowLast]}>
          <Shimmer style={{ width: 36, height: 36, borderRadius: 18 }} />
          <View style={{ flex: 1, marginLeft: 10, gap: 8 }}>
            <Shimmer style={{ height: 12, width: '65%' }} />
            <Shimmer style={{ height: 10, width: '35%' }} />
          </View>
          <Shimmer style={{ height: 14, width: 80 }} />
        </View>
      ))}
    </>
  );
}

// ─── Category sheet (bottom modal) ───────────────────────────────────────────

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
  const windowHeight   = Dimensions.get('window').height;
  const height         = windowHeight * 0.88;
  const translateY     = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const txnKey = item && visible
    ? `/categories/${encodeURIComponent(item.category)}/transactions?period=${period}`
    : null;

  const { data: txnData, isLoading: txnLoading, error: txnError } =
    useSWR<CategoryTransactionsResponse>(txnKey, useCallback((k: string) => apiFetch<CategoryTransactionsResponse>(k), []));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => { translateY.setValue(Math.max(0, g.dy)); },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90) onClose();
          else Animated.spring(translateY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : height, duration: visible ? 240 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, height, translateY, visible]);

  if (!item) return null;

  const color = colorForIndex(index);
  const Icon  = categoryIcon(item.category);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={sheetSt.backdrop} onPress={onClose}>
        <Animated.View style={[sheetSt.backdropTint, { opacity: backdropOpacity }]} />
      </Pressable>

      <Animated.View style={[sheetSt.sheet, { height, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={sheetSt.dragZone}>
          <View style={sheetSt.handle} />
        </View>

        {/* Sheet header */}
        <View style={sheetSt.headerRow}>
          <View style={sheetSt.titleRow}>
            <View style={[sheetSt.iconCircle, { backgroundColor: color + '18' }]}>
              <Icon size={22} color={color} strokeWidth={1.9} />
            </View>
            <View>
              <Text style={sheetSt.title}>{item.category}</Text>
              <Text style={[sheetSt.totalText, { color }]}>₦{formatNaira(item.total)}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={sheetSt.closeBtn}>
            <Text style={sheetSt.closeTxt}>×</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={sheetSt.statsRow}>
          <View style={sheetSt.statCell}>
            <Text style={sheetSt.statLabel}>Spend</Text>
            <Text style={[sheetSt.statValue, { color }]}>₦{formatNaira(item.total)}</Text>
          </View>
          <View style={[sheetSt.statCell, { borderRightWidth: 0 }]}>
            <Text style={sheetSt.statLabel}>Transactions</Text>
            <Text style={sheetSt.statValue}>{item.transaction_count}</Text>
          </View>
          <View style={[sheetSt.statCell, { borderRightWidth: 0 }]}>
            <Text style={sheetSt.statLabel}>Avg / Txn</Text>
            <Text style={sheetSt.statValue}>₦{formatNaira(item.avg_per_transaction)}</Text>
          </View>
        </View>

        {/* Share bar */}
        <View style={sheetSt.shareRow}>
          <Text style={sheetSt.shareLabel}>{item.share_pct.toFixed(1)}% of total spend this period</Text>
          <View style={sheetSt.shareTrack}>
            <View style={[sheetSt.shareFill, { width: `${Math.min(item.share_pct, 100)}%` as `${number}%`, backgroundColor: color }]} />
          </View>
        </View>

        {/* Transactions */}
        <Text style={sheetSt.txnHeading}>TRANSACTIONS</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={sheetSt.txnList}>
          {txnLoading && <TransactionSkeleton />}
          {txnError && !txnLoading && (
            <View style={sheetSt.note}><Text style={sheetSt.noteTxt}>Could not load transactions.</Text></View>
          )}
          {txnData && !txnLoading && txnData.items.length === 0 && (
            <View style={sheetSt.note}><Text style={sheetSt.noteTxt}>No transactions for this period.</Text></View>
          )}
          {txnData && !txnLoading && txnData.items.map((txn, i) => (
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const insets   = useSafeAreaInsets();
  const [period, setPeriod]   = useState<Period>('This Month');
  const [sheetItem, setSheetItem] = useState<{ item: CategoryItem; index: number } | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [personSheetItem, setPersonSheetItem] = useState<ParsedRecipient | null>(null);
  const [personSheetVisible, setPersonSheetVisible] = useState(false);

  const apiPeriod: ApiPeriod = periodToApiParam[period] ?? 'month';
  const catKey = `/categories?period=${apiPeriod}`;

  const { data, error, isLoading, mutate } = useSWR<CategoriesResponse>(
    catKey,
    useCallback((k: string) => apiFetch<CategoriesResponse>(k), []),
  );

  // Reset sheet when period changes
  useEffect(() => { setSheetVisible(false); }, [apiPeriod]);

  const p2pItem = useMemo(() => {
    if (!data) return null;
    return data.items.find((i) => i.category === 'Person-to-Person') ?? null;
  }, [data]);

  // Fetch P2P transactions for the current period to derive per-person breakdown
  const p2pTxnKey = p2pItem
    ? `/categories/Person-to-Person/transactions?period=${apiPeriod}`
    : null;
  const { data: p2pTxnData, isLoading: p2pLoading } = useSWR<CategoryTransactionsResponse>(
    p2pTxnKey,
    useCallback((k: string) => apiFetch<CategoryTransactionsResponse>(k), []),
  );

  const parsedRecipients = useMemo<ParsedRecipient[]>(() => {
    if (!p2pTxnData) return [];
    return groupP2PRecipients(p2pTxnData.items);
  }, [p2pTxnData]);

  const otherItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((i) => i.category !== 'Person-to-Person');
  }, [data]);

  const openSheet = (item: CategoryItem, index: number) => {
    setSheetItem({ item, index });
    setSheetVisible(true);
  };

  const openPersonSheet = (person: ParsedRecipient) => {
    setPersonSheetItem(person);
    setPersonSheetVisible(true);
  };

  const personTransactions = useMemo(() => {
    if (!personSheetItem || !p2pTxnData) return [];
    return p2pTxnData.items.filter(
      (txn) => extractRecipientName(txn.description) === personSheetItem.name,
    );
  }, [personSheetItem, p2pTxnData]);

  return (
    <View style={st.root}>
      <SafeAreaView style={st.safeArea} edges={['top']}>
        <MonikeHeader title="Spend" subtitle="Category breakdown" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[st.content, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        >
          {/* Period picker */}
          <PeriodPicker active={period} onChange={(p) => { setPeriod(p); }} />

          {/* Loading */}
          {isLoading && <PageSkeleton />}

          {/* Error */}
          {error && !isLoading && (
            <View style={st.errorWrap}>
              <Text style={st.errorText}>Failed to load categories</Text>
              <Pressable onPress={() => void mutate()} style={st.retryBtn}>
                <Text style={st.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Content */}
          {data && !isLoading && (
            <>
              {/* Summary */}
              <SummaryCallout data={data} />

              {/* P2P people grouping — period-accurate, parsed from descriptions */}
              {p2pItem && (
                <P2PSection
                  p2pTotal={p2pItem.total}
                  recipients={parsedRecipients}
                  isLoading={p2pLoading}
                  onPersonPress={openPersonSheet}
                />
              )}

              {/* P2P category card */}
              {p2pItem && (
                <View style={st.sectionWrap}>
                  <Text style={st.categoryGroupLabel}>P2P · tap to see individual transactions</Text>
                  <CategoryCard
                    item={p2pItem}
                    index={data.items.indexOf(p2pItem)}
                    onPress={() => openSheet(p2pItem, data.items.indexOf(p2pItem))}
                  />
                </View>
              )}

              {/* All other categories */}
              {otherItems.length > 0 && (
                <View style={st.sectionWrap}>
                  {p2pItem && <Text style={st.categoryGroupLabel}>OTHER CATEGORIES</Text>}
                  <View style={st.catList}>
                    {otherItems.map((item) => {
                      const realIndex = data.items.indexOf(item);
                      return (
                        <CategoryCard
                          key={item.category}
                          item={item}
                          index={realIndex}
                          onPress={() => openSheet(item, realIndex)}
                        />
                      );
                    })}
                  </View>
                </View>
              )}
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

      <PersonTransactionSheet
        person={personSheetItem}
        transactions={personTransactions}
        isLoading={p2pLoading}
        visible={personSheetVisible}
        onClose={() => setPersonSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea:{ flex: 1 },
  content: { paddingHorizontal: ScreenPadding, gap: 0, paddingTop: 12 },

  // Period
  periodRow:        { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  periodChipActive: { backgroundColor: MonikeColors.accentOrange, borderColor: MonikeColors.accentOrange },
  periodChipText:   { color: MonikeColors.inkMuted, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600' },
  periodChipTextActive: { color: '#FFFFFF' },

  // Summary callout
  summaryCard:   {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1,
    borderColor: MonikeColors.inkGhost, borderRadius: CardRadius,
    padding: 18, marginBottom: 24,
  },
  summaryLabel:  { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 },
  summaryAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  summarySub:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, marginTop: 4 },

  // Section wrapper
  sectionWrap:     { marginBottom: 24 },
  sectionHead:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionIconWrap: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  sectionHeadline: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', lineHeight: 24, letterSpacing: -0.3 },
  sectionSub:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 4 },

  // P2P people
  personRow:      { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  personCard:     { width: 120, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 16, padding: 12 },
  personAvatar:   { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  personInitials: { fontFamily: Fonts.heading, fontSize: 14, fontWeight: '800' },
  personName:     { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 3 },
  personAmount:   { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  personMeta:     { alignItems: 'center', marginTop: 3 },
  personMetaText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  personBarTrack: { height: 3, borderRadius: 2, backgroundColor: MonikeColors.bgElevated, marginTop: 8, overflow: 'hidden' },
  personBarFill:  { height: '100%', borderRadius: 2 },
  personShare:    { fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  personTapHint:  { fontFamily: Fonts.sans, fontSize: 9, marginTop: 3, opacity: 0.55 },
  p2pNote:        { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10, marginTop: 8 },

  // Category group label
  categoryGroupLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 },

  // Category cards
  catList:    { gap: 10 },
  catCard:    {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, flexDirection: 'row', overflow: 'hidden',
  },
  catAccentBar: { width: 5 },
  catCardInner: { flex: 1, padding: 14 },
  catTopRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  catIconCircle:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catNameWrap:  { flex: 1 },
  catName:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  catMeta:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 2 },
  catAmountWrap:{ alignItems: 'flex-end' },
  catAmount:    { fontFamily: Fonts.mono, fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  catShare:     { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, marginTop: 2 },
  catBarTrack:  { height: 5, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden', marginBottom: 8 },
  catBarFill:   { height: '100%', borderRadius: 3 },
  catTapHint:   { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10 },

  // Shared card
  card: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius },

  // Error
  errorWrap: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  errorText: { color: MonikeColors.signalRed, fontFamily: Fonts.sans, fontSize: 13 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  retryText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
});

const sheetSt = StyleSheet.create({
  backdrop:      { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  sheet:         { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingBottom: 26 },
  dragZone:      { paddingTop: 10, paddingBottom: 12 },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center' },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title:         { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700' },
  totalText:     { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginTop: 3 },
  closeBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  closeTxt:      { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 22, lineHeight: 24 },
  statsRow:      { flexDirection: 'row', marginTop: 18, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: MonikeColors.inkGhost },
  statCell:      { flex: 1, backgroundColor: MonikeColors.bgSurface, padding: 10, borderRightWidth: 1, borderRightColor: MonikeColors.inkGhost },
  statLabel:     { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginBottom: 5 },
  statValue:     { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  shareRow:      { marginTop: 14, gap: 6 },
  shareLabel:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  shareTrack:    { height: 6, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  shareFill:     { height: 6, borderRadius: 3 },
  txnHeading:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 18, marginBottom: 8 },
  txnList:       { flex: 1 },
  note:          { padding: 16, borderRadius: 12, backgroundColor: MonikeColors.bgSurface, marginTop: 4 },
  noteTxt:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
});

const txnSt = StyleSheet.create({
  row:         { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: '#2A30404D', backgroundColor: MonikeColors.bgSurface },
  rowLast:     { borderBottomWidth: 0 },
  iconCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  center:      { flex: 1, minWidth: 0 },
  recipient:   { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700' },
  description: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  date:        { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },
  amount:      { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600', marginLeft: 8 },
});

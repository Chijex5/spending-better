import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type Transaction = {
  id: string;
  merchant: string;
  category: string;
  time: string;
  amount: number;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
};

type Category = {
  name: string;
  amount: number;
  budget: number;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
};

const spendBars = [56, 72, 43, 92, 66, 108, 81];
const transactions: Transaction[] = [
  { id: 'tr-01', merchant: 'Uber Trip', category: 'Transport', time: '08:42', amount: -4200, risk: 'HIGH' },
  { id: 'tr-02', merchant: 'Cowrywise', category: 'Savings', time: '09:10', amount: -50000, risk: 'LOW' },
  { id: 'tr-03', merchant: 'Paystack Payout', category: 'Income', time: '11:35', amount: 185000, risk: 'LOW' },
  { id: 'tr-04', merchant: 'Chicken Republic', category: 'Food', time: '13:06', amount: -7800, risk: 'MEDIUM' },
];
const categories: Category[] = [
  { name: 'Food', amount: 128400, budget: 150000, risk: 'MEDIUM' },
  { name: 'Transport', amount: 74500, budget: 65000, risk: 'HIGH' },
  { name: 'Subscriptions', amount: 31900, budget: 42000, risk: 'LOW' },
];
const tabs = ['Mirror', 'Ledger', 'Signals', 'Profile'] as const;

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.abs(value));
}

function Money({ value, size = 'regular', tone }: { value: number; size?: 'hero' | 'regular' | 'small'; tone?: string }) {
  const color = tone ?? (value < 0 ? MonikeColors.signalRed : MonikeColors.signalBlue);
  return (
    <Text style={[styles.money, styles[`${size}Money`], { color }]}>
      <Text style={styles[`${size}Naira`]}>₦</Text>
      {formatNaira(value)}
    </Text>
  );
}

function Caption({ children, style }: { children: string; style?: ViewStyle }) {
  return <Text style={[styles.caption, style]}>{children}</Text>;
}

function RiskBadge({ risk }: { risk: Category['risk'] }) {
  const palette = {
    HIGH: { color: MonikeColors.signalRed, backgroundColor: '#FF3D3D22', borderColor: '#FF3D3D44' },
    MEDIUM: { color: MonikeColors.signalAmber, backgroundColor: '#FFB30022', borderColor: '#FFB30044' },
    LOW: { color: MonikeColors.accentPulse, backgroundColor: '#00E67622', borderColor: '#00E67644' },
  }[risk];

  return <Text style={[styles.riskBadge, palette]}>{risk}</Text>;
}

function Card({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: ViewStyle }) {
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animation, {
      toValue: 1,
      delay,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animation, delay]);

  return (
    <Animated.View
      style={[
        styles.card,
        style,
        {
          opacity: animation,
          transform: [
            {
              translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

function PressScale({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
      <View style={[style, pressed && styles.pressed]}>{children}</View>
    </Pressable>
  );
}

function LineIcon({ name, active = false }: { name: 'home' | 'ledger' | 'signal' | 'user'; active?: boolean }) {
  return (
    <View style={[styles.iconBox, active && styles.iconBoxActive]}>
      {name === 'home' && <View style={styles.iconRoof} />}
      {name === 'ledger' && <View style={styles.iconLedger} />}
      {name === 'signal' && <View style={styles.iconSignal} />}
      {name === 'user' && <View style={styles.iconUser} />}
    </View>
  );
}

function SpendChart() {
  const max = Math.max(...spendBars);
  return (
    <View style={styles.chartWrap}>
      {spendBars.map((value, index) => {
        const height = 36 + (value / max) * 92;
        const high = value > 95;
        return (
          <View key={`${value}-${index}`} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { height, backgroundColor: high ? MonikeColors.signalRed : MonikeColors.accentPulse },
                ]}
              />
            </View>
            <Text style={styles.axisLabel}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CategoryRow({ item }: { item: Category }) {
  const ratio = item.amount / item.budget;
  const over = ratio > 1;
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryHeader}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Money value={-item.amount} size="small" tone={over ? MonikeColors.signalRed : MonikeColors.inkPrimary} />
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: over ? MonikeColors.signalRed : MonikeColors.accentPulse },
          ]}
        />
      </View>
      <View style={styles.categoryMeta}>
        <Text style={styles.mutedText}>{Math.round(ratio * 100)}% of budget</Text>
        <RiskBadge risk={item.risk} />
      </View>
    </View>
  );
}

export default function MonikeHome() {
  const todayBurn = useMemo(() => transactions.reduce((sum, item) => (item.amount < 0 ? sum + item.amount : sum), 0), []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Caption>MONIKE / DARK LEDGER</Caption>
              <Text style={styles.title}>Spending Mirror</Text>
            </View>
            <PressScale style={styles.syncPill}>
              <View style={styles.liveDot} />
              <Text style={styles.syncText}>LIVE</Text>
            </PressScale>
          </View>

          <Card delay={0} style={styles.heroCard}>
            <View style={styles.cardTopline}>
              <Caption>TODAY'S NET BURN</Caption>
              <Text style={styles.dateStamp}>05 JUN</Text>
            </View>
            <Money value={todayBurn} size="hero" tone={MonikeColors.inkPrimary} />
            <View style={styles.heroMetaRow}>
              <View>
                <Text style={styles.metaLabel}>Velocity</Text>
                <Text style={styles.metaValue}>+18.7%</Text>
              </View>
              <View style={styles.verticalDivider} />
              <View>
                <Text style={styles.metaLabel}>Projected month</Text>
                <Text style={[styles.metaValue, styles.redText]}>₦1.42M</Text>
              </View>
              <RiskBadge risk="MEDIUM" />
            </View>
          </Card>

          <Card delay={60}>
            <View style={styles.cardTopline}>
              <Caption>7-DAY SPEND PRESSURE</Caption>
              <Text style={styles.monoSecondary}>₦000s</Text>
            </View>
            <SpendChart />
          </Card>

          <View style={styles.metricsGrid}>
            <Card delay={120} style={styles.metricCard}>
              <Caption>INCOME</Caption>
              <Money value={185000} size="regular" tone={MonikeColors.signalBlue} />
              <Text style={styles.mutedText}>1 credit observed</Text>
            </Card>
            <Card delay={180} style={styles.metricCard}>
              <Caption>LEAKAGE</Caption>
              <Money value={-12000} size="regular" tone={MonikeColors.signalAmber} />
              <Text style={styles.mutedText}>avoidable today</Text>
            </Card>
          </View>

          <Card delay={240}>
            <View style={styles.cardTopline}>
              <Caption>CATEGORY DISCIPLINE</Caption>
              <Text style={styles.monoSecondary}>BUDGET</Text>
            </View>
            {categories.map((category) => (
              <CategoryRow key={category.name} item={category} />
            ))}
          </Card>

          <Card delay={300} style={styles.ledgerCard}>
            <View style={styles.cardTopline}>
              <Caption>RECENT LEDGER</Caption>
              <Text style={styles.monoSecondary}>RIGHT-ALIGNED</Text>
            </View>
            {transactions.map((transaction, index) => (
              <View key={transaction.id} style={[styles.transactionRow, index % 2 === 1 && styles.stripedRow]}>
                <View style={styles.transactionCopy}>
                  <Text style={styles.rowTitle}>{transaction.merchant}</Text>
                  <Text style={styles.rowSubtitle}>{transaction.category} · {transaction.time}</Text>
                </View>
                <View style={styles.amountColumn}>
                  <Money value={transaction.amount} size="small" />
                  <RiskBadge risk={transaction.risk} />
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>

      <View style={styles.bottomNav}>
        {tabs.map((tab, index) => {
          const active = index === 0;
          const iconName = (['home', 'ledger', 'signal', 'user'] as const)[index];
          return (
            <PressScale key={tab} style={styles.navItem}>
              <LineIcon name={iconName} active={active} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab}</Text>
              {active && <View style={styles.navDot} />}
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 8, paddingBottom: BottomTabInset + 28, gap: 14 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  caption: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, letterSpacing: 0.44, textTransform: 'uppercase', fontWeight: '700' },
  syncPill: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#00E67644', backgroundColor: '#00E67616', flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.accentPulse },
  syncText: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  card: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 8 },
  heroCard: { gap: 16 },
  cardTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dateStamp: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '600' },
  money: { fontFamily: Fonts.mono, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '600' },
  heroMoney: { fontSize: 44, lineHeight: 52, letterSpacing: -0.88, textAlign: 'left', color: MonikeColors.inkPrimary },
  regularMoney: { fontSize: 20, lineHeight: 28 },
  smallMoney: { fontSize: 14, lineHeight: 20 },
  heroNaira: { fontSize: 35.2 },
  regularNaira: { fontSize: 16 },
  smallNaira: { fontSize: 11.2 },
  heroMetaRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2A304099' },
  metaLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  metaValue: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700', marginTop: 4 },
  redText: { color: MonikeColors.signalRed },
  verticalDivider: { width: 1, height: 34, backgroundColor: '#2A304099' },
  riskBadge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', alignSelf: 'flex-start' },
  chartWrap: { height: 168, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2A304066' },
  barColumn: { alignItems: 'center', gap: 8 },
  barTrack: { width: 28, height: 132, borderRadius: 4, backgroundColor: MonikeColors.bgElevated, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axisLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 10 },
  monoSecondary: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' },
  metricsGrid: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, gap: 8 },
  mutedText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16 },
  categoryRow: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#2A304099', gap: 8 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  categoryMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ledgerCard: { paddingHorizontal: 0, paddingBottom: 8 },
  transactionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: '#2A304099' },
  stripedRow: { backgroundColor: MonikeColors.bgStripe },
  transactionCopy: { flex: 1, paddingRight: 12 },
  rowSubtitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, marginTop: 3 },
  amountColumn: { alignItems: 'flex-end', gap: 4 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BottomTabInset, backgroundColor: '#0F1214F2', borderTopWidth: 1, borderTopColor: MonikeColors.inkGhost, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 10 },
  navItem: { width: 78, height: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '700' },
  navLabelActive: { color: MonikeColors.accentPulse },
  navDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: MonikeColors.accentPulse },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  iconBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  iconBoxActive: { borderColor: MonikeColors.accentPulse },
  iconRoof: { width: 15, height: 15, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: MonikeColors.accentPulse, transform: [{ rotate: '-45deg' }], borderRadius: 2 },
  iconLedger: { width: 16, height: 18, borderWidth: 2, borderColor: MonikeColors.inkMuted, borderRadius: 3, borderTopWidth: 4 },
  iconSignal: { width: 18, height: 18, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: MonikeColors.inkMuted, transform: [{ rotate: '-20deg' }] },
  iconUser: { width: 17, height: 17, borderWidth: 2, borderColor: MonikeColors.inkMuted, borderRadius: 9 },
});

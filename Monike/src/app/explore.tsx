import { BarChart3, Search } from 'lucide-react-native';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { layout, monikeColors, monikeFonts, spacing } from '@/constants/theme';

type LedgerItem = {
  merchant: string;
  category: string;
  amount: string;
  credit?: boolean;
  risk: 'high' | 'medium' | 'low';
};

const ledger: LedgerItem[] = [
  { merchant: 'Jumia Food', category: 'Dining', amount: '12,500', risk: 'high' },
  { merchant: 'Flutterwave', category: 'Project payout', amount: '180,000', credit: true, risk: 'low' },
  { merchant: 'Uber NG', category: 'Transport', amount: '8,400', risk: 'medium' },
  { merchant: 'DSTV', category: 'Utilities', amount: '16,000', risk: 'low' },
  { merchant: 'Steam Store', category: 'Impulse', amount: '21,999', risk: 'high' },
];

function AmountCell({ credit, amount }: { credit?: boolean; amount: string }) {
  return (
    <Text style={[styles.amount, { color: credit ? monikeColors.signalBlue : monikeColors.signalRed }]}>
      <Text style={styles.nairaSmall}>₦</Text>
      {amount}
    </Text>
  );
}

function RiskPill({ risk }: { risk: LedgerItem['risk'] }) {
  const theme = {
    high: { text: monikeColors.signalRed, bg: '#FF3D3D22', border: '#FF3D3D44' },
    medium: { text: monikeColors.signalAmber, bg: '#FFB30022', border: '#FFB30044' },
    low: { text: monikeColors.accentPulse, bg: '#00E67622', border: '#00E67644' },
  }[risk];

  return (
    <View style={[styles.pill, { backgroundColor: theme.bg, borderColor: theme.border }]}> 
      <Text style={[styles.pillText, { color: theme.text }]}>{risk}</Text>
    </View>
  );
}

export default function LedgerScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.caption}>SPEND LEDGER</Text>
        <Text style={styles.title}>Precision Feed</Text>

        <Pressable style={({ pressed }) => [styles.searchCard, pressed && styles.pressed]}>
          <Search color={monikeColors.inkSecondary} size={20} />
          <Text style={styles.searchText}>Filter by merchant, date, category...</Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowInline}>
              <BarChart3 size={20} color={monikeColors.accentPulse} />
              <Text style={styles.cardHeading}>Spend bars</Text>
            </View>
            <Text style={styles.caption}>THIS WEEK</Text>
          </View>
          <Svg height="130" width="100%" viewBox="0 0 320 130">
            <Line x1="8" y1="110" x2="312" y2="110" stroke={monikeColors.inkGhost} strokeDasharray="4 4" strokeOpacity={0.4} />
            <Rect x="24" y="76" width="34" height="34" rx="4" fill={monikeColors.accentPulse} />
            <Rect x="78" y="62" width="34" height="48" rx="4" fill={monikeColors.accentPulse} />
            <Rect x="132" y="42" width="34" height="68" rx="4" fill={monikeColors.signalRed} />
            <Rect x="186" y="66" width="34" height="44" rx="4" fill={monikeColors.accentPulse} />
            <Rect x="240" y="30" width="34" height="80" rx="4" fill={monikeColors.signalRed} />
          </Svg>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardHeading}>Recent movements</Text>
            <Text style={styles.caption}>RIGHT ALIGNED ₦</Text>
          </View>

          {ledger.map((item, index) => (
            <View
              key={`${item.merchant}-${index}`}
              style={[styles.ledgerRow, index % 2 === 0 && styles.stripedRow]}>
              <View style={styles.ledgerLeft}>
                <Text style={styles.merchant}>{item.merchant}</Text>
                <Text style={styles.meta}>{item.category}</Text>
              </View>
              <View style={styles.ledgerRight}>
                <AmountCell amount={item.amount} credit={item.credit} />
                <RiskPill risk={item.risk} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: monikeColors.bgVoid,
  },
  content: {
    paddingTop: layout.statusBarClearance,
    paddingHorizontal: layout.horizontalPadding,
    paddingBottom: layout.bottomNavHeight + spacing.xl,
    gap: spacing.md,
  },
  caption: {
    color: monikeColors.inkSecondary,
    fontFamily: monikeFonts.body,
    fontSize: 11,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
  },
  title: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.heading,
    fontSize: 32,
    marginTop: -4,
  },
  searchCard: {
    backgroundColor: monikeColors.bgElevated,
    borderColor: monikeColors.inkGhost,
    borderWidth: 1,
    borderRadius: layout.cardRadius,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  searchText: {
    color: monikeColors.inkMuted,
    fontFamily: monikeFonts.bodyRegular,
    fontSize: 14,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  card: {
    backgroundColor: monikeColors.bgSurface,
    borderColor: monikeColors.inkGhost,
    borderWidth: 1,
    borderRadius: layout.cardRadius,
    padding: layout.cardPadding,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardHeading: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.heading,
    fontSize: 18,
  },
  ledgerRow: {
    minHeight: layout.rowHeight,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  stripedRow: {
    backgroundColor: monikeColors.bgStripe,
  },
  ledgerLeft: {
    gap: 2,
  },
  merchant: {
    color: monikeColors.inkPrimary,
    fontFamily: monikeFonts.body,
    fontSize: 15,
  },
  meta: {
    color: monikeColors.inkSecondary,
    fontFamily: monikeFonts.bodyRegular,
    fontSize: 12,
  },
  ledgerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amount: {
    fontFamily: monikeFonts.monoBold,
    fontSize: 14,
    textAlign: 'right',
  },
  nairaSmall: {
    fontSize: 11,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  pillText: {
    fontFamily: monikeFonts.monoBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
});

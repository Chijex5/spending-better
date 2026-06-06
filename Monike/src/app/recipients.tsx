import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, RefreshCw, Search, Users, X } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type SortKey = 'total' | 'transfers' | 'recent' | 'average';

type RecipientTransaction = {
  id: string;
  date: string;
  sortDate: string;
  description: string;
  amount: number;
};

type Recipient = {
  id: string;
  name: string;
  total: number;
  transfers: number;
  monthsActive: number;
  mostRecent: string;
  recentRank: number;
  recurring: boolean;
  monthly: number[];
  transactions: RecipientTransaction[];
};

const sortLabels: Record<SortKey, string> = {
  total: 'Total sent',
  transfers: '# of transfers',
  recent: 'Most recent',
  average: 'Avg per transfer',
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

const recipients: Recipient[] = [
  {
    id: 'ade',
    name: 'Adeola Martins',
    total: 286500,
    transfers: 9,
    monthsActive: 6,
    mostRecent: '4 Jun',
    recentRank: 1,
    recurring: true,
    monthly: [35000, 42000, 0, 52000, 59500, 49000],
    transactions: [
      { id: 'ade-1', date: '4 Jun', sortDate: '2026-06-04', description: 'Rent support and utilities split', amount: -49000 },
      { id: 'ade-2', date: '24 May', sortDate: '2026-05-24', description: 'Weekend market contribution', amount: -19500 },
      { id: 'ade-3', date: '2 May', sortDate: '2026-05-02', description: 'Monthly apartment transfer', amount: -40000 },
      { id: 'ade-4', date: '29 Apr', sortDate: '2026-04-29', description: 'Shared repair payment', amount: -52000 },
      { id: 'ade-5', date: '15 Feb', sortDate: '2026-02-15', description: 'Household restock', amount: -42000 },
      { id: 'ade-6', date: '7 Jan', sortDate: '2026-01-07', description: 'New year family errand', amount: -35000 },
    ],
  },
  {
    id: 'mariam',
    name: 'Mariam Okafor',
    total: 214000,
    transfers: 7,
    monthsActive: 5,
    mostRecent: '3 Jun',
    recentRank: 2,
    recurring: false,
    monthly: [20000, 38000, 41000, 34000, 51000, 26000],
    transactions: [
      { id: 'mar-1', date: '3 Jun', sortDate: '2026-06-03', description: 'Event balance transfer', amount: -26000 },
      { id: 'mar-2', date: '21 May', sortDate: '2026-05-21', description: 'Groceries reimbursement', amount: -31000 },
      { id: 'mar-3', date: '6 May', sortDate: '2026-05-06', description: 'Dinner and ride share', amount: -20000 },
      { id: 'mar-4', date: '19 Apr', sortDate: '2026-04-19', description: 'Supplies pickup', amount: -34000 },
      { id: 'mar-5', date: '11 Mar', sortDate: '2026-03-11', description: 'Joint gift contribution', amount: -41000 },
      { id: 'mar-6', date: '4 Feb', sortDate: '2026-02-04', description: 'School fees help', amount: -38000 },
    ],
  },
  {
    id: 'kola',
    name: 'Kola Adebayo',
    total: 183750,
    transfers: 6,
    monthsActive: 4,
    mostRecent: '28 May',
    recentRank: 4,
    recurring: true,
    monthly: [0, 25000, 30000, 28750, 80000, 20000],
    transactions: [
      { id: 'kol-1', date: '28 May', sortDate: '2026-05-28', description: 'Coworking contribution', amount: -50000 },
      { id: 'kol-2', date: '16 May', sortDate: '2026-05-16', description: 'Monthly data and power split', amount: -30000 },
      { id: 'kol-3', date: '19 Apr', sortDate: '2026-04-19', description: 'Fuel support transfer', amount: -28750 },
      { id: 'kol-4', date: '23 Mar', sortDate: '2026-03-23', description: 'Project material run', amount: -30000 },
      { id: 'kol-5', date: '8 Feb', sortDate: '2026-02-08', description: 'Internet subscription split', amount: -25000 },
      { id: 'kol-6', date: '5 Jun', sortDate: '2026-06-05', description: 'Shared lunch settlement', amount: -20000 },
    ],
  },
  {
    id: 'tunde',
    name: 'Tunde Balogun',
    total: 124400,
    transfers: 5,
    monthsActive: 5,
    mostRecent: '1 Jun',
    recentRank: 3,
    recurring: false,
    monthly: [18000, 24000, 16000, 30200, 26000, 6200],
    transactions: [
      { id: 'tun-1', date: '1 Jun', sortDate: '2026-06-01', description: 'Transport refund', amount: -6200 },
      { id: 'tun-2', date: '27 May', sortDate: '2026-05-27', description: 'Birthday group contribution', amount: -26000 },
      { id: 'tun-3', date: '15 Apr', sortDate: '2026-04-15', description: 'Apartment supplies split', amount: -30200 },
      { id: 'tun-4', date: '18 Mar', sortDate: '2026-03-18', description: 'Movie tickets reimbursement', amount: -16000 },
      { id: 'tun-5', date: '10 Feb', sortDate: '2026-02-10', description: 'Team lunch transfer', amount: -24000 },
    ],
  },
  {
    id: 'zainab',
    name: 'Zainab Bello',
    total: 88500,
    transfers: 3,
    monthsActive: 3,
    mostRecent: '19 May',
    recentRank: 5,
    recurring: false,
    monthly: [0, 0, 15000, 31500, 40000, 12000],
    transactions: [
      { id: 'zai-1', date: '19 May', sortDate: '2026-05-19', description: 'Bridal shower contribution', amount: -40000 },
      { id: 'zai-2', date: '27 Apr', sortDate: '2026-04-27', description: 'Errand payment', amount: -31500 },
      { id: 'zai-3', date: '14 Mar', sortDate: '2026-03-14', description: 'Data support transfer', amount: -15000 },
    ],
  },
];

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function truncateName(name: string) {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

function recipientColor(name: string) {
  const first = name.trim().charAt(0).toUpperCase();
  if (first >= 'A' && first <= 'D') return '#FF8A65';
  if (first >= 'E' && first <= 'H') return '#4FC3F7';
  if (first >= 'I' && first <= 'L') return '#CE93D8';
  if (first >= 'M' && first <= 'P') return '#FFB300';
  if (first >= 'Q' && first <= 'T') return '#00E676';
  return '#EF9A9A';
}

function average(recipient: Recipient) {
  return recipient.total / recipient.transfers;
}

function PressScale({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(scale, { toValue: 0.97, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const color = recipientColor(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}> 
      <Text style={[styles.avatarLetter, { fontSize: size === 56 ? 22 : 18 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <View style={styles.miniBars}>
      {values.map((value, index) => (
        <View key={`${value}-${index}`} style={styles.miniSlot}>
          <View style={[styles.miniBar, { height: Math.max(3, (value / max) * 24), backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

function SearchBar({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <View style={styles.searchBar}>
      <Search size={16} color={MonikeColors.inkMuted} strokeWidth={1.8} />
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search recipient..."
        placeholderTextColor={MonikeColors.inkMuted}
        style={styles.searchInput}
        selectionColor={MonikeColors.accentPulse}
      />
      {query ? (
        <Pressable style={styles.clearButton} onPress={() => onQueryChange('')}>
          <X size={15} color={MonikeColors.inkMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SortControl({ sort, onSortChange }: { sort: SortKey; onSortChange: (sort: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const options: SortKey[] = ['total', 'transfers', 'recent', 'average'];
  return (
    <View style={styles.sortWrap}>
      <Pressable style={styles.sortButton} onPress={() => setOpen((value) => !value)}>
        <Text style={styles.sortText}>Sort: {sort === 'total' ? 'Total' : sortLabels[sort]}</Text>
        <ChevronDown size={13} color={MonikeColors.inkSecondary} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View style={styles.sortMenu}>
          {options.map((option) => {
            const selected = option === sort;
            return (
              <Pressable
                key={option}
                style={styles.sortOption}
                onPress={() => {
                  onSortChange(option);
                  setOpen(false);
                }}
              >
                <Text style={styles.sortBullet}>{selected ? '●' : '○'}</Text>
                <Text style={[styles.sortOptionText, selected && styles.sortOptionActive]}>{sortLabels[option]}</Text>
                {selected ? <Check size={12} color={MonikeColors.accentPulse} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function RecipientCard({ recipient, recurring, onPress }: { recipient: Recipient; recurring: boolean; onPress: () => void }) {
  const color = recipientColor(recipient.name);
  return (
    <PressScale style={styles.recipientCard} onPress={onPress}>
      <Avatar name={recipient.name} />
      <View style={styles.recipientCenter}>
        <Text numberOfLines={1} style={styles.recipientName}>{truncateName(recipient.name)}</Text>
        <Text style={[styles.totalText, { color }]}>₦{formatNaira(recipient.total)}</Text>
        <Text style={styles.metaText}>{recipient.transfers} transfers <Text style={styles.dot}>·</Text> avg ₦{formatNaira(average(recipient))}</Text>
      </View>
      <View style={styles.recipientRight}>
        {recurring ? <Text style={styles.recurringPill}>🔁 RECURRING</Text> : null}
        <MiniBars values={recipient.monthly} color={color} />
        <Text style={styles.recentDate}>{recipient.mostRecent}</Text>
      </View>
    </PressScale>
  );
}

function NoticeCard() {
  return (
    <View style={styles.noticeCard}>
      <Users size={32} color={MonikeColors.inkGhost} strokeWidth={1.6} />
      <Text style={styles.noticeText}>Most recipients need 3+ transfers to appear here. Keep logging to build your picture.</Text>
    </View>
  );
}

function DetailSheet({ recipient, recurring, onRecurringChange, onClose }: { recipient: Recipient | null; recurring: boolean; onRecurringChange: (value: boolean) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!recipient) return null;
  const color = recipientColor(recipient.name);
  const max = Math.max(...recipient.monthly, 1);
  const sortedTransactions = [...recipient.transactions].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  return (
    <Modal transparent visible={Boolean(recipient)} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.sheetHandle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHero}>
            <Avatar name={recipient.name} size={56} />
            <View style={styles.sheetHeroText}>
              <Text style={styles.sheetName}>{recipient.name}</Text>
              <Text style={[styles.sheetAmount, { color }]}>₦{formatNaira(recipient.total)}</Text>
              <Text style={styles.sheetSub}>{recipient.transfers} transfers over {recipient.monthsActive} months</Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <StatBox label="Total Sent" value={`₦${formatNaira(recipient.total)}`} />
            <StatBox label="Avg/Transfer" value={`₦${formatNaira(average(recipient))}`} />
            <StatBox label="Last Transfer" value={recipient.mostRecent} />
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleLabelRow}>
              <RefreshCw size={16} color={recurring ? MonikeColors.accentPulse : MonikeColors.inkSecondary} strokeWidth={1.9} />
              <Text style={styles.toggleLabel}>Recurring Transfer</Text>
            </View>
            <Switch
              value={recurring}
              onValueChange={onRecurringChange}
              trackColor={{ false: MonikeColors.inkGhost, true: '#00E67666' }}
              thumbColor={recurring ? MonikeColors.accentPulse : MonikeColors.inkSecondary}
            />
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>TIMELINE</Text>
            <View style={styles.timelineChart}>
              {recipient.monthly.map((value, index) => (
                <View key={`${monthLabels[index]}-${value}`} style={styles.timelineItem}>
                  <View style={styles.timelineSlot}>
                    <View style={[styles.timelineBar, { height: Math.max(4, (value / max) * 64), backgroundColor: color }]} />
                  </View>
                  <Text style={styles.monthLabel}>{monthLabels[index]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.transactionsCard}>
            <Text style={styles.sectionTitle}>TRANSFERS</Text>
            {sortedTransactions.map((transaction, index) => (
              <View key={transaction.id} style={[styles.transactionRow, index < sortedTransactions.length - 1 && styles.transactionDivider]}>
                <Text style={styles.transactionDate}>{transaction.date}</Text>
                <Text numberOfLines={1} style={styles.transactionDescription}>{transaction.description}</Text>
                <Text style={styles.transactionAmount}>₦{formatNaira(transaction.amount)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function RecipientsScreen() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('total');
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [recurringIds, setRecurringIds] = useState(() => new Set(recipients.filter((recipient) => recipient.recurring).map((recipient) => recipient.id)));
  const insets = useSafeAreaInsets();

  const filteredRecipients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return recipients
      .filter((recipient) => recipient.transfers >= 3)
      .filter((recipient) => (normalized ? recipient.name.toLowerCase().includes(normalized) : true))
      .sort((a, b) => {
        if (sort === 'transfers') return b.transfers - a.transfers;
        if (sort === 'recent') return a.recentRank - b.recentRank;
        if (sort === 'average') return average(b) - average(a);
        return b.total - a.total;
      });
  }, [query, sort]);

  const toggleRecurring = (id: string, value: boolean) => {
    setRecurringIds((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 22 }]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>WHO GETS PAID</Text>
            <Text style={styles.subtitle}>Filtered to 3+ transfers</Text>
          </View>

          <SearchBar query={query} onQueryChange={setQuery} />
          <SortControl sort={sort} onSortChange={setSort} />

          <View style={styles.list}>
            {filteredRecipients.map((recipient) => (
              <RecipientCard
                key={recipient.id}
                recipient={recipient}
                recurring={recurringIds.has(recipient.id)}
                onPress={() => setSelected(recipient)}
              />
            ))}
          </View>

          {recipients.filter((recipient) => recipient.transfers >= 3).length < 3 || filteredRecipients.length < 3 ? <NoticeCard /> : null}
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="recipients" />
      <DetailSheet
        recipient={selected}
        recurring={selected ? recurringIds.has(selected.id) : false}
        onRecurringChange={(value) => selected && toggleRecurring(selected.id, value)}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MonikeColors.bgVoid,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 18,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 6,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  searchBar: {
    minHeight: 48,
    width: '100%',
    borderRadius: 14,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: '#222A31',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 10,
  },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MonikeColors.bgOverlay,
  },
  sortWrap: {
    zIndex: 5,
    alignItems: 'flex-end',
    marginTop: 10,
    marginBottom: 14,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  sortText: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
  },
  sortMenu: {
    position: 'absolute',
    top: 31,
    right: 0,
    width: 168,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  sortOption: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  sortBullet: {
    color: MonikeColors.inkMuted,
    fontSize: 9,
  },
  sortOptionText: {
    flex: 1,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
  },
  sortOptionActive: {
    color: MonikeColors.inkPrimary,
  },
  list: {
    gap: 8,
  },
  recipientCard: {
    height: 80,
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#1F252B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },
  avatarLetter: {
    color: MonikeColors.bgVoid,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  recipientCenter: {
    flex: 1,
    gap: 3,
  },
  recipientName: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  totalText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  metaText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
  },
  dot: {
    color: MonikeColors.inkGhost,
  },
  recipientRight: {
    width: 76,
    alignItems: 'flex-end',
    gap: 5,
  },
  recurringPill: {
    color: MonikeColors.signalAmber,
    borderColor: '#FFB30055',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
    fontFamily: Fonts.sans,
    fontSize: 7,
    fontWeight: '900',
  },
  miniBars: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  miniSlot: {
    width: 4,
    height: 24,
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: 4,
    borderRadius: 2,
  },
  recentDate: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  noticeCard: {
    minHeight: 132,
    marginTop: 14,
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  noticeText: {
    maxWidth: 270,
    textAlign: 'center',
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000099',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: MonikeColors.bgVoid,
    borderWidth: 1,
    borderColor: '#263039',
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonikeColors.inkGhost,
    marginTop: 10,
    marginBottom: 10,
  },
  sheetContent: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: 24,
  },
  sheetHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  sheetHeroText: {
    flex: 1,
  },
  sheetName: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '700',
  },
  sheetAmount: {
    marginTop: 3,
    fontFamily: Fonts.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSub: {
    marginTop: 4,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: '#242B32',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statValue: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 5,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  toggleCard: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#232A31',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 14,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  toggleLabel: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  chartCard: {
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#232A31',
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  timelineChart: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
  },
  timelineSlot: {
    height: 64,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  timelineBar: {
    width: 18,
    borderRadius: 8,
  },
  monthLabel: {
    marginTop: 6,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '800',
  },
  transactionsCard: {
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#232A31',
    padding: 14,
  },
  transactionRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transactionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#20262C',
  },
  transactionDate: {
    width: 48,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  transactionDescription: {
    flex: 1,
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
  },
  transactionAmount: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontWeight: '700',
  },
});

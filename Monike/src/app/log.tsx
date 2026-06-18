import { useEffect, useState, type ComponentType } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Landmark,
  ShoppingBag,
  Users,
  Utensils,
  Wifi,
  Phone,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useAccent } from '@/contexts/accent-context';
import { apiFetch, postLog, type LogEntry, type LogWriteRequest } from '@/services/api';
import { mutateAll } from '@/hooks/use-swr';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

// ─── Categories ───────────────────────────────────────────────────────────────
// Maps to the LogWriteRequest field that round-trips through GET /log/{date}.
// "Food" does not round-trip (LogEntry has no food_spend column) — see note below.

type CategoryKey = 'pos_spend' | 'p2p_spend' | 'data_spend' | 'airtime_spend' | 'family_spend' | 'online_spend' | 'food_spend' | 'savings_out';

type CategoryDef = {
  key: CategoryKey;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

const CATEGORIES: CategoryDef[] = [
  { key: 'pos_spend', label: 'POS', Icon: ShoppingBag },
  { key: 'p2p_spend', label: 'Transfer', Icon: Users },
  { key: 'data_spend', label: 'Data', Icon: Wifi },
  { key: 'airtime_spend', label: 'Airtime', Icon: Phone },
  { key: 'family_spend', label: 'Family', Icon: Landmark },
  { key: 'online_spend', label: 'Online', Icon: Globe },
  { key: 'food_spend', label: 'Food', Icon: Utensils },
  { key: 'savings_out', label: 'Savings', Icon: Banknote },
];

const EMPTY_REQUEST: Omit<LogWriteRequest, 'date'> = {
  p2p_spend: 0,
  pos_spend: 0,
  data_spend: 0,
  airtime_spend: 0,
  food_spend: 0,
  online_spend: 0,
  family_spend: 0,
  electricity_spend: 0,
  subscription_spend: 0,
  loan_spend: 0,
  other_spend: 0,
  savings_out: 0,
  total_credit: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function formatDateLabel(d: Date) {
  const today = dateKey(new Date());
  const key = dateKey(d);
  if (key === today) return 'Today';
  if (key === dateKey(addDays(new Date(), -1))) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function parseAmount(raw: string): number {
  const value = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const { accent } = useAccent();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [category, setCategory] = useState<CategoryKey>('pos_spend');
  const [mode, setMode] = useState<'debit' | 'credit'>('debit');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [baseline, setBaseline] = useState<LogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedModal, setSavedModal] = useState<{ visible: boolean; highSpend: boolean }>({ visible: false, highSpend: false });

  const key = dateKey(selectedDate);

  useEffect(() => {
    let cancelled = false;
    apiFetch<LogEntry>(`/log/${key}`)
      .then((entry) => { if (!cancelled) setBaseline(entry); })
      .catch(() => { if (!cancelled) setBaseline(null); });
    return () => { cancelled = true; };
  }, [key]);

  const amount = parseAmount(amountInput);

  async function handleSave() {
    if (amount <= 0 || saving) return;
    setSaving(true);
    try {
      const merged: LogWriteRequest = {
        date: key,
        ...EMPTY_REQUEST,
        p2p_spend: baseline?.p2p_spend ?? 0,
        pos_spend: baseline?.pos_spend ?? 0,
        data_spend: baseline?.data_spend ?? 0,
        airtime_spend: baseline?.airtime_spend ?? 0,
        online_spend: baseline?.online_spend ?? 0,
        family_spend: baseline?.family_spend ?? 0,
        savings_out: baseline?.savings_out ?? 0,
        total_credit: baseline?.total_credit ?? 0,
      };

      if (mode === 'credit') {
        merged.total_credit += amount;
      } else {
        merged[category] = merged[category] + amount;
      }

      const result = await postLog(merged);
      await mutateAll();
      setAmountInput('');
      setNote('');
      setBaseline(result);
      setSavedModal({ visible: true, highSpend: result.high_spend });
    } catch {
      setSavedModal({ visible: true, highSpend: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Log a spend</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {/* Amount display */}
          <View style={styles.amountWrap}>
            <Text style={styles.amountLabel}>AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>₦</Text>
              <TextInput
                style={styles.amountInput}
                value={amountInput}
                onChangeText={(t) => setAmountInput(t.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                placeholderTextColor={MonikeColors.inkMuted}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          </View>

          {/* Category chips */}
          <View style={styles.chipGrid}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  style={[
                    styles.chip,
                    active && { borderColor: accent, backgroundColor: accent + '14' },
                  ]}
                  onPress={() => setCategory(c.key)}
                >
                  <c.Icon size={18} color={active ? accent : MonikeColors.inkSecondary} strokeWidth={1.8} />
                  <Text style={[styles.chipLabel, active && { color: accent, fontWeight: '700' }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Fields card */}
          <View style={styles.sectionCard}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Date</Text>
              <View style={styles.dateNav}>
                <Pressable onPress={() => setSelectedDate((d) => addDays(d, -1))} hitSlop={8}>
                  <ChevronLeft size={18} color={MonikeColors.inkSecondary} />
                </Pressable>
                <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
                <Pressable onPress={() => setSelectedDate((d) => addDays(d, 1))} hitSlop={8}>
                  <ChevronRight size={18} color={MonikeColors.inkSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, mode === 'debit' && { backgroundColor: accent }]}
                  onPress={() => setMode('debit')}
                >
                  <Text style={[styles.toggleText, mode === 'debit' && { color: '#fff', fontWeight: '700' }]}>Debit</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, mode === 'credit' && { backgroundColor: accent }]}
                  onPress={() => setMode('credit')}
                >
                  <Text style={[styles.toggleText, mode === 'credit' && { color: '#fff', fontWeight: '700' }]}>Credit</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.noteWrap}>
              <Text style={styles.fieldLabel}>Note (optional)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="What was this for?"
                placeholderTextColor={MonikeColors.inkMuted}
              />
            </View>
          </View>

          <Pressable
            style={[styles.saveButton, { backgroundColor: accent }, amount <= 0 && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={amount <= 0 || saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save spend'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={savedModal.visible} transparent animationType="fade" onRequestClose={() => setSavedModal({ visible: false, highSpend: false })}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.sheet}>
            <View style={[modalStyles.checkCircle, { backgroundColor: accent + '20', borderColor: accent }]}>
              <Check size={24} color={accent} strokeWidth={2.5} />
            </View>
            <Text style={modalStyles.title}>Spend saved</Text>
            {savedModal.highSpend ? (
              <Text style={modalStyles.warning}>This pushed today over your high-spend threshold.</Text>
            ) : null}
            <Pressable
              style={[modalStyles.doneButton, { backgroundColor: accent }]}
              onPress={() => setSavedModal({ visible: false, highSpend: false })}
            >
              <Text style={modalStyles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BottomNavigation activeRoute="log" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },

  header: { paddingHorizontal: ScreenPadding, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700' },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16, gap: 18 },

  amountWrap: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  amountLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountCurrency: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 28, fontWeight: '700', marginRight: 4 },
  amountInput: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 48, fontWeight: '800',
    minWidth: 80, textAlign: 'center', padding: 0,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
  },
  chipLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },

  sectionCard: {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 16, gap: 14,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  dateNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', minWidth: 96, textAlign: 'center' },

  toggleRow: { flexDirection: 'row', backgroundColor: MonikeColors.bgElevated, borderRadius: 10, padding: 3, gap: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },

  noteWrap: { gap: 8 },
  noteInput: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13,
    borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  saveButton: { borderRadius: CardRadius, paddingVertical: 16, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#fff', fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  sheet: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1,
    borderColor: MonikeColors.inkGhost, padding: 24, alignItems: 'center', gap: 10,
  },
  checkCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 4 },
  title: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' },
  warning: { color: MonikeColors.signalAmber, fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  doneButton: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, marginTop: 8 },
  doneText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  ChevronDown,
  CreditCard,
  StickyNote,
  X,
} from 'lucide-react-native';

import { useAccent } from '@/contexts/accent-context';
import { apiFetch, postLog, type LogEntry, type LogWriteRequest } from '@/services/api';
import { mutateAll } from '@/hooks/use-swr';
import { CardRadius, Fonts, ScreenPadding, hexAlpha } from '@/constants/theme';

// ─── Categories ───────────────────────────────────────────────────────────────
// Maps to a LogWriteRequest field. LogEntry (the GET /log/{date} response) only
// round-trips p2p/pos/data/airtime/online/family/savings — "Bills" has no direct
// counterpart so it folds into electricity_spend, the closest existing field.
// handleSave folds whatever part of baseline.total_debit isn't explained by the
// 6 tracked fields into other_spend, to avoid shrinking total_debit on every save.

type CategoryKey = 'p2p_spend' | 'pos_spend' | 'airtime_spend' | 'data_spend' | 'family_spend' | 'electricity_spend';

type CategoryDef = { key: CategoryKey; name: string; dot: string };

const CATEGORIES: CategoryDef[] = [
  { key: 'p2p_spend', name: 'Transfer', dot: '#5B7CFA' },
  { key: 'pos_spend', name: 'POS', dot: '#E08A3C' },
  { key: 'airtime_spend', name: 'Airtime', dot: '#B06FD6' },
  { key: 'data_spend', name: 'Data', dot: '#2BB3A3' },
  { key: 'family_spend', name: 'Family', dot: '#E5645B' },
  { key: 'electricity_spend', name: 'Bills', dot: '#E0A11C' },
];

const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent, accentTint, colors, dark } = useAccent();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [category, setCategory] = useState<CategoryKey>('p2p_spend');
  const [mode, setMode] = useState<'debit' | 'credit'>('debit');
  const [amountDigits, setAmountDigits] = useState('');
  const [note, setNote] = useState('');
  const [baseline, setBaseline] = useState<LogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedModal, setSavedModal] = useState<{ visible: boolean; highSpend: boolean }>({ visible: false, highSpend: false });
  const [moreSheet, setMoreSheet] = useState(false);

  const key = dateKey(selectedDate);

  useEffect(() => {
    let cancelled = false;
    apiFetch<LogEntry>(`/log/${key}`)
      .then((entry) => { if (!cancelled) setBaseline(entry); })
      .catch(() => { if (!cancelled) setBaseline(null); });
    return () => { cancelled = true; };
  }, [key]);

  const amountDisplay = amountDigits === '' ? '0' : Number(amountDigits).toLocaleString('en-US');
  const amount = parseFloat(amountDigits) || 0;
  const activeCategory = CATEGORIES.find((c) => c.key === category)!;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function press(v: string) {
    if (v === 'back') {
      setAmountDigits((cur) => cur.slice(0, -1));
      return;
    }
    setAmountDigits((cur) => {
      if (cur.length >= 9) return cur;
      if (v === '0' && cur === '') return cur;
      return cur + v;
    });
  }

  async function handleSave() {
    if (amount <= 0 || saving) return;
    setSaving(true);
    try {
      const accountedFor =
        (baseline?.p2p_spend ?? 0) +
        (baseline?.pos_spend ?? 0) +
        (baseline?.data_spend ?? 0) +
        (baseline?.airtime_spend ?? 0) +
        (baseline?.online_spend ?? 0) +
        (baseline?.family_spend ?? 0) +
        (baseline?.savings_out ?? 0);
      const residual = Math.max(0, (baseline?.total_debit ?? 0) - accountedFor);

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
        other_spend: residual,
        total_credit: baseline?.total_credit ?? 0,
      };

      if (mode === 'credit') {
        merged.total_credit += amount;
      } else {
        merged[category] = merged[category] + amount;
      }

      const result = await postLog(merged);
      await mutateAll();
      setAmountDigits('');
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
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.card }]} onPress={close} hitSlop={8}>
            <X size={18} color={colors.ink} strokeWidth={2} />
          </Pressable>
          <Pressable style={[styles.moreChip, { backgroundColor: colors.card }]} onPress={() => setMoreSheet(true)}>
            <Text style={[styles.moreChipText, { color: colors.ink2 }]}>
              {formatDateLabel(selectedDate)} · {mode === 'debit' ? 'Debit' : 'Credit'}
            </Text>
            <ChevronDown size={14} color={colors.ink3} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Amount display */}
          <View style={styles.amountWrap}>
            <Text style={[styles.amountLabel, { color: colors.ink3 }]}>AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amountCurrency, { color: colors.ink2 }]}>₦</Text>
              <Text style={[styles.amountValue, { color: colors.ink }]}>{amountDisplay}</Text>
            </View>
            <View style={[styles.predictedPill, { backgroundColor: accentTint }]}>
              <Check size={13} color={accent} strokeWidth={2.4} />
              <Text style={[styles.predictedCat, { color: accent }]}>{activeCategory.name}</Text>
              <Text style={[styles.predictedConf, { color: accent }]}>92%</Text>
            </View>
          </View>

          {/* Category chips */}
          <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>CATEGORY</Text>
          <View style={styles.chipGrid}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? hexAlpha(accent, dark ? 0.18 : 0.12) : colors.card, borderColor: active ? accent : colors.line },
                  ]}
                  onPress={() => setCategory(c.key)}
                >
                  <View style={[styles.chipDot, { backgroundColor: c.dot }]} />
                  <Text style={[styles.chipLabel, { color: active ? colors.ink : colors.ink2, fontWeight: active ? '600' : '500' }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Note */}
          <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>NOTE</Text>
          <View style={[styles.noteRow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <StickyNote size={17} color={colors.ink3} strokeWidth={2} />
            <TextInput
              style={[styles.noteInput, { color: colors.ink }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.ink2}
            />
          </View>

          {/* Keypad */}
          <View style={styles.keypad}>
            {KEY_LABELS.map((l) => (
              <Pressable
                key={l}
                style={[styles.key, { backgroundColor: l === '.' || l === '⌫' ? 'transparent' : colors.card }]}
                onPress={() => press(l === '⌫' ? 'back' : l)}
              >
                <Text style={[styles.keyText, { color: colors.ink }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.bg, paddingBottom: Math.max(14, insets.bottom) }]}>
          <Pressable
            style={[styles.saveButton, { backgroundColor: accent, shadowColor: accent }, amount <= 0 && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={amount <= 0 || saving}
          >
            <Check size={20} color="#fff" strokeWidth={2.4} />
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save spend'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Tucked-away Date / Type sheet */}
      <Modal visible={moreSheet} transparent animationType="fade" onRequestClose={() => setMoreSheet(false)}>
        <Pressable style={modalStyles.backdrop} onPress={() => setMoreSheet(false)}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldLeft}>
                <Calendar size={16} color={colors.ink2} strokeWidth={1.8} />
                <Text style={[styles.fieldRowLabel, { color: colors.ink2 }]}>Date</Text>
              </View>
              <Pressable onPress={() => setSelectedDate(new Date())} hitSlop={6}>
                <Text style={[styles.dateText, { color: colors.ink }]}>{formatDateLabel(selectedDate)}</Text>
              </Pressable>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.fieldRow}>
              <View style={styles.fieldLeft}>
                <CreditCard size={16} color={colors.ink2} strokeWidth={1.8} />
                <Text style={[styles.fieldRowLabel, { color: colors.ink2 }]}>Type</Text>
              </View>
              <View style={[styles.toggleRow, { backgroundColor: colors.chip }]}>
                <Pressable
                  style={[styles.toggleBtn, mode === 'debit' && { backgroundColor: accent }]}
                  onPress={() => setMode('debit')}
                >
                  <Text style={[styles.toggleText, { color: mode === 'debit' ? '#fff' : colors.ink2, fontWeight: mode === 'debit' ? '700' : '500' }]}>Debit</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, mode === 'credit' && { backgroundColor: accent }]}
                  onPress={() => setMode('credit')}
                >
                  <Text style={[styles.toggleText, { color: mode === 'credit' ? '#fff' : colors.ink2, fontWeight: mode === 'credit' ? '700' : '500' }]}>Credit</Text>
                </Pressable>
              </View>
            </View>
            <Pressable style={[modalStyles.doneButton, { backgroundColor: accent }]} onPress={() => setMoreSheet(false)}>
              <Text style={modalStyles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={savedModal.visible} transparent animationType="fade" onRequestClose={() => setSavedModal({ visible: false, highSpend: false })}>
        <View style={modalStyles.backdrop}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.line, alignItems: 'center' }]}>
            <View style={[modalStyles.checkCircle, { backgroundColor: accentTint, borderColor: accent }]}>
              <Check size={24} color={accent} strokeWidth={2.5} />
            </View>
            <Text style={[modalStyles.title, { color: colors.ink }]}>Spend saved</Text>
            {savedModal.highSpend ? (
              <Text style={[modalStyles.warning, { color: '#E0A11C' }]}>This pushed today over your high-spend threshold.</Text>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding, paddingTop: 8, paddingBottom: 4,
  },
  closeButton: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  moreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  moreChipText: { fontFamily: Fonts.mono, fontSize: 11.5 },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 6, paddingBottom: 12 },

  amountWrap: { alignItems: 'center', paddingVertical: 14, paddingBottom: 26 },
  amountLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 },
  amountCurrency: { fontFamily: Fonts.heading, fontSize: 34, fontWeight: '600' },
  amountValue: { fontFamily: Fonts.heading, fontSize: 56, fontWeight: '600', letterSpacing: -0.5, lineHeight: 60 },
  predictedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16,
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
  },
  predictedCat: { fontFamily: Fonts.sans, fontSize: 12.5, fontWeight: '600' },
  predictedConf: { fontFamily: Fonts.mono, fontSize: 11, opacity: 0.7 },

  fieldLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, marginHorizontal: 2, marginBottom: 11 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
  },
  chipDot: { width: 9, height: 9, borderRadius: 4.5 },
  chipLabel: { fontFamily: Fonts.sans, fontSize: 13.5 },

  noteRow: {
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24,
  },
  noteInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, padding: 0 },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: { width: '31.5%', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: Fonts.heading, fontSize: 22, fontWeight: '500' },

  footer: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14 },
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 56, borderRadius: 18,
    shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#fff', fontFamily: Fonts.heading, fontSize: 16, fontWeight: '600' },

  // Tucked sheet rows
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  fieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldRowLabel: { fontFamily: Fonts.sans, fontSize: 13.5 },
  dateText: { fontFamily: Fonts.sans, fontSize: 13.5, fontWeight: '600' },
  divider: { height: 0.5 },
  toggleRow: { flexDirection: 'row', borderRadius: 16, padding: 3, gap: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 13 },
  toggleText: { fontFamily: Fonts.sans, fontSize: 12 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  sheet: {
    borderRadius: CardRadius, borderWidth: 1, padding: 20, gap: 4,
  },
  checkCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 4 },
  title: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' },
  warning: { fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center', marginTop: 4 },
  doneButton: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, marginTop: 14, alignSelf: 'center' },
  doneText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

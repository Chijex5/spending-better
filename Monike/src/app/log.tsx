import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  CreditCard,
  StickyNote,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react-native';

import { useAccent } from '@/contexts/accent-context';
import { apiFetch, postLog, type LogEntry, type LogWriteRequest, type UploadResult } from '@/services/api';
import { mutateAll } from '@/hooks/use-swr';
import { useUploadStatement } from '@/hooks/use-upload-statement';
import { CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

// ─── Categories ───────────────────────────────────────────────────────────────
// Maps to a LogWriteRequest field. LogEntry (the GET /log/{date} response) only
// round-trips p2p/pos/data/airtime/online/family/savings — "Food" and the other
// LogWriteRequest-only fields aren't returned, so handleSave folds whatever part
// of baseline.total_debit isn't explained by those 7 fields into other_spend
// instead of dropping it, to avoid shrinking total_debit on every subsequent save.

type CategoryKey = 'pos_spend' | 'p2p_spend' | 'data_spend' | 'airtime_spend' | 'family_spend' | 'online_spend' | 'food_spend' | 'savings_out';

type CategoryDef = {
  key: CategoryKey;
  label: string;
  color: string;
};

const CATEGORIES: CategoryDef[] = [
  { key: 'pos_spend', label: 'POS', color: '#D9822B' },
  { key: 'p2p_spend', label: 'Transfer', color: '#5B7CFA' },
  { key: 'data_spend', label: 'Data', color: '#2FA98E' },
  { key: 'airtime_spend', label: 'Airtime', color: '#A368E0' },
  { key: 'family_spend', label: 'Family', color: '#E2685B' },
  { key: 'online_spend', label: 'Online', color: '#5B7CFA' },
  { key: 'food_spend', label: 'Food', color: '#D9A23A' },
  { key: 'savings_out', label: 'Savings', color: '#2FBF6B' },
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
  if (key === today) return `Today · ${d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}`;
  if (key === dateKey(addDays(new Date(), -1))) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayName(d: Date) {
  return d.toLocaleDateString('en-NG', { weekday: 'long' });
}

function parseAmount(raw: string): number {
  const value = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const router = useRouter();
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

  const handleUploadSuccess = useCallback((_result: UploadResult) => {
    mutateAll();
  }, []);
  const { uploadState, pickAndUpload, reset: resetUpload } = useUploadStatement(handleUploadSuccess);

  const key = dateKey(selectedDate);

  useEffect(() => {
    let cancelled = false;
    apiFetch<LogEntry>(`/log/${key}`)
      .then((entry) => { if (!cancelled) setBaseline(entry); })
      .catch(() => { if (!cancelled) setBaseline(null); });
    return () => { cancelled = true; };
  }, [key]);

  const amount = parseAmount(amountInput);
  const activeCategory = CATEGORIES.find((c) => c.key === category)!;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
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
          <Pressable style={styles.closeButton} onPress={close} hitSlop={8}>
            <X size={18} color={MonikeColors.inkPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Log a spend</Text>
          <Pressable
            style={styles.uploadButton}
            onPress={pickAndUpload}
            disabled={uploadState.status !== 'idle' && uploadState.status !== 'error'}
            hitSlop={8}
          >
            <Upload size={16} color={MonikeColors.inkSecondary} strokeWidth={2} />
          </Pressable>
        </View>

        {uploadState.status === 'picking' || uploadState.status === 'uploading' || uploadState.status === 'processing' ? (
          <View style={styles.uploadStrip}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={styles.uploadStripText} numberOfLines={1}>
              {uploadState.status === 'picking' && 'Opening file picker…'}
              {uploadState.status === 'uploading' && `Uploading ${uploadState.filename}…`}
              {uploadState.status === 'processing' &&
                (uploadState.progress
                  ? `Processing ${uploadState.progress.phase === 'transactions' ? 'transactions' : 'daily totals'} ${uploadState.progress.done}/${uploadState.progress.total}`
                  : 'Processing statement…')}
            </Text>
          </View>
        ) : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
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
          <View>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <View style={styles.chipGrid}>
              {CATEGORIES.map((c) => {
                const active = c.key === category;
                return (
                  <Pressable
                    key={c.key}
                    style={[
                      styles.chip,
                      active && { backgroundColor: c.color + '33', borderColor: c.color },
                    ]}
                    onPress={() => setCategory(c.key)}
                  >
                    <View style={[styles.chipDot, { backgroundColor: c.color }]} />
                    <Text style={[styles.chipLabel, active && { color: MonikeColors.inkPrimary, fontWeight: '700' }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Fields card */}
          <View style={styles.sectionCard}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldLeft}>
                <Calendar size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
                <Text style={styles.fieldRowLabel}>Date</Text>
              </View>
              <Pressable onPress={() => setSelectedDate(new Date())} hitSlop={6}>
                <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
              </Pressable>
            </View>
            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <View style={styles.fieldLeft}>
                <CreditCard size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
                <Text style={styles.fieldRowLabel}>Type</Text>
              </View>
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
            <View style={styles.divider} />

            <View style={styles.noteRow}>
              <StickyNote size={16} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                placeholderTextColor={MonikeColors.inkMuted}
              />
            </View>
          </View>

          <View style={styles.tipRow}>
            <View style={[styles.tipIcon, { borderColor: accent }]}>
              <Text style={[styles.tipIconText, { color: accent }]}>i</Text>
            </View>
            <Text style={styles.tipText}>
              Most spends here are tagged <Text style={styles.tipBold}>{activeCategory.label}</Text> on {dayName(selectedDate)}s.
            </Text>
          </View>

          <Pressable
            style={[styles.saveButton, { backgroundColor: accent, shadowColor: accent }, amount <= 0 && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={amount <= 0 || saving}
          >
            <Check size={16} color="#fff" strokeWidth={2.5} />
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

      <Modal
        visible={uploadState.status === 'success' || uploadState.status === 'error'}
        transparent
        animationType="fade"
        onRequestClose={resetUpload}
      >
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.sheet}>
            {uploadState.status === 'success' ? (
              <>
                <View style={[modalStyles.checkCircle, { backgroundColor: accent + '20', borderColor: accent }]}>
                  <Check size={24} color={accent} strokeWidth={2.5} />
                </View>
                <Text style={modalStyles.title}>Statement imported</Text>
                <Text style={modalStyles.summary}>
                  {uploadState.result.new_days_inserted} new days · {uploadState.result.days_updated} updated · {uploadState.result.duplicate_transactions_skipped} duplicates skipped
                </Text>
                <Text style={modalStyles.summaryMuted}>
                  {uploadState.result.date_range_start} → {uploadState.result.date_range_end}
                </Text>
              </>
            ) : uploadState.status === 'error' ? (
              <>
                <View style={[modalStyles.checkCircle, { backgroundColor: MonikeColors.signalAmber + '20', borderColor: MonikeColors.signalAmber }]}>
                  <TriangleAlert size={24} color={MonikeColors.signalAmber} strokeWidth={2.5} />
                </View>
                <Text style={modalStyles.title}>Upload failed</Text>
                <Text style={modalStyles.summaryMuted}>{uploadState.message}</Text>
              </>
            ) : null}
            <Pressable style={[modalStyles.doneButton, { backgroundColor: accent }]} onPress={resetUpload}>
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
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding, paddingTop: 8, paddingBottom: 4,
  },
  closeButton: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: MonikeColors.bgSurface,
  },
  headerTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' },
  uploadButton: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: MonikeColors.bgSurface,
  },

  uploadStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: ScreenPadding, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
  },
  uploadStripText: { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 8, gap: 22 },

  amountWrap: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  amountLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountCurrency: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 30, fontWeight: '700', marginRight: 6 },
  amountInput: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 52, fontWeight: '800',
    minWidth: 90, textAlign: 'center', padding: 0,
  },

  fieldLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: 'transparent',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },

  sectionCard: {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingHorizontal: 16,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  fieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldRowLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13.5 },
  dateText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13.5, fontWeight: '600' },
  divider: { height: 0.5, backgroundColor: MonikeColors.inkGhost },

  toggleRow: { flexDirection: 'row', backgroundColor: MonikeColors.bgElevated, borderRadius: 16, padding: 3, gap: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 13 },
  toggleText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  noteInput: { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13.5, padding: 0 },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  tipIcon: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.3, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipIconText: { fontSize: 10, fontWeight: '700', fontFamily: Fonts.sans },
  tipText: { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 17 },
  tipBold: { color: MonikeColors.inkPrimary, fontWeight: '700' },

  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: CardRadius, paddingVertical: 16,
    shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
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
  summary: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  summaryMuted: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11, textAlign: 'center' },
  doneButton: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, marginTop: 8 },
  doneText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

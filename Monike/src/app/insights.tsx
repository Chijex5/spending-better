import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, X } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import { useAccent } from '@/contexts/accent-context';
import {
  exploreMonthsFetcher,
  exploreSummaryFetcher,
  type DailyCell,
  type ExploreMonth,
  type ExploreMonthsResponse,
  type ExploreSummaryResponse,
} from '@/services/api';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexA(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function now() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// First-of-month JS weekday (0=Sun) → number of leading blank cells
function leadingBlanks(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

const CATEGORY_COLOR: Record<string, string> = {
  'Person-to-Person': MonikeColors.signalBlue,
  'POS Purchase': MonikeColors.accentOrange,
  Data: MonikeColors.signalAmber,
  Airtime: MonikeColors.accentPulse,
  'Online Payment': MonikeColors.inkSecondary,
  Other: MonikeColors.inkMuted,
};

// ─── Month picker modal ────────────────────────────────────────────────────────

function MonthPickerModal({
  visible,
  months,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  months: ExploreMonth[];
  current: { year: number; month: number };
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const { accent } = useAccent();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Select month</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={MonikeColors.inkMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {months.map((m) => {
              const active = m.year === current.year && m.month === current.month;
              return (
                <Pressable
                  key={`${m.year}-${m.month}`}
                  style={[modalStyles.row, active && { backgroundColor: hexA(accent, 0.12) }]}
                  onPress={() => onSelect(m.year, m.month)}
                >
                  <Text style={[modalStyles.rowText, active && { color: accent, fontWeight: '700' }]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Daily heatmap ────────────────────────────────────────────────────────────

function DailyHeatmap({ daily, year, month, accent }: { daily: DailyCell[]; year: number; month: number; accent: string }) {
  const blanks = leadingBlanks(year, month);
  const cells: (DailyCell | null)[] = [...Array(blanks).fill(null), ...daily];
  while (cells.length % 7 !== 0) cells.push(null);

  function levelColor(cell: DailyCell) {
    if (cell.total <= 0) return MonikeColors.bgElevated;
    if (cell.risk === 'HIGH') return MonikeColors.signalRed;
    if (cell.risk === 'MEDIUM') return hexA(accent, 0.65);
    return hexA(accent, 0.32);
  }

  return (
    <View>
      <View style={styles.heatmapWeekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={styles.heatmapWeekLabel}>{d}</Text>
        ))}
      </View>
      <View style={styles.heatmapGrid}>
        {cells.map((cell, i) => (
          <View
            key={i}
            style={[
              styles.heatmapCell,
              cell ? { backgroundColor: levelColor(cell) } : styles.heatmapCellBlank,
              cell?.is_today && { borderWidth: 1.5, borderColor: accent },
            ]}
          >
            {cell ? (
              <Text
                style={[
                  styles.heatmapCellText,
                  cell.total > 0 && cell.risk !== 'LOW' ? { color: '#fff' } : null,
                ]}
              >
                {cell.day}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { accent } = useAccent();
  const [period, setPeriod] = useState(now());
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: monthsData } = useSWR<ExploreMonthsResponse>('/explore/months', exploreMonthsFetcher);
  const { data: summary, isLoading } = useSWR<ExploreSummaryResponse>(
    `/explore/summary?year=${period.year}&month=${period.month}`,
    exploreSummaryFetcher(period.year, period.month),
  );

  const months = useMemo(() => monthsData?.months ?? [], [monthsData]);
  const currentLabel = useMemo(() => {
    const match = months.find((m) => m.year === period.year && m.month === period.month);
    return match?.label ?? `${period.month}/${period.year}`;
  }, [months, period]);

  const topCategories = useMemo(() => {
    if (!summary) return [];
    const totals = new Map<string, number>();
    for (const t of summary.day_transactions) {
      if (t.amount >= 0) continue; // skip credits
      totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
    }
    const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, total]) => ({ category, total, pct: (total / grand) * 100 }));
  }, [summary]);

  const keyStats = useMemo(() => {
    if (!summary || summary.daily.length === 0) {
      return { peak: null as DailyCell | null, quiet: null as DailyCell | null, netFlow: 0, highDays: 0 };
    }
    const spendDays = summary.daily.filter((d) => d.total > 0);
    const peak = spendDays.length
      ? spendDays.reduce((a, b) => (b.total > a.total ? b : a))
      : null;
    const quiet = spendDays.length
      ? spendDays.reduce((a, b) => (b.total < a.total ? b : a))
      : null;
    const netFlow = summary.credits - summary.real_spend;
    const highDays = summary.daily.filter((d) => d.risk === 'HIGH').length;
    return { peak, quiet, netFlow, highDays };
  }, [summary]);

  const pctChange = summary
    ? summary.previous_spend > 0
      ? ((summary.real_spend - summary.previous_spend) / summary.previous_spend) * 100
      : 0
    : 0;
  const isUp = pctChange >= 0;
  const pctColor = isUp ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const overUnderBudget = summary ? summary.real_spend - summary.budget : 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Insights</Text>
          <Pressable style={styles.monthChip} onPress={() => setPickerOpen(true)}>
            <Text style={styles.monthChipText}>{currentLabel}</Text>
            <ChevronDown size={14} color={MonikeColors.inkSecondary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {!summary ? (
            <Text style={styles.loadingText}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          ) : (
            <>
              {/* Hero */}
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>REAL SPEND</Text>
                <View style={styles.heroAmountRow}>
                  <Text style={styles.heroCurrency}>₦</Text>
                  <Text style={styles.heroAmount}>{formatNaira(summary.real_spend)}</Text>
                </View>
                <View style={styles.heroMetaRow}>
                  <View style={[styles.pctPill, { backgroundColor: hexA(pctColor, 0.12), borderColor: hexA(pctColor, 0.35) }]}>
                    <Text style={[styles.pctPillText, { color: pctColor }]}>
                      {isUp ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}% vs last month
                    </Text>
                  </View>
                  <Text style={styles.paceNote}>
                    {overUnderBudget >= 0
                      ? `₦${formatNaira(overUnderBudget)} over budget`
                      : `₦${formatNaira(Math.abs(overUnderBudget))} under budget`}
                  </Text>
                </View>
              </View>

              {/* Daily spend heatmap */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Daily spend</Text>
                <DailyHeatmap daily={summary.daily} year={period.year} month={period.month} accent={accent} />
              </View>

              {/* By week */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>By week</Text>
                {summary.weekly.map((w) => {
                  const max = Math.max(...summary.weekly.map((x) => x.spend), 1);
                  const pct = Math.max(0.03, w.spend / max);
                  return (
                    <View key={w.week} style={styles.weekRow}>
                      <View style={styles.weekRowTop}>
                        <Text style={styles.weekRowLabel}>{w.range}</Text>
                        <Text style={styles.weekRowAmount}>₦{formatNaira(w.spend)}</Text>
                      </View>
                      <View style={styles.weekBarTrack}>
                        <View style={[styles.weekBarFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Top categories */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Top categories</Text>
                {topCategories.length > 0 ? topCategories.map((c) => {
                  const dotColor = CATEGORY_COLOR[c.category] ?? MonikeColors.inkMuted;
                  return (
                    <View key={c.category} style={styles.catRow}>
                      <View style={styles.catRowTop}>
                        <View style={styles.catLabelRow}>
                          <View style={[styles.catDot, { backgroundColor: dotColor }]} />
                          <Text style={styles.catLabel}>{c.category}</Text>
                        </View>
                        <Text style={styles.catShare}>{c.pct.toFixed(0)}%</Text>
                      </View>
                      <View style={styles.weekBarTrack}>
                        <View style={[styles.weekBarFill, { width: `${c.pct}%`, backgroundColor: dotColor }]} />
                      </View>
                    </View>
                  );
                }) : (
                  <Text style={styles.emptyText}>No spend recorded this month.</Text>
                )}
              </View>

              {/* Key stats */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Key stats</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statsCell}>
                    <Text style={styles.statsLabel}>PEAK DAY</Text>
                    <Text style={styles.statsValue}>
                      {keyStats.peak ? `₦${formatNaira(keyStats.peak.total)}` : '—'}
                    </Text>
                    <Text style={styles.statsSub}>{keyStats.peak?.date ?? ''}</Text>
                  </View>
                  <View style={styles.statsCell}>
                    <Text style={styles.statsLabel}>QUIETEST DAY</Text>
                    <Text style={styles.statsValue}>
                      {keyStats.quiet ? `₦${formatNaira(keyStats.quiet.total)}` : '—'}
                    </Text>
                    <Text style={styles.statsSub}>{keyStats.quiet?.date ?? ''}</Text>
                  </View>
                  <View style={styles.statsCell}>
                    <Text style={styles.statsLabel}>NET FLOW</Text>
                    <Text style={[styles.statsValue, { color: keyStats.netFlow >= 0 ? MonikeColors.accentPulse : MonikeColors.signalRed }]}>
                      {keyStats.netFlow >= 0 ? '+' : '−'}₦{formatNaira(keyStats.netFlow)}
                    </Text>
                  </View>
                  <View style={styles.statsCell}>
                    <Text style={styles.statsLabel}>HIGH-SPEND DAYS</Text>
                    <Text style={[styles.statsValue, { color: MonikeColors.signalRed }]}>{keyStats.highDays}</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <MonthPickerModal
        visible={pickerOpen}
        months={months}
        current={period}
        onSelect={(year, month) => {
          setPeriod({ year, month });
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <BottomNavigation activeRoute="insights" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  loadingText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', marginTop: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700' },
  monthChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  monthChipText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16, gap: 18 },

  // Hero
  hero: { gap: 6 },
  heroLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heroCurrency: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 24, fontWeight: '700', marginBottom: 4, marginRight: 3 },
  heroAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 40, fontWeight: '800', letterSpacing: -1.5 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  pctPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pctPillText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  paceNote: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  // Section card
  sectionCard: {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 16, gap: 12,
  },
  sectionTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' },

  // Heatmap
  heatmapWeekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heatmapWeekLabel: { flex: 1, textAlign: 'center', color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  heatmapCell: {
    width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, marginBottom: 4,
  },
  heatmapCellBlank: { backgroundColor: 'transparent' },
  heatmapCellText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '600' },

  // Weekly + categories shared bar
  weekRow: { gap: 6 },
  weekRowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  weekRowLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  weekRowAmount: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  weekBarTrack: { height: 6, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  weekBarFill: { height: '100%', borderRadius: 3 },

  catRow: { gap: 6 },
  catRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  catShare: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  emptyText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  // Key stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statsCell: { width: '47%', gap: 4 },
  statsLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  statsValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 16, fontWeight: '800' },
  statsSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1,
    borderColor: MonikeColors.inkGhost, padding: 16,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  row: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  rowText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14 },
});

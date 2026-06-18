import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

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
import { BottomTabInset, Fonts, ScreenPadding, hexAlpha } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number) {
  return '₦' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function now() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthSortKey(m: { year: number; month: number }) {
  return m.year * 12 + m.month;
}

function titleCase(label: string) {
  return label.split(' ').map((w) => (/^[A-Za-z]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { accent, accentTint, colors } = useAccent();
  const [period, setPeriod] = useState(now());

  const { data: monthsData } = useSWR<ExploreMonthsResponse>('/explore/months', exploreMonthsFetcher);
  const { data: summary, isLoading } = useSWR<ExploreSummaryResponse>(
    `/explore/summary?year=${period.year}&month=${period.month}`,
    exploreSummaryFetcher(period.year, period.month),
  );

  const sortedMonths = useMemo(
    () => [...(monthsData?.months ?? [])].sort((a, b) => monthSortKey(a) - monthSortKey(b)),
    [monthsData],
  );
  const currentIndex = sortedMonths.findIndex((m) => m.year === period.year && m.month === period.month);
  const prevMonth: ExploreMonth | undefined = currentIndex > 0 ? sortedMonths[currentIndex - 1] : undefined;
  const nextMonth: ExploreMonth | undefined = currentIndex >= 0 && currentIndex < sortedMonths.length - 1
    ? sortedMonths[currentIndex + 1] : undefined;
  const currentLabel = useMemo(() => {
    const match = sortedMonths.find((m) => m.year === period.year && m.month === period.month);
    return titleCase(match?.label ?? `${period.month}/${period.year}`);
  }, [sortedMonths, period]);

  const ramp = useMemo(() => [
    colors.line,
    hexAlpha(accent, 0.16),
    hexAlpha(accent, 0.34),
    hexAlpha(accent, 0.58),
    hexAlpha(accent, 0.85),
    '#E5645B',
  ], [colors.line, accent]);

  function cellLevel(cell: DailyCell) {
    if (cell.total <= 0) return 0;
    if (cell.risk === 'HIGH') return 5;
    if (cell.risk === 'MEDIUM') return 4;
    return 2;
  }

  const topCategories = useMemo(() => {
    if (!summary) return [];
    const totals = new Map<string, number>();
    for (const t of summary.day_transactions) {
      if (t.amount >= 0) continue;
      totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
    }
    const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, total]) => ({ category, total, share: (total / grand) * 100 }));
  }, [summary]);

  const prevMonthLabel = useMemo(() => {
    const d = new Date(period.year, period.month - 2, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [period]);

  const keyStats = useMemo(() => {
    if (!summary) return null;
    const spendDays = summary.daily.filter((d) => d.total > 0);
    const peak = spendDays.length ? spendDays.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const peakSub = peak
      ? new Date(summary.year, summary.month - 1, peak.day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : '';
    const debits = summary.day_transactions.filter((t) => t.amount < 0);
    const biggest = debits.length ? debits.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a)) : null;
    const avgPerDay = spendDays.length ? summary.real_spend / spendDays.length : 0;
    const savedAmount = summary.previous_spend - summary.real_spend;
    const savedPct = summary.previous_spend > 0 ? (Math.abs(savedAmount) / summary.previous_spend) * 100 : 0;
    return [
      { label: 'PEAK DAY', value: peak ? formatNaira(peak.total) : '—', sub: peakSub, valueColor: colors.ink },
      { label: 'BIGGEST TXN', value: biggest ? formatNaira(biggest.amount) : '—', sub: biggest?.description ?? '', valueColor: colors.ink },
      { label: 'AVG / DAY', value: formatNaira(avgPerDay), sub: `Across ${spendDays.length} day${spendDays.length === 1 ? '' : 's'}`, valueColor: colors.ink },
      {
        label: savedAmount >= 0 ? 'SAVED VS LAST MO.' : 'OVER VS LAST MO.',
        value: formatNaira(savedAmount),
        sub: `${savedPct.toFixed(1)}% ${savedAmount >= 0 ? 'less' : 'more'} spent`,
        valueColor: savedAmount >= 0 ? accent : '#E5645B',
      },
    ];
  }, [summary, colors.ink, accent]);

  const pctChange = summary
    ? summary.previous_spend > 0
      ? ((summary.real_spend - summary.previous_spend) / summary.previous_spend) * 100
      : 0
    : 0;
  const isUp = pctChange >= 0;
  const pctColor = isUp ? '#E5645B' : accent;
  const pctPillBg = isUp ? hexAlpha('#E5645B', 0.16) : accentTint;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>Insights</Text>
          <View style={[styles.monthChip, { backgroundColor: colors.chip }]}>
            <Pressable disabled={!prevMonth} hitSlop={8} onPress={() => prevMonth && setPeriod({ year: prevMonth.year, month: prevMonth.month })}>
              <ChevronLeft size={16} color={colors.ink2} strokeWidth={2.2} />
            </Pressable>
            <Text style={[styles.monthChipText, { color: colors.ink }]}>{currentLabel}</Text>
            <Pressable disabled={!nextMonth} hitSlop={8} onPress={() => nextMonth && setPeriod({ year: nextMonth.year, month: nextMonth.month })}>
              <ChevronRight size={16} color={colors.ink3} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {!summary || !keyStats ? (
            <Text style={[styles.loadingText, { color: colors.ink2 }]}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          ) : (
            <>
              {/* Hero */}
              <View style={styles.hero}>
                <Text style={[styles.heroLabel, { color: colors.ink2 }]}>REAL SPEND</Text>
                <Text style={[styles.heroAmount, { color: colors.ink }]}>{formatNaira(summary.real_spend)}</Text>
                <View style={styles.pctRow}>
                  <View style={[styles.pctPill, { backgroundColor: pctPillBg }]}>
                    <Text style={[styles.pctPillText, { color: pctColor }]}>
                      {isUp ? '↑' : '↓'} {Math.abs(pctChange).toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={[styles.paceNote, { color: colors.ink2 }]}>vs. {prevMonthLabel}</Text>
                </View>
              </View>

              {/* Daily spend heatmap */}
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.ink }]}>Daily spend</Text>
                  <View style={styles.legendRow}>
                    <Text style={[styles.legendLabel, { color: colors.ink3 }]}>LOW</Text>
                    {ramp.map((color, i) => (
                      <View key={i} style={[styles.legendDot, { backgroundColor: color }]} />
                    ))}
                    <Text style={[styles.legendLabel, { color: colors.ink3 }]}>HIGH</Text>
                  </View>
                </View>
                <View style={styles.dowRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <Text key={i} style={[styles.dowLabel, { color: colors.ink3 }]}>{d}</Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {summary.daily.map((cell, i) => {
                    const level = cellLevel(cell);
                    const bg = ramp[level];
                    const textColor = level >= 4 ? 'rgba(255,255,255,0.92)' : colors.ink3;
                    return (
                      <View key={i} style={[styles.calCell, { backgroundColor: bg }]}>
                        <Text style={[styles.calCellText, { color: textColor }]}>{cell.day}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* By week */}
              <View>
                <Text style={[styles.h2, { color: colors.ink }]}>By week</Text>
                <View style={styles.weekList}>
                  {summary.weekly.map((w) => {
                    const max = Math.max(...summary.weekly.map((x) => x.spend), 1);
                    const pct = Math.max(0.03, w.spend / max);
                    return (
                      <View key={w.week}>
                        <View style={styles.weekRowTop}>
                          <Text style={[styles.weekRowLabel, { color: colors.ink }]}>
                            {w.range} <Text style={[styles.weekRowCount, { color: colors.ink3 }]}>· {w.txns} txns</Text>
                          </Text>
                          <Text style={[styles.weekRowAmount, { color: colors.ink }]}>{formatNaira(w.spend)}</Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: colors.line }]}>
                          <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Top categories */}
              <View>
                <Text style={[styles.h2, { color: colors.ink }]}>Top categories</Text>
                <View style={styles.catList}>
                  {topCategories.length > 0 ? topCategories.map((c) => (
                    <View key={c.category} style={styles.catRow}>
                      <View style={[styles.catDot, { backgroundColor: catColor(c.category) }]} />
                      <View style={styles.catBody}>
                        <View style={styles.catTopRow}>
                          <Text style={[styles.catName, { color: colors.ink }]}>{c.category}</Text>
                          <Text style={[styles.catTotal, { color: colors.ink }]}>{formatNaira(c.total)}</Text>
                        </View>
                        <View style={styles.catBarRow}>
                          <View style={[styles.barTrack, styles.catBarTrack, { backgroundColor: colors.line }]}>
                            <View style={[styles.barFill, { width: `${c.share}%`, backgroundColor: catColor(c.category) }]} />
                          </View>
                          <Text style={[styles.catShare, { color: colors.ink3 }]}>{c.share.toFixed(0)}%</Text>
                        </View>
                      </View>
                    </View>
                  )) : (
                    <Text style={[styles.emptyText, { color: colors.ink2 }]}>No spend recorded this month.</Text>
                  )}
                </View>
              </View>

              {/* Key stats */}
              <View style={styles.keyStatsWrap}>
                <Text style={[styles.h2, { color: colors.ink }]}>Key stats</Text>
                <View style={styles.statsGrid}>
                  {keyStats.map((s) => (
                    <View key={s.label} style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                      <Text style={[styles.statsLabel, { color: colors.ink3 }]}>{s.label}</Text>
                      <Text style={[styles.statsValue, { color: s.valueColor }]}>{s.value}</Text>
                      <Text style={[styles.statsSub, { color: colors.ink2 }]} numberOfLines={1}>{s.sub}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="insights" />
    </View>
  );
}

// Matches the exact per-category dot colors used in the mockup's `catRaw` data.
const CATEGORY_COLOR: Record<string, string> = {
  'Family Transfer': '#E5645B',
  'POS Purchase': '#E08A3C',
  'Person-to-Person': '#5B7CFA',
  Data: '#2BB3A3',
  Airtime: '#2BB3A3',
  'Data & Airtime': '#2BB3A3',
  'Online Payment': '#B06FD6',
};
function catColor(category: string) {
  return CATEGORY_COLOR[category] ?? '#B06FD6';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  loadingText: { fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', marginTop: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontFamily: Fonts.heading, fontSize: 24, fontWeight: '600', letterSpacing: -0.3 },
  monthChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  monthChipText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '500' },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 2, gap: 28 },

  // Hero
  hero: {},
  heroLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.5 },
  heroAmount: { fontFamily: Fonts.heading, fontSize: 44, fontWeight: '600', letterSpacing: -1, lineHeight: 47, marginTop: 8 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  pctPill: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, gap: 4 },
  pctPillText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '500' },
  paceNote: { fontFamily: Fonts.sans, fontSize: 13 },

  // Section card
  sectionCard: { borderWidth: 1, borderRadius: 22, padding: 18, paddingBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontFamily: Fonts.heading, fontSize: 15, fontWeight: '600' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLabel: { fontFamily: Fonts.mono, fontSize: 9 },
  legendDot: { width: 11, height: 11, borderRadius: 3 },

  // Calendar
  dowRow: { flexDirection: 'row', gap: 6 },
  dowLabel: { flex: 1, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 9 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  calCell: {
    width: '12.6%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 5,
  },
  calCellText: { fontFamily: Fonts.mono, fontSize: 9 },

  h2: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },

  // By week
  weekList: { marginTop: 14, gap: 16 },
  weekRowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 },
  weekRowLabel: { fontFamily: Fonts.sans, fontSize: 13.5, fontWeight: '600' },
  weekRowCount: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '500' },
  weekRowAmount: { fontFamily: Fonts.mono, fontSize: 13 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  // Top categories
  catList: { marginTop: 14, gap: 15 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  catDot: { width: 11, height: 11, borderRadius: 5.5, flexShrink: 0 },
  catBody: { flex: 1, minWidth: 0 },
  catTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600' },
  catTotal: { fontFamily: Fonts.mono, fontSize: 13 },
  catBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBarTrack: { flex: 1, height: 5 },
  catShare: { fontFamily: Fonts.mono, fontSize: 10, width: 30, textAlign: 'right' },
  emptyText: { fontFamily: Fonts.sans, fontSize: 12 },

  // Key stats
  keyStatsWrap: { paddingBottom: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  statsCard: { width: '47.5%', borderWidth: 1, borderRadius: 18, padding: 15, paddingHorizontal: 16 },
  statsLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.6 },
  statsValue: { fontFamily: Fonts.heading, fontSize: 19, fontWeight: '600', marginTop: 8, letterSpacing: -0.1 },
  statsSub: { fontFamily: Fonts.sans, fontSize: 11.5, marginTop: 3 },
});

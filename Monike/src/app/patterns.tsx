/**
 * Patterns — "Your money story"
 *
 * Single vertical scroll, no tabs. Data from /patterns only —
 * the People/recipients section was dropped (not part of the new design).
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import { useAccent } from '@/contexts/accent-context';
import { apiFetch } from '@/services/api';
import { BottomTabInset, Fonts, ScreenPadding, hexAlpha } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type SpendCategory = {
  key: string;
  label: string;
  avg_daily: number;
  share_pct: number;
};

type DowBar = {
  dow: number;
  day_name: string;
  avg_spend: number;
  total_spend: number;
  days_recorded: number;
};

type HeatmapCell = {
  hour: number;
  dow: number;
  transaction_count: number;
};

type PatternsResponse = {
  dow_bars: DowBar[];
  heatmap: HeatmapCell[];
  weekend_avg: number;
  weekday_avg: number;
  spend_composition: SpendCategory[];
  total_high_spend_days: number;
  total_days_recorded: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// dow is 0=Monday..6=Sunday (matches the backend's COMBINED_CTE convention,
// which conveniently already lines up with the mockup's Mon-first columns).
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 6 four-hour bands matching the mockup's column labels
const HOUR_BANDS: { label: string; from: number; to: number }[] = [
  { label: '12a', from: 0, to: 4 },
  { label: '4a', from: 4, to: 8 },
  { label: '8a', from: 8, to: 12 },
  { label: '12p', from: 12, to: 16 },
  { label: '4p', from: 16, to: 20 },
  { label: '8p', from: 20, to: 24 },
];

// Matches the mockup's `compact()` helper exactly: always divides by 1000.
function compact(n: number) {
  return '₦' + (Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

// Maps the real /patterns category keys onto the mockup's exact palette
// (Transfers/POS/Data·Airtime/Family/Other) plus one extra for "online",
// which the static mockup data never needed to show.
const CATEGORY_COLOR: Record<string, string> = {
  p2p: '#5B7CFA',
  pos: '#E08A3C',
  data: '#2BB3A3',
  airtime: '#2BB3A3',
  family: '#E5645B',
  other: '#B06FD6',
  online: '#4FA9E0',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PatternsScreen() {
  const insets = useSafeAreaInsets();
  const { accent, accentTint, colors, dark } = useAccent();
  const { data: patterns, isLoading } = useSWR<PatternsResponse>('/patterns', apiFetch);

  const dowFull = useMemo(() => {
    if (!patterns) return [];
    return Array.from({ length: 7 }, (_, i) =>
      patterns.dow_bars.find((b) => b.dow === i) ?? {
        dow: i, day_name: DAY_NAMES[i], avg_spend: 0, total_spend: 0, days_recorded: 0,
      });
  }, [patterns]);

  const peakBar = useMemo(() => {
    const withSpend = dowFull.filter((b) => b.avg_spend > 0);
    if (withSpend.length === 0) return null;
    return withSpend.reduce((a, b) => (b.avg_spend > a.avg_spend ? b : a));
  }, [dowFull]);

  const weekendVsWeekdayPct = useMemo(() => {
    if (!patterns || patterns.weekday_avg <= 0) return 0;
    return ((patterns.weekend_avg - patterns.weekday_avg) / patterns.weekday_avg) * 100;
  }, [patterns]);

  const peakSharePct = useMemo(() => {
    if (!patterns || !peakBar) return 0;
    const weekTotal = dowFull.reduce((sum, b) => sum + b.total_spend, 0);
    if (weekTotal <= 0) return 0;
    return (peakBar.total_spend / weekTotal) * 100;
  }, [patterns, peakBar, dowFull]);

  const topCategoryLabels = useMemo(() => {
    if (!patterns) return [];
    return [...patterns.spend_composition]
      .sort((a, b) => b.share_pct - a.share_pct)
      .slice(0, 2)
      .map((c) => c.label);
  }, [patterns]);

  const heatRamp = useMemo(() => [
    colors.line, hexAlpha(accent, 0.22), hexAlpha(accent, 0.45), hexAlpha(accent, 0.72), '#E5645B',
  ], [colors.line, accent]);

  const heatGrid = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(HOUR_BANDS.length).fill(0));
    if (!patterns) return grid;
    for (const cell of patterns.heatmap) {
      const bandIndex = HOUR_BANDS.findIndex((b) => cell.hour >= b.from && cell.hour < b.to);
      if (bandIndex === -1) continue;
      grid[cell.dow][bandIndex] += cell.transaction_count;
    }
    return grid;
  }, [patterns]);

  const heatMax = Math.max(...heatGrid.flat(), 1);

  function heatLevel(value: number) {
    if (value <= 0) return 0;
    const ratio = value / heatMax;
    if (ratio > 0.75) return 4;
    if (ratio > 0.45) return 3;
    if (ratio > 0.15) return 2;
    return 1;
  }

  const maxDowAvg = Math.max(...dowFull.map((b) => b.avg_spend), 1);
  const neutralBarColor = dark ? '#2C352F' : '#D9DBD2';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>Patterns</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {!patterns ? (
            <Text style={[styles.loadingText, { color: colors.ink2 }]}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          ) : (
            <>
              {/* Headline insight card */}
              <View style={[styles.habitCard, { backgroundColor: accentTint }]}>
                <Text style={[styles.habitLabel, { color: accent }]}>YOUR HABIT</Text>
                <Text style={[styles.habitHeadline, { color: colors.ink }]}>
                  {peakBar ? `You spend most on ${peakBar.day_name}s` : 'Not enough data yet to spot a habit.'}
                </Text>
                {peakBar ? (
                  <Text style={[styles.habitSub, { color: colors.ink2 }]}>
                    {peakBar.day_name} evenings drive {peakSharePct.toFixed(0)}% of your weekly outflow
                    {topCategoryLabels.length > 0 ? ` — mostly ${topCategoryLabels.join(' and ').toLowerCase()}.` : '.'}
                  </Text>
                ) : null}
              </View>

              {/* Weekday / Weekend row */}
              <View style={styles.twoCardRow}>
                <View style={[styles.tinyCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <Text style={[styles.tinyLabel, { color: colors.ink3 }]}>WEEKDAYS</Text>
                  <Text style={[styles.tinyValue, { color: colors.ink }]}>{compact(patterns.weekday_avg)}</Text>
                  <Text style={[styles.tinySub, { color: colors.ink2 }]}>avg / day</Text>
                </View>
                <View style={[styles.tinyCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <Text style={[styles.tinyLabel, { color: colors.ink3 }]}>WEEKENDS</Text>
                  <Text style={[styles.tinyValue, { color: '#E5645B' }]}>{compact(patterns.weekend_avg)}</Text>
                  <Text style={[styles.tinySub, { color: colors.ink2 }]}>
                    {Math.abs(weekendVsWeekdayPct).toFixed(0)}% {weekendVsWeekdayPct >= 0 ? 'higher' : 'lower'}
                  </Text>
                </View>
              </View>

              {/* By day of week */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>By day of week</Text>
                <View style={styles.dowRow}>
                  {dowFull.map((bar) => {
                    const isPeak = peakBar !== null && bar.dow === peakBar.dow;
                    const heightPx = Math.round((bar.avg_spend / maxDowAvg) * 116) + 7;
                    return (
                      <View key={bar.dow} style={styles.dowCol}>
                        <View
                          style={[
                            styles.dowFill,
                            { height: heightPx, backgroundColor: isPeak ? accent : neutralBarColor },
                          ]}
                        />
                        <Text style={[styles.dowLabel, { color: isPeak ? accent : colors.ink3 }]}>
                          {DAY_SHORT[bar.dow]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* When you spend */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>When you spend</Text>
                <View style={styles.heatRow}>
                  <View style={styles.heatDayCol}>
                    {DAY_SHORT.map((d) => (
                      <Text key={d} style={[styles.heatDayLabel, { color: colors.ink3 }]}>{d}</Text>
                    ))}
                  </View>
                  <View style={styles.heatGridCol}>
                    <View style={styles.heatBandRow}>
                      {HOUR_BANDS.map((b) => (
                        <Text key={b.label} style={[styles.heatBandLabel, { color: colors.ink3 }]}>{b.label}</Text>
                      ))}
                    </View>
                    <View style={styles.heatCellsGrid}>
                      {heatGrid.map((row, dow) => (
                        <View key={dow} style={styles.heatCellsRow}>
                          {row.map((value, i) => (
                            <View
                              key={i}
                              style={[styles.heatCell, { backgroundColor: heatRamp[heatLevel(value)] }]}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Spend composition */}
              <View style={[styles.section, styles.lastSection]}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Spend composition</Text>
                <View style={[styles.compositionBar, { backgroundColor: colors.line }]}>
                  {patterns.spend_composition.map((c) => (
                    <View
                      key={c.key}
                      style={{ width: `${c.share_pct}%`, backgroundColor: CATEGORY_COLOR[c.key] ?? colors.ink3, height: '100%' }}
                    />
                  ))}
                </View>
                <View style={styles.compList}>
                  {patterns.spend_composition.map((c) => (
                    <View key={c.key} style={styles.compRow}>
                      <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOR[c.key] ?? colors.ink3 }]} />
                      <Text style={[styles.catLabel, { color: colors.ink }]}>{c.label}</Text>
                      <Text style={[styles.catDaily, { color: colors.ink }]}>
                        {compact(c.avg_daily)}<Text style={[styles.catDailySuffix, { color: colors.ink3 }]}>/day</Text>
                      </Text>
                      <Text style={[styles.catShare, { color: colors.ink3 }]}>{c.share_pct.toFixed(0)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="patterns" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  loadingText: { fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', marginTop: 40 },

  header: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontFamily: Fonts.heading, fontSize: 24, fontWeight: '600', letterSpacing: -0.3 },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16 },

  habitCard: { borderRadius: 22, padding: 20, marginBottom: 24 },
  habitLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2 },
  habitHeadline: { fontFamily: Fonts.heading, fontSize: 20, fontWeight: '600', marginTop: 8, lineHeight: 26 },
  habitSub: { fontFamily: Fonts.sans, fontSize: 13, marginTop: 6, lineHeight: 19 },

  twoCardRow: { flexDirection: 'row', gap: 12 },
  tinyCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16 },
  tinyLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8 },
  tinyValue: { fontFamily: Fonts.heading, fontSize: 21, fontWeight: '600', marginTop: 8 },
  tinySub: { fontFamily: Fonts.sans, fontSize: 11.5, marginTop: 2 },

  section: { marginTop: 28 },
  lastSection: { paddingBottom: 8 },
  sectionTitle: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '600' },

  // dow bars
  dowRow: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 140 },
  dowCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
  dowFill: { width: '100%', maxWidth: 28, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  dowLabel: { fontFamily: Fonts.mono, fontSize: 10 },

  // heatmap
  heatRow: { marginTop: 16, flexDirection: 'row', gap: 8 },
  heatDayCol: { justifyContent: 'space-around', paddingTop: 16 },
  heatDayLabel: { fontFamily: Fonts.mono, fontSize: 10, height: 22, lineHeight: 22 },
  heatGridCol: { flex: 1 },
  heatBandRow: { flexDirection: 'row', marginBottom: 6 },
  heatBandLabel: { flex: 1, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 8.5 },
  heatCellsGrid: { gap: 5 },
  heatCellsRow: { flexDirection: 'row', gap: 5 },
  heatCell: { flex: 1, height: 22, borderRadius: 5 },

  // composition
  compositionBar: { marginTop: 14, flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  compList: { marginTop: 16, gap: 12 },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  catDot: { width: 9, height: 9, borderRadius: 3 },
  catLabel: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '500' },
  catDaily: { fontFamily: Fonts.mono, fontSize: 13 },
  catDailySuffix: { fontFamily: Fonts.mono, fontSize: 11 },
  catShare: { fontFamily: Fonts.mono, fontSize: 11, width: 34, textAlign: 'right' },
});

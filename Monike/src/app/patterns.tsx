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
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

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

function formatCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
  return formatNaira(abs);
}

const CATEGORY_COLOR: Record<string, string> = {
  p2p: MonikeColors.signalBlue,
  pos: MonikeColors.accentOrange,
  data: MonikeColors.signalAmber,
  airtime: MonikeColors.accentPulse,
  online: MonikeColors.inkSecondary,
  family: MonikeColors.signalRed,
  other: MonikeColors.inkMuted,
};

// 6 four-hour bands matching the mockup's column labels
const HOUR_BANDS: { label: string; from: number; to: number }[] = [
  { label: '12a', from: 0, to: 4 },
  { label: '4a', from: 4, to: 8 },
  { label: '8a', from: 8, to: 12 },
  { label: '12p', from: 12, to: 16 },
  { label: '4p', from: 16, to: 20 },
  { label: '8p', from: 20, to: 24 },
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Day-of-week bars ──────────────────────────────────────────────────────────

function DowBars({ bars, accent }: { bars: DowBar[]; accent: string }) {
  const max = Math.max(...bars.map((b) => b.avg_spend), 1);
  const peakDow = bars.length
    ? bars.reduce((a, b) => (b.avg_spend > a.avg_spend ? b : a)).dow
    : -1;

  return (
    <View style={styles.dowRow}>
      {bars.map((bar) => {
        const isPeak = bar.dow === peakDow;
        const pct = Math.max(0.04, bar.avg_spend / max);
        return (
          <View key={bar.dow} style={styles.dowCol}>
            <View style={styles.dowTrack}>
              <View
                style={[
                  styles.dowFill,
                  { height: `${pct * 100}%`, backgroundColor: isPeak ? accent : MonikeColors.bgElevated },
                ]}
              />
            </View>
            <Text style={[styles.dowLabel, isPeak && { color: accent, fontWeight: '700' }]}>
              {DAY_SHORT[bar.dow]?.slice(0, 1) ?? ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Hour x day heatmap ─────────────────────────────────────────────────────────

function HourHeatmap({ cells, accent }: { cells: HeatmapCell[]; accent: string }) {
  const bandTotals = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(HOUR_BANDS.length).fill(0));
    for (const cell of cells) {
      const bandIndex = HOUR_BANDS.findIndex((b) => cell.hour >= b.from && cell.hour < b.to);
      if (bandIndex === -1) continue;
      grid[cell.dow][bandIndex] += cell.transaction_count;
    }
    return grid;
  }, [cells]);

  const max = Math.max(...bandTotals.flat(), 1);

  function cellColor(value: number) {
    if (value <= 0) return MonikeColors.bgElevated;
    const ratio = value / max;
    if (ratio > 0.75) return MonikeColors.signalRed;
    if (ratio > 0.45) return hexA(accent, 0.72);
    if (ratio > 0.15) return hexA(accent, 0.45);
    return hexA(accent, 0.22);
  }

  return (
    <View>
      <View style={styles.heatHeaderRow}>
        <View style={styles.heatRowLabel} />
        {HOUR_BANDS.map((b) => (
          <Text key={b.label} style={styles.heatColLabel}>{b.label}</Text>
        ))}
      </View>
      {bandTotals.map((row, dow) => (
        <View key={dow} style={styles.heatRow}>
          <Text style={styles.heatRowLabelText}>{DAY_SHORT[dow]}</Text>
          {row.map((value, i) => (
            <View key={i} style={[styles.heatCell, { backgroundColor: cellColor(value) }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PatternsScreen() {
  const insets = useSafeAreaInsets();
  const { accent } = useAccent();
  const { data: patterns, isLoading } = useSWR<PatternsResponse>('/patterns', apiFetch);

  const peakBar = useMemo(() => {
    if (!patterns || patterns.dow_bars.length === 0) return null;
    return patterns.dow_bars.reduce((a, b) => (b.avg_spend > a.avg_spend ? b : a));
  }, [patterns]);

  const weekendVsWeekdayPct = useMemo(() => {
    if (!patterns || patterns.weekday_avg <= 0) return 0;
    return ((patterns.weekend_avg - patterns.weekday_avg) / patterns.weekday_avg) * 100;
  }, [patterns]);

  const peakSharePct = useMemo(() => {
    if (!patterns || !peakBar) return 0;
    const weekTotal = patterns.dow_bars.reduce((sum, b) => sum + b.total_spend, 0);
    if (weekTotal <= 0) return 0;
    return (peakBar.total_spend / weekTotal) * 100;
  }, [patterns, peakBar]);

  const topCategoryLabels = useMemo(() => {
    if (!patterns) return [];
    return [...patterns.spend_composition]
      .sort((a, b) => b.share_pct - a.share_pct)
      .slice(0, 2)
      .map((c) => c.label);
  }, [patterns]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Patterns</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {!patterns ? (
            <Text style={styles.loadingText}>{isLoading ? 'Loading…' : 'No data yet'}</Text>
          ) : (
            <>
              {/* Headline insight card */}
              <View style={[styles.sectionCard, { borderColor: hexA(accent, 0.35) }]}>
                <Text style={[styles.habitLabel, { color: accent }]}>YOUR HABIT</Text>
                <Text style={styles.habitHeadline}>
                  {peakBar ? `You spend most on ${peakBar.day_name}s` : 'Not enough data yet to spot a habit.'}
                </Text>
                {peakBar ? (
                  <Text style={styles.habitSub}>
                    {peakBar.day_name} evenings drive {peakSharePct.toFixed(0)}% of your weekly outflow
                    {topCategoryLabels.length > 0 ? ` — mostly ${topCategoryLabels.join(' and ').toLowerCase()}.` : '.'}
                  </Text>
                ) : null}
              </View>

              {/* Weekday / Weekend row */}
              <View style={styles.twoCardRow}>
                <View style={styles.sectionCard}>
                  <Text style={styles.tinyLabel}>WEEKDAYS</Text>
                  <Text style={styles.tinyValue}>₦{formatCompact(patterns.weekday_avg)}</Text>
                  <Text style={styles.tinySub}>avg / day</Text>
                </View>
                <View style={styles.sectionCard}>
                  <Text style={styles.tinyLabel}>WEEKENDS</Text>
                  <Text style={[styles.tinyValue, weekendVsWeekdayPct > 0 && { color: MonikeColors.signalRed }]}>
                    ₦{formatCompact(patterns.weekend_avg)}
                  </Text>
                  <Text style={[styles.tinySub, weekendVsWeekdayPct > 0 && { color: MonikeColors.signalRed }]}>
                    {Math.abs(weekendVsWeekdayPct).toFixed(0)}% {weekendVsWeekdayPct >= 0 ? 'higher' : 'lower'}
                  </Text>
                </View>
              </View>

              {/* By day of week */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>By day of week</Text>
                <DowBars bars={patterns.dow_bars} accent={accent} />
              </View>

              {/* When you spend */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>When you spend</Text>
                <HourHeatmap cells={patterns.heatmap} accent={accent} />
              </View>

              {/* Spend composition */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Spend composition</Text>
                <View style={styles.compositionBar}>
                  {patterns.spend_composition.map((c) => (
                    <View
                      key={c.key}
                      style={{
                        width: `${c.share_pct}%`,
                        backgroundColor: CATEGORY_COLOR[c.key] ?? MonikeColors.inkMuted,
                        height: '100%',
                      }}
                    />
                  ))}
                </View>
                {patterns.spend_composition.map((c) => (
                  <View key={c.key} style={styles.compRow}>
                    <View style={styles.catLabelRow}>
                      <View style={[styles.catDot, { backgroundColor: CATEGORY_COLOR[c.key] ?? MonikeColors.inkMuted }]} />
                      <Text style={styles.catLabel}>{c.label}</Text>
                    </View>
                    <View style={styles.compRowRight}>
                      <Text style={styles.catShare}>{c.share_pct.toFixed(0)}%</Text>
                      <Text style={styles.catAvg}>₦{formatNaira(c.avg_daily)}/day</Text>
                    </View>
                  </View>
                ))}
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
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  loadingText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', marginTop: 40 },

  header: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700' },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 16, gap: 16 },

  sectionCard: {
    flex: 1,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, padding: 16, gap: 12,
  },
  sectionTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' },

  habitLabel: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  habitHeadline: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  habitSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  twoCardRow: { flexDirection: 'row', gap: 12 },
  tinyLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  tinyValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '800' },
  tinySub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },

  // dow bars
  dowRow: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 8 },
  dowCol: { flex: 1, alignItems: 'center', gap: 6 },
  dowTrack: { width: '100%', height: 76, justifyContent: 'flex-end' },
  dowFill: { width: '100%', borderRadius: 5, minHeight: 4 },
  dowLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },

  // heatmap
  heatHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  heatRowLabel: { width: 32 },
  heatColLabel: { flex: 1, textAlign: 'center', color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatRowLabelText: { width: 32, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  heatCell: { flex: 1, height: 22, marginHorizontal: 2, borderRadius: 5 },

  // composition
  compositionBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: MonikeColors.bgElevated },
  compRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  compRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  catShare: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },
  catAvg: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
});

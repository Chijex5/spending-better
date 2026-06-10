/**
 * Patterns — "Your money story"
 *
 * Four narrative sections, no tabs, single vertical scroll.
 * Data from two endpoints: /patterns (rhythm + mix) + /recipients (P2P people).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs, LinearGradient, Path, Polygon, Stop,
} from 'react-native-svg';
import { Activity, Clock, PieChart, Users } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { apiFetch, type CategoryTransactionsResponse } from '@/services/api';
import { useSWR } from '@/hooks/use-swr';

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

type MonthlyPoint = {
  month: number;
  year: number;
  month_label: string;
  total_spend: number;
  pct_change: number;
};

type HeatmapCell = {
  hour: number;
  dow: number;
  transaction_count: number;
};

type PatternsData = {
  dow_bars: DowBar[];
  monthly_points: MonthlyPoint[];
  heatmap: HeatmapCell[];
  weekend_avg: number;
  weekday_avg: number;
  spend_composition: SpendCategory[];
  total_high_spend_days: number;
  total_days_recorded: number;
};

type MonthlyTransferBar = {
  month_label: string;
  total_sent: number;
};

type RecipientItem = {
  name: string;
  total_sent: number;
  transfer_count: number;
  avg_per_transfer: number;
  last_transfer_date: string;
  monthly_bars: MonthlyTransferBar[];
};

type RecipientsData = {
  items: RecipientItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatCompact(v: number) {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₦${(v / 1_000).toFixed(0)}K`;
  return `₦${Math.round(v).toLocaleString('en-NG')}`;
}

function formatHour(h: number) {
  if (h === 0)  return '12am';
  if (h < 12)   return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
}

function nameColor(name: string): string {
  const COLORS = ['#FF6633', '#7B61FF', '#00C9A7', '#FF9500', '#FF3B7A', '#34AADC'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function categoryColor(key: string): string {
  const MAP: Record<string, string> = {
    p2p:     MonikeColors.accentOrange,
    pos:     '#7B61FF',
    data:    MonikeColors.accentPulse,
    airtime: MonikeColors.signalAmber,
    online:  '#34AADC',
    family:  '#FF3B7A',
    other:   MonikeColors.inkGhost,
  };
  return MAP[key] ?? MonikeColors.inkGhost;
}

function heatColor(count: number, max: number): string {
  if (!count || !max) return MonikeColors.bgElevated;
  const r = count / max;
  if (r < 0.15) return 'rgba(123,97,255,0.14)';
  if (r < 0.35) return 'rgba(123,97,255,0.35)';
  if (r < 0.60) return 'rgba(255,102,51,0.40)';
  if (r < 0.80) return 'rgba(255,102,51,0.65)';
  return MonikeColors.accentOrange;
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

function Shimmer({ style }: { style?: object }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, [a]);
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.18] });
  return <Animated.View style={[{ borderRadius: 8, backgroundColor: MonikeColors.inkPrimary, opacity }, style]} />;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon, label, headline, sub, children,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={ss.section}>
      <View style={ss.sectionHead}>
        <View style={ss.sectionIconWrap}>{icon}</View>
        <Text style={ss.sectionLabel}>{label}</Text>
      </View>
      <Text style={ss.sectionHeadline}>{headline}</Text>
      {sub ? <Text style={ss.sectionSub}>{sub}</Text> : null}
      <View style={ss.sectionBody}>{children}</View>
    </View>
  );
}

// ─── Section 1: Who gets your money (P2P) ────────────────────────────────────

function PersonCard({
  item,
  totalP2P,
  onPress,
}: {
  item: RecipientItem;
  totalP2P: number;
  onPress: () => void;
}) {
  const color     = nameColor(item.name);
  const share     = totalP2P > 0 ? (item.total_sent / totalP2P) * 100 : 0;
  const ini       = initials(item.name);
  const firstName = item.name.split(' ')[0];

  return (
    <Pressable onPress={onPress}>
      <View style={ss.personCard}>
        <View style={[ss.personAvatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[ss.personInitials, { color }]}>{ini}</Text>
        </View>
        <Text style={ss.personName} numberOfLines={1}>{firstName}</Text>
        <Text style={[ss.personAmount, { color }]}>{formatCompact(item.total_sent)}</Text>
        <View style={ss.personMeta}>
          <Text style={ss.personMetaText}>{item.transfer_count} sends</Text>
          <View style={ss.personMetaDot} />
          <Text style={ss.personMetaText}>avg {formatCompact(item.avg_per_transfer)}</Text>
        </View>
        <View style={ss.personBarTrack}>
          <View style={[ss.personBarFill, { width: `${Math.min(share, 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={[ss.personShare, { color }]}>{share.toFixed(0)}% of P2P</Text>
        <Text style={[ss.personTapHint, { color }]}>Tap to view →</Text>
      </View>
    </Pressable>
  );
}

function PeopleSection({
  data,
  onPersonPress,
}: {
  data: RecipientsData | undefined;
  onPersonPress: (item: RecipientItem) => void;
}) {
  const items    = data?.items ?? [];
  const totalP2P = items.reduce((s, i) => s + i.total_sent, 0);
  const top3Share = useMemo(() => {
    if (items.length < 2) return 0;
    const top3 = items.slice(0, 3).reduce((s, i) => s + i.total_sent, 0);
    return totalP2P > 0 ? (top3 / totalP2P) * 100 : 0;
  }, [items, totalP2P]);

  if (!data) {
    return (
      <Section
        icon={<Users size={14} color={MonikeColors.accentOrange} strokeWidth={2.5} />}
        label="WHO GETS YOUR MONEY"
        headline="Loading P2P transfer data…"
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.personRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={ss.personCard}>
              <Shimmer style={{ width: 46, height: 46, borderRadius: 23, alignSelf: 'center' }} />
              <Shimmer style={{ height: 10, width: '75%', alignSelf: 'center', marginTop: 10 }} />
              <Shimmer style={{ height: 18, width: '55%', alignSelf: 'center', marginTop: 6 }} />
            </View>
          ))}
        </ScrollView>
      </Section>
    );
  }

  if (items.length === 0) {
    return (
      <Section
        icon={<Users size={14} color={MonikeColors.accentOrange} strokeWidth={2.5} />}
        label="WHO GETS YOUR MONEY"
        headline="No P2P transfer data yet"
        sub="Outgoing person-to-person transfers will appear here once you have enough history."
      >
        <View />
      </Section>
    );
  }

  const headline = `${formatCompact(totalP2P)} sent to ${items.length} ${items.length === 1 ? 'person' : 'people'}`;
  const sub = items.length >= 3
    ? `Top 3 recipients account for ${top3Share.toFixed(0)}% of all your P2P sends`
    : items.length >= 2
      ? `${items[0].name.split(' ')[0]} is your biggest recipient at ${((items[0].total_sent / totalP2P) * 100).toFixed(0)}%`
      : undefined;

  return (
    <Section
      icon={<Users size={14} color={MonikeColors.accentOrange} strokeWidth={2.5} />}
      label="WHO GETS YOUR MONEY"
      headline={headline}
      sub={sub}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.personRow}
      >
        {items.map((item) => (
          <PersonCard key={item.name} item={item} totalP2P={totalP2P} onPress={() => onPersonPress(item)} />
        ))}
      </ScrollView>
    </Section>
  );
}

// ─── Section 2: What it goes to (spend composition) ──────────────────────────

function CategoryBar({ cat, maxAvg }: { cat: SpendCategory; maxAvg: number }) {
  const pct       = maxAvg > 0 ? cat.avg_daily / maxAvg : 0;
  const widthAnim = useRef(new Animated.Value(0)).current;
  const color     = categoryColor(cat.key);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  const animWidth = widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={ss.catRow}>
      <View style={ss.catLabelWrap}>
        <View style={[ss.catDot, { backgroundColor: color }]} />
        <Text style={ss.catLabel} numberOfLines={1}>{cat.label}</Text>
      </View>
      <View style={ss.catBarTrack}>
        <Animated.View style={[ss.catBarFill, { width: animWidth, backgroundColor: color + 'BB' }]} />
      </View>
      <View style={ss.catRight}>
        <Text style={[ss.catAmount, { color }]}>{formatCompact(cat.avg_daily)}</Text>
        <Text style={ss.catShare}>{cat.share_pct.toFixed(0)}%</Text>
      </View>
    </View>
  );
}

function CompositionSection({ data }: { data: PatternsData | undefined }) {
  if (!data || !data.spend_composition.length) return null;
  const cats   = data.spend_composition;
  const maxAvg = cats[0].avg_daily;
  const topCat = cats[0];
  const highPct = data.total_days_recorded > 0
    ? ((data.total_high_spend_days / data.total_days_recorded) * 100).toFixed(0)
    : '0';

  return (
    <Section
      icon={<PieChart size={14} color="#7B61FF" strokeWidth={2.5} />}
      label="WHAT IT GOES TO"
      headline={`${topCat.label} takes the biggest cut at ${topCat.share_pct.toFixed(0)}% of daily outflow`}
      sub={`${highPct}% of your recorded days were high-spend days`}
    >
      <View style={ss.card}>
        <View style={ss.catList}>
          {cats.map((cat) => (
            <CategoryBar key={cat.key} cat={cat} maxAvg={maxAvg} />
          ))}
        </View>
        <Text style={ss.catSubline}>Daily average across all recorded history</Text>
      </View>
    </Section>
  );
}

// ─── Section 3: When you spend (DOW bars + monthly mini trend) ────────────────

function DowBars({ dowBars }: { dowBars: DowBar[] }) {
  const slots  = Array.from({ length: 7 }, (_, i) => dowBars.find((b) => b.dow === i) ?? null);
  const maxAvg = Math.max(...dowBars.map((b) => b.avg_spend), 1);
  const peak   = dowBars.reduce<DowBar | null>((b, c) => (!b || c.avg_spend > b.avg_spend ? c : b), null);

  return (
    <View style={ss.dowBars}>
      {slots.map((bar, i) => {
        const pct    = bar ? bar.avg_spend / maxAvg : 0;
        const isPeak = bar !== null && peak !== null && bar.dow === peak.dow;
        const color  = isPeak
          ? MonikeColors.accentOrange
          : pct > 0.6
            ? '#7B61FF'
            : MonikeColors.bgElevated;
        return (
          <View key={i} style={ss.dowBarCol}>
            {isPeak && <View style={ss.dowPeakDot} />}
            <View style={[ss.dowBarFill, {
              height: Math.max(6, pct * 76),
              backgroundColor: color,
              borderTopLeftRadius: 5,
              borderTopRightRadius: 5,
            }]} />
            <Text style={[ss.dowBarLabel, isPeak && { color: MonikeColors.accentOrange, fontWeight: '700' }]}>
              {DOW_SHORT[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MonthMiniChart({ points }: { points: MonthlyPoint[] }) {
  const { width } = useWindowDimensions();
  if (points.length < 2) return null;

  const chartW = Math.max(120, (width - ScreenPadding * 2 - 32) / 2 - 20);
  const totals = points.map((p) => p.total_spend);
  const max    = Math.max(...totals);
  const min    = Math.min(...totals);
  const step   = chartW / (points.length - 1);
  const H      = 56;
  const pts    = points.map((p, i) => ({
    x: i * step,
    y: H - ((p.total_spend - min) / Math.max(max - min, 1)) * (H - 6),
  }));

  const pathD = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const mx   = (prev.x + p.x) / 2;
    return `${d} Q ${prev.x} ${prev.y} ${mx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pts[0].x},${H} ${pts.map((p) => `${p.x},${p.y}`).join(' ')} ${pts.at(-1)!.x},${H}`;
  const last  = points.at(-1)!;
  const color = last.pct_change > 3 ? MonikeColors.signalRed : last.pct_change < -3 ? MonikeColors.accentPulse : MonikeColors.signalAmber;

  return (
    <View>
      <Svg width={chartW} height={H + 2}>
        <Defs>
          <LinearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.3" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Polygon points={areaD} fill="url(#mGrad)" />
        <Path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <View style={ss.miniChartLabels}>
        <Text style={ss.miniChartLabel}>{points[0].month_label}</Text>
        <Text style={[ss.miniChartLabel, { color }]}>{last.month_label} {last.year}</Text>
      </View>
    </View>
  );
}

function RhythmSection({ data }: { data: PatternsData | undefined }) {
  if (!data) return null;
  const { dow_bars, monthly_points, weekday_avg, weekend_avg } = data;

  const peak     = dow_bars.reduce<DowBar | null>((b, c) => (!b || c.avg_spend > b.avg_spend ? c : b), null);
  const low      = dow_bars.reduce<DowBar | null>((b, c) => (!b || c.avg_spend < b.avg_spend ? c : b), null);
  const wkHigher = weekend_avg > weekday_avg;
  const wkDiff   = weekday_avg > 0 ? Math.abs(((weekend_avg - weekday_avg) / weekday_avg) * 100) : 0;
  const last     = monthly_points.at(-1);
  const trendDir = last ? (last.pct_change > 3 ? 'up' : last.pct_change < -3 ? 'down' : 'flat') : 'flat';
  const trendColor = trendDir === 'up' ? MonikeColors.signalRed : trendDir === 'down' ? MonikeColors.accentPulse : MonikeColors.signalAmber;
  const trendText  = last
    ? trendDir === 'up'   ? `▲ ${last.pct_change.toFixed(1)}% vs prior`
    : trendDir === 'down' ? `▼ ${Math.abs(last.pct_change).toFixed(1)}% vs prior`
    : 'Flat vs prior'
    : '';

  const headline = peak
    ? `${peak.day_name}s hit hardest — avg ${formatCompact(peak.avg_spend)}/day`
    : 'No rhythm data yet';
  const sub = peak && low
    ? `Lightest on ${low.day_name}s · Weekends run ${wkDiff.toFixed(0)}% ${wkHigher ? 'higher' : 'lower'} than weekdays`
    : undefined;

  return (
    <Section
      icon={<Activity size={14} color={MonikeColors.accentPulse} strokeWidth={2.5} />}
      label="WHEN YOU SPEND"
      headline={headline}
      sub={sub}
    >
      <View style={ss.rhythmGrid}>
        {/* Day-of-week card */}
        <View style={[ss.card, ss.rhythmHalf]}>
          <Text style={ss.cardMicro}>DAY OF WEEK</Text>
          {dow_bars.length > 0
            ? <DowBars dowBars={dow_bars} />
            : <Text style={ss.emptyText}>No data</Text>}
          <View style={ss.wkRow}>
            <View>
              <Text style={ss.wkLabel}>WEEKDAYS</Text>
              <Text style={ss.wkValue}>{formatCompact(weekday_avg)}</Text>
            </View>
            <View style={ss.wkSep} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={ss.wkLabel}>WEEKENDS</Text>
              <Text style={[ss.wkValue, { color: wkHigher ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>
                {formatCompact(weekend_avg)}
              </Text>
            </View>
          </View>
        </View>

        {/* Monthly trend card */}
        {monthly_points.length >= 2 && last && (
          <View style={[ss.card, ss.rhythmHalf]}>
            <Text style={ss.cardMicro}>MONTHLY TREND</Text>
            <Text style={[ss.trendBadge, { color: trendColor }]}>{trendText}</Text>
            <MonthMiniChart points={monthly_points} />
            <View style={ss.wkRow}>
              <View>
                <Text style={ss.wkLabel}>LATEST</Text>
                <Text style={[ss.wkValue, { color: trendColor }]}>{formatCompact(last.total_spend)}</Text>
              </View>
              <View style={ss.wkSep} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={ss.wkLabel}>MONTHS</Text>
                <Text style={ss.wkValue}>{monthly_points.length}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Section>
  );
}

// ─── Section 4: Peak hours heatmap ────────────────────────────────────────────

function HoursSection({ data }: { data: PatternsData | undefined }) {
  const { width } = useWindowDimensions();
  if (!data || !data.heatmap.length) return null;

  const heatmap    = data.heatmap;
  const maxCount   = Math.max(...heatmap.map((c) => c.transaction_count), 1);
  const cellW      = Math.max(8, (width - ScreenPadding * 2 - 32 - 40) / 24);
  const hourTotals = Array.from({ length: 24 }, (_, h) =>
    heatmap.filter((c) => c.hour === h).reduce((s, c) => s + c.transaction_count, 0),
  );
  const peakHour   = hourTotals.indexOf(Math.max(...hourTotals));
  const peakCell   = heatmap.reduce((b, c) => c.transaction_count > b.transaction_count ? c : b, heatmap[0]);

  return (
    <Section
      icon={<Clock size={14} color={MonikeColors.signalAmber} strokeWidth={2.5} />}
      label="PEAK HOURS"
      headline={`Most active ${formatHour(peakHour)}–${formatHour(peakHour + 1)} on ${DOW_SHORT[peakCell.dow]}s`}
      sub={`${peakCell.transaction_count} transactions at your busiest slot — tap a row to explore`}
    >
      <View style={ss.card}>
        {/* Hour axis */}
        <View style={ss.heatHourAxis}>
          <View style={{ width: 36 }} />
          {[0, 6, 12, 18].map((h) => (
            <Text key={h} style={[ss.heatHourTick, { left: 36 + h * cellW + cellW / 2 - 8 }]}>
              {formatHour(h)}
            </Text>
          ))}
        </View>

        {/* Heatmap rows */}
        {Array.from({ length: 7 }, (_, dow) => (
          <View key={dow} style={ss.heatRow}>
            <Text style={ss.heatDayLabel}>{DOW_SHORT[dow]}</Text>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell  = heatmap.find((c) => c.dow === dow && c.hour === hour);
              const count = cell?.transaction_count ?? 0;
              return (
                <View
                  key={hour}
                  style={[ss.heatCell, { width: cellW, backgroundColor: heatColor(count, maxCount) }]}
                />
              );
            })}
          </View>
        ))}

        {/* Legend */}
        <View style={ss.heatLegend}>
          {['rgba(123,97,255,0.14)', 'rgba(123,97,255,0.35)', 'rgba(255,102,51,0.40)', MonikeColors.accentOrange].map((bg, i) => (
            <View key={i} style={[ss.legendSwatch, { backgroundColor: bg }]} />
          ))}
          <Text style={ss.legendText}>Low → Peak</Text>
        </View>
      </View>
    </Section>
  );
}

// ─── Loading & error ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <View style={{ gap: 28, paddingHorizontal: ScreenPadding, paddingTop: 24 }}>
      {[120, 200, 180, 150].map((h, i) => (
        <View key={i} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Shimmer style={{ width: 22, height: 22, borderRadius: 7 }} />
            <Shimmer style={{ height: 9, width: 90 }} />
          </View>
          <Shimmer style={{ height: 22, width: '80%' }} />
          <Shimmer style={{ height: 10, width: '60%' }} />
          <Shimmer style={{ height: h, borderRadius: CardRadius }} />
        </View>
      ))}
    </View>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[ss.card, { margin: ScreenPadding, alignItems: 'center', gap: 12, paddingVertical: 32 }]}>
      <Text style={{ color: MonikeColors.signalRed, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700' }}>
        Failed to load patterns
      </Text>
      <Pressable
        style={{ backgroundColor: MonikeColors.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: 20, paddingVertical: 10 }}
        onPress={onRetry}
      >
        <Text style={{ color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ─── PersonTransactionSheet ───────────────────────────────────────────────────

function PersonTransactionSheet({
  person,
  transactions,
  isLoading,
  visible,
  onClose,
}: {
  person: RecipientItem | null;
  transactions: { trans_date: string; debit: number }[];
  isLoading: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const windowHeight    = Dimensions.get('window').height;
  const height          = windowHeight * 0.82;
  const translateY      = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => { translateY.setValue(Math.max(0, g.dy)); },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90) onClose();
          else Animated.spring(translateY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : height, duration: visible ? 240 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, height, translateY, visible]);

  if (!person) return null;

  const color = nameColor(person.name);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const ini = initials(person.name);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={pss.backdrop} onPress={onClose}>
        <Animated.View style={[pss.backdropTint, { opacity: backdropOpacity }]} />
      </Pressable>

      <Animated.View style={[pss.sheet, { height, transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={pss.dragZone}>
          <View style={pss.handle} />
        </View>

        {/* Header */}
        <View style={pss.headerRow}>
          <View style={pss.titleRow}>
            <View style={[pss.avatarCircle, { backgroundColor: color + '22', borderColor: color + '55' }]}>
              <Text style={[pss.avatarText, { color }]}>{ini}</Text>
            </View>
            <View>
              <Text style={pss.title}>{person.name}</Text>
              <Text style={[pss.totalText, { color }]}>{formatCompact(person.total_sent)} sent all time</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={pss.closeBtn}>
            <Text style={pss.closeTxt}>×</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={pss.statsRow}>
          <View style={pss.statCell}>
            <Text style={pss.statLabel}>Total Sent</Text>
            <Text style={[pss.statValue, { color }]}>{formatCompact(person.total_sent)}</Text>
          </View>
          <View style={pss.statCell}>
            <Text style={pss.statLabel}>Transfers</Text>
            <Text style={pss.statValue}>{person.transfer_count}</Text>
          </View>
          <View style={[pss.statCell, { borderRightWidth: 0 }]}>
            <Text style={pss.statLabel}>Avg / Send</Text>
            <Text style={pss.statValue}>{formatCompact(person.avg_per_transfer)}</Text>
          </View>
        </View>

        <Text style={pss.txnHeading}>TRANSACTIONS</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={pss.txnList}>
          {isLoading && (
            <View style={{ gap: 12, padding: 8 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Shimmer style={{ width: 36, height: 36, borderRadius: 18 }} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Shimmer style={{ height: 12, width: '55%' }} />
                    <Shimmer style={{ height: 10, width: '35%' }} />
                  </View>
                  <Shimmer style={{ height: 14, width: 72 }} />
                </View>
              ))}
            </View>
          )}
          {!isLoading && transactions.length === 0 && (
            <View style={pss.note}><Text style={pss.noteTxt}>No transactions found.</Text></View>
          )}
          {!isLoading && transactions.map((txn, i) => (
            <View key={`${txn.trans_date}-${i}`} style={[pss.txnRow, i === transactions.length - 1 && pss.txnRowLast]}>
              <View style={[pss.txnIcon, { backgroundColor: color + '18' }]}>
                <Users size={14} color={color} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pss.txnLabel}>Transfer</Text>
                <Text style={pss.txnDate}>{formatDate(txn.trans_date)}</Text>
              </View>
              <Text style={[pss.txnAmount, { color }]}>−{formatCompact(txn.debit)}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const pss = StyleSheet.create({
  backdrop:      { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdropTint:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000099' },
  sheet:         { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: MonikeColors.bgOverlay, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: MonikeColors.inkGhost, paddingHorizontal: ScreenPadding, paddingBottom: 26 },
  dragZone:      { paddingTop: 10, paddingBottom: 12 },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkMuted, alignSelf: 'center' },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle:  { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { fontFamily: Fonts.heading, fontSize: 15, fontWeight: '800' },
  title:         { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' },
  totalText:     { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '600', marginTop: 2 },
  closeBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  closeTxt:      { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 22, lineHeight: 24 },
  statsRow:      { flexDirection: 'row', marginTop: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: MonikeColors.inkGhost },
  statCell:      { flex: 1, backgroundColor: MonikeColors.bgSurface, padding: 10, borderRightWidth: 1, borderRightColor: MonikeColors.inkGhost },
  statLabel:     { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginBottom: 5 },
  statValue:     { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  txnHeading:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 18, marginBottom: 8 },
  txnList:       { flex: 1 },
  txnRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: MonikeColors.inkGhost + '55', gap: 10 },
  txnRowLast:    { borderBottomWidth: 0 },
  txnIcon:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txnLabel:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },
  txnDate:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  txnAmount:     { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  note:          { padding: 16, borderRadius: 12, backgroundColor: MonikeColors.bgSurface, marginTop: 4 },
  noteTxt:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const patternsFetcher   = (k: string) => apiFetch<PatternsData>(k);
const recipientsFetcher = (k: string) => apiFetch<RecipientsData>(k);
const p2pTxnFetcher     = (k: string) => apiFetch<CategoryTransactionsResponse>(k);

function extractRecipientName(description: string): string | null {
  const m = description.match(/^Transfer to (.+?)(?:\s*\||\s*$)/i);
  return m ? m[1].trim() : null;
}

export default function PatternsScreen() {
  const insets      = useSafeAreaInsets();

  const [selectedRecipient, setSelectedRecipient] = useState<RecipientItem | null>(null);
  const [personSheetVisible, setPersonSheetVisible] = useState(false);

  const { data: patterns, error: pErr, isLoading: pLoading, mutate: pRetry } =
    useSWR<PatternsData>('/patterns', useCallback(patternsFetcher, []));
  const { data: recipients, isLoading: rLoading } =
    useSWR<RecipientsData>('/recipients', useCallback(recipientsFetcher, []));

  const p2pTxnKey = selectedRecipient ? '/categories/Person-to-Person/transactions?period=all' : null;
  const { data: p2pTxnData, isLoading: p2pTxnLoading } =
    useSWR<CategoryTransactionsResponse>(p2pTxnKey, useCallback(p2pTxnFetcher, []));

  const personTransactions = useMemo(() => {
    if (!selectedRecipient || !p2pTxnData) return [];
    return p2pTxnData.items.filter(
      (txn) => extractRecipientName(txn.description) === selectedRecipient.name,
    );
  }, [selectedRecipient, p2pTxnData]);

  const handlePersonPress = useCallback((item: RecipientItem) => {
    setSelectedRecipient(item);
    setPersonSheetVisible(true);
  }, []);

  const handlePersonSheetClose = useCallback(() => {
    setPersonSheetVisible(false);
  }, []);

  const isLoading = pLoading || rLoading;

  return (
    <View style={ss.root}>
      <SafeAreaView style={ss.safeArea} edges={['top']}>

        <MonikeHeader title="Patterns" subtitle="Your money story" back />

        {/* Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + BottomTabInset + 40 }}
        >
          {isLoading ? (
            <PageSkeleton />
          ) : pErr ? (
            <ErrorBanner onRetry={pRetry} />
          ) : (
            <>
              <PeopleSection data={recipients} onPersonPress={handlePersonPress} />
              <CompositionSection data={patterns} />
              <RhythmSection data={patterns} />
              <HoursSection data={patterns} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <BottomNavigation activeRoute="more" />

      <PersonTransactionSheet
        person={selectedRecipient}
        transactions={personTransactions}
        isLoading={p2pTxnLoading}
        visible={personSheetVisible}
        onClose={handlePersonSheetClose}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },

  // Section
  section:         { paddingHorizontal: ScreenPadding, paddingTop: 28 },
  sectionHead:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionIconWrap: {
    width: 22, height: 22, borderRadius: 7,
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  sectionHeadline: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', lineHeight: 24, letterSpacing: -0.3 },
  sectionSub:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionBody:     { marginTop: 16 },

  // Shared card
  card:      { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 16 },
  cardMicro: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginBottom: 10 },
  emptyText: { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 12 },

  // People (P2P)
  personRow:      { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  personCard:     {
    width: 130, backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 18, padding: 14,
  },
  personAvatar:   { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  personInitials: { fontFamily: Fonts.heading, fontSize: 15, fontWeight: '800' },
  personName:     { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  personAmount:   { fontFamily: Fonts.mono, fontSize: 17, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  personMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 },
  personMetaText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  personMetaDot:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: MonikeColors.inkGhost },
  personBarTrack: { height: 4, borderRadius: 2, backgroundColor: MonikeColors.bgElevated, marginTop: 10, overflow: 'hidden' },
  personBarFill:  { height: '100%', borderRadius: 2 },
  personShare:    { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', marginTop: 5, textAlign: 'right' },
  personTapHint:  { fontFamily: Fonts.sans, fontSize: 9, fontWeight: '600', marginTop: 3, textAlign: 'right', opacity: 0.7 },

  // Category composition
  catList:     { gap: 12 },
  catRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catLabelWrap:{ width: 104, flexDirection: 'row', alignItems: 'center', gap: 6 },
  catDot:      { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  catLabel:    { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 11, fontWeight: '500', flex: 1 },
  catBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  catBarFill:  { height: '100%', borderRadius: 3 },
  catRight:    { width: 56, alignItems: 'flex-end' },
  catAmount:   { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  catShare:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  catSubline:  { color: MonikeColors.inkGhost, fontFamily: Fonts.sans, fontSize: 10, marginTop: 14, textAlign: 'center' },

  // Rhythm section
  rhythmGrid:    { gap: 10 },
  rhythmHalf:    {},
  dowBars:       { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 4, marginBottom: 4 },
  dowBarCol:     { flex: 1, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  dowBarFill:    { width: '100%' },
  dowBarLabel:   { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, marginTop: 5 },
  dowPeakDot:    { position: 'absolute', top: -10, width: 5, height: 5, borderRadius: 2.5, backgroundColor: MonikeColors.accentOrange },
  wkRow:         { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: MonikeColors.inkGhost },
  wkLabel:       { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  wkValue:       { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 15, fontWeight: '800', marginTop: 2 },
  wkSep:         { flex: 1 },
  trendBadge:    { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  miniChartLabels:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  miniChartLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },

  // Heatmap
  heatHourAxis:  { height: 18, position: 'relative', marginBottom: 4 },
  heatHourTick:  { position: 'absolute', color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 8 },
  heatRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  heatDayLabel:  { width: 36, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '600' },
  heatCell:      { height: 24, borderRadius: 3, marginRight: 1.5 },
  heatLegend:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, justifyContent: 'flex-end' },
  legendSwatch:  { width: 12, height: 12, borderRadius: 3 },
  legendText:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginLeft: 2 },
});

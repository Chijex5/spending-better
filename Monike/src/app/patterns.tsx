import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Bell, Clock, Crown, Moon, TrendingUp } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

type PatternTab = 'DAY OF WEEK' | 'MONTHLY' | 'TIME OF DAY';
type Status = 'HIGH' | 'MEDIUM' | 'LOW';

type DayPattern = {
  key: string;
  name: string;
  avg: number;
  total: number;
  recordings: number;
};

type MonthPattern = {
  month: string;
  fullName: string;
  total: number;
};

type HeatCell = {
  day: string;
  hour: number;
  txns: number;
  avg: number;
};

const tabs: PatternTab[] = ['DAY OF WEEK', 'MONTHLY', 'TIME OF DAY'];
const dayPatterns: DayPattern[] = [
  { key: 'Mon', name: 'Monday', avg: 38400, total: 153600, recordings: 24 },
  { key: 'Tue', name: 'Tuesday', avg: 51600, total: 206400, recordings: 29 },
  { key: 'Wed', name: 'Wednesday', avg: 52000, total: 208000, recordings: 33 },
  { key: 'Thu', name: 'Thursday', avg: 40900, total: 163600, recordings: 22 },
  { key: 'Fri', name: 'Friday', avg: 47100, total: 188400, recordings: 31 },
  { key: 'Sat', name: 'Saturday', avg: 27900, total: 111600, recordings: 19 },
  { key: 'Sun', name: 'Sunday', avg: 22500, total: 90000, recordings: 15 },
];

const monthlyPatterns: MonthPattern[] = [
  { month: 'Jan', fullName: 'January', total: 248900 },
  { month: 'Feb', fullName: 'February', total: 275400 },
  { month: 'Mar', fullName: 'March', total: 266100 },
  { month: 'Apr', fullName: 'April', total: 318900 },
  { month: 'May', fullName: 'May', total: 304373 },
  { month: 'Jun', fullName: 'June', total: 342115 },
];

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabels = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'];
const heatmapCells: HeatCell[] = days.flatMap((day, dayIndex) =>
  Array.from({ length: 24 }).map((_, hour) => {
    const weekday = dayIndex < 5;
    const morningPeak = weekday && hour >= 9 && hour <= 12;
    const lunchPeak = weekday && hour >= 13 && hour <= 14;
    const evening = hour >= 18 && hour <= 20;
    const quiet = hour >= 1 && hour <= 5;
    const txns = morningPeak ? 6 + ((dayIndex + hour) % 5) : lunchPeak ? 3 + (dayIndex % 3) : evening ? 2 + (dayIndex % 4) : quiet ? 0 : (hour + dayIndex) % 3;
    return { day, hour, txns, avg: txns ? 2200 + txns * 420 : 0 };
  }),
);

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function PressScale({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(scale, { toValue: 0.96, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start()}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

function TopBar() {
  return (
    <View style={styles.topBar}>
      <PressScale>
        <View style={styles.avatarButton}><Text style={styles.avatarText}>C</Text></View>
      </PressScale>
      <Text style={styles.topBrand}>MONIKE</Text>
      <PressScale>
        <View style={styles.bellButton}>
          <Bell size={20} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
          <View style={styles.notificationDot} />
        </View>
      </PressScale>
    </View>
  );
}

function TabSelector({ activeTab, onChange }: { activeTab: PatternTab; onChange: (tab: PatternTab) => void }) {
  return (
    <View style={styles.tabSelector}>
      {tabs.map((tab) => {
        const active = tab === activeTab;
        return (
          <Pressable key={tab} style={styles.tabButton} onPress={() => onChange(tab)}>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab}</Text>
            <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function DayOfWeekTab() {
  const [selectedDay, setSelectedDay] = useState<DayPattern | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const maxAvg = Math.max(...dayPatterns.map((day) => day.avg));
  const minAvg = Math.min(...dayPatterns.map((day) => day.avg));
  const highest = dayPatterns.find((day) => day.avg === maxAvg)!;
  const lowest = dayPatterns.find((day) => day.avg === minAvg)!;
  const weekdayAvg = dayPatterns.slice(0, 5).reduce((sum, day) => sum + day.avg, 0) / 5;
  const weekendAvg = dayPatterns.slice(5).reduce((sum, day) => sum + day.avg, 0) / 2;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [anim]);

  return (
    <Animated.View style={styles.tabContent}>
      <SectionCard>
        <View style={styles.chartGridLayer}>
          {[0, 1, 2, 3].map((line) => (
            <View key={line} style={[styles.gridLine, { bottom: 28 + line * 38 }]}>
              <Text style={styles.gridLabel}>₦{formatNaira((maxAvg / 3) * line)}</Text>
              <View style={styles.dashedLine} />
            </View>
          ))}
        </View>
        <View style={styles.barChartRow}>
          {dayPatterns.map((day) => {
            const isHigh = day.avg === maxAvg;
            const isLow = day.avg === minAvg;
            const color = isHigh ? MonikeColors.signalRed : isLow ? MonikeColors.accentNeon : MonikeColors.accentPulse;
            return (
              <Pressable key={day.key} style={styles.dayBarWrap} onPress={() => setSelectedDay(day)}>
                <Text style={styles.barValue}>₦{formatNaira(day.avg)}</Text>
                <View style={styles.barSlot}>
                  {isHigh ? <Text style={styles.crownMarker}>👑</Text> : null}
                  <Animated.View
                    style={[
                      styles.dayBar,
                      {
                        backgroundColor: color,
                        height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, (day.avg / maxAvg) * 118] }),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.axisLabel}>{day.key}</Text>
              </Pressable>
            );
          })}
        </View>
        {selectedDay ? <DayTooltip day={selectedDay} /> : null}
      </SectionCard>
      <InsightCard
        title="📊 Pattern Insight"
        text={`Wednesdays are your most expensive day — you spend an average of ₦${formatNaira(highest.avg)} — ${(highest.avg / lowest.avg).toFixed(1)}× your cheapest day (${lowest.name} at ₦${formatNaira(lowest.avg)}). Watch out mid-week.`}
      />
      <View style={styles.statPairRow}>
        <RhythmStat label="WEEKDAYS" value={weekdayAvg} sub="Mon–Fri" />
        <RhythmStat label="WEEKENDS" value={weekendAvg} sub="Sat–Sun" badge={weekendAvg > weekdayAvg ? 'CAUTION ⚠' : 'SAVED ✓'} badgeTone={weekendAvg > weekdayAvg ? MonikeColors.signalAmber : MonikeColors.accentPulse} />
      </View>
    </Animated.View>
  );
}

function DayTooltip({ day }: { day: DayPattern }) {
  return (
    <View style={styles.tooltipCard}>
      <Text style={styles.tooltipTitle}>{day.name}</Text>
      <Text style={styles.tooltipValue}>Avg ₦{formatNaira(day.avg)}/day</Text>
      <Text style={styles.tooltipSub}>Total ₦{formatNaira(day.total)} ({day.recordings} recordings)</Text>
    </View>
  );
}

function InsightCard({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightText}>{text}</Text>
    </View>
  );
}

function RhythmStat({ badge, badgeTone, label, sub, value }: { badge?: string; badgeTone?: string; label: string; sub: string; value: number }) {
  return (
    <View style={styles.rhythmStatCard}>
      <View style={styles.statHeaderRow}>
        <Text style={styles.rhythmLabel}>{label}</Text>
        {badge ? <Text style={[styles.statBadge, { color: badgeTone, borderColor: badgeTone }]}>{badge}</Text> : null}
      </View>
      <Text style={styles.rhythmValue}>₦{formatNaira(value)}</Text>
      <Text style={styles.rhythmSub}>{sub}</Text>
    </View>
  );
}

function MonthlyTab() {
  const [selectedMonth, setSelectedMonth] = useState<MonthPattern | null>(null);
  const mean = monthlyPatterns.reduce((sum, month) => sum + month.total, 0) / monthlyPatterns.length;
  const max = Math.max(...monthlyPatterns.map((month) => month.total));
  const min = Math.min(...monthlyPatterns.map((month) => month.total));
  const points = monthlyPatterns.map((month, index) => {
    const x = 38 + index * 52;
    const y = 154 - ((month.total - min) / Math.max(max - min, 1)) * 116;
    return { ...month, x, y };
  });
  const path = smoothPath(points.map(({ x, y }) => ({ x, y })));
  const area = `38,164 ${points.map(({ x, y }) => `${x},${y}`).join(' ')} ${points.at(-1)?.x ?? 298},164`;

  return (
    <View style={styles.tabContent}>
      <SectionCard>
        <Svg width="100%" height={190} viewBox="0 0 340 190">
          <Defs>
            <LinearGradient id="monthlyArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={MonikeColors.accentPulse} stopOpacity="0.2" />
              <Stop offset="1" stopColor={MonikeColors.accentPulse} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {[0, 1, 2, 3].map((line) => {
            const y = 38 + line * 38;
            return <Line key={line} x1={36} x2={320} y1={y} y2={y} stroke={MonikeColors.inkGhost} strokeDasharray="4 6" strokeWidth={1} />;
          })}
          {[0, 1, 2, 3].map((line) => (
            <SvgText key={line} x={0} y={40 + line * 38} fill={MonikeColors.inkMuted} fontSize={9} fontFamily={Fonts.mono}>
              ₦{formatNaira(max - ((max - min) / 3) * line)}
            </SvgText>
          ))}
          <Polygon points={area} fill="url(#monthlyArea)" />
          <Path d={path} fill="none" stroke={MonikeColors.accentPulse} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const hot = point.total > mean * 1.12;
            return (
              <G key={point.month} onPress={() => setSelectedMonth(point)}>
                {hot ? <SvgText x={point.x - 3} y={point.y - 14} fill={MonikeColors.signalRed} fontSize={11} fontWeight="700">!</SvgText> : null}
                <Circle cx={point.x} cy={point.y} r={7} fill={hot ? MonikeColors.signalRed : MonikeColors.accentPulse} stroke={MonikeColors.bgVoid} strokeWidth={2} />
                <SvgText x={point.x - 10} y={180} fill={MonikeColors.inkMuted} fontSize={10} fontFamily={Fonts.mono}>{point.month}</SvgText>
                <Rect x={point.x - 18} y={point.y - 18} width={36} height={36} fill="transparent" />
              </G>
            );
          })}
        </Svg>
        {selectedMonth ? <MonthTooltip month={selectedMonth} /> : null}
      </SectionCard>
      <MonthlyTable mean={mean} />
    </View>
  );
}

function smoothPath(points: { x: number; y: number }[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = points[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `${path} Q ${prev.x} ${prev.y} ${midX} ${(prev.y + point.y) / 2} T ${point.x} ${point.y}`;
  }, '');
}

function MonthTooltip({ month }: { month: MonthPattern }) {
  const index = monthlyPatterns.findIndex((item) => item.month === month.month);
  const previous = monthlyPatterns[index - 1];
  const change = previous ? ((month.total - previous.total) / previous.total) * 100 : 0;
  return (
    <View style={styles.tooltipCard}>
      <Text style={styles.tooltipTitle}>{month.fullName}</Text>
      <Text style={styles.tooltipValue}>₦{formatNaira(month.total)}</Text>
      <Text style={styles.tooltipSub}>{previous ? `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs previous` : 'Baseline month'}</Text>
    </View>
  );
}

function MonthlyTable({ mean }: { mean: number }) {
  return (
    <View style={styles.monthlyTable}>
      {monthlyPatterns.map((month, index) => {
        const previous = monthlyPatterns[index - 1];
        const change = previous ? ((month.total - previous.total) / previous.total) * 100 : 0;
        const status: Status = month.total > mean * 1.08 ? 'HIGH' : month.total < mean * 0.92 ? 'LOW' : 'MEDIUM';
        return (
          <View key={month.month} style={[styles.monthRow, index % 2 === 1 && styles.monthRowStripe]}>
            <Text style={styles.monthCell}>{month.fullName}</Text>
            <Text style={styles.monthTotal}>₦{formatNaira(month.total)}</Text>
            <Text style={[styles.monthChange, { color: change > 0 ? MonikeColors.signalRed : MonikeColors.accentPulse }]}>{index === 0 ? '—' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`}</Text>
            <StatusBadge status={status} />
          </View>
        );
      })}
      <View style={styles.averageRow}>
        <Text style={[styles.monthCell, styles.averageText]}>AVERAGE</Text>
        <Text style={[styles.monthTotal, styles.averageText]}>₦{formatNaira(mean)}</Text>
        <Text style={styles.monthChange}>—</Text>
        <Text style={styles.averageText}>MEAN</Text>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const palette = {
    HIGH: MonikeColors.signalRed,
    MEDIUM: MonikeColors.signalAmber,
    LOW: MonikeColors.accentPulse,
  }[status];
  return <Text style={[styles.statusBadge, { color: palette, borderColor: palette }]}>{status}</Text>;
}

function TimeOfDayTab() {
  const { width } = useWindowDimensions();
  const [selectedCell, setSelectedCell] = useState<HeatCell | null>(null);
  const cellWidth = Math.max(8, (width - 60 - ScreenPadding * 2) / 24);
  const peakCell = heatmapCells.reduce((peak, cell) => (cell.txns > peak.txns ? cell : peak), heatmapCells[0]);
  const hourlyTotals = Array.from({ length: 24 }).map((_, hour) => heatmapCells.filter((cell) => cell.hour === hour).reduce((sum, cell) => sum + cell.txns, 0));
  const peakHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));

  return (
    <View style={styles.tabContent}>
      <SectionCard>
        <View style={styles.hourLabelsRow}>
          <View style={styles.dayAxisSpacer} />
          {hourLabels.map((label, index) => <Text key={label} style={[styles.hourLabel, { left: index * cellWidth * 3 }]}>{label}</Text>)}
        </View>
        {days.map((day, rowIndex) => (
          <HeatmapRow key={day} cellWidth={cellWidth} day={day} rowIndex={rowIndex} onSelect={setSelectedCell} />
        ))}
        {selectedCell ? <HeatTooltip cell={selectedCell} /> : null}
      </SectionCard>
      <InsightCard
        title="🫀 Pattern Insight"
        text={`You transact most around ${formatHour(peakCell.hour)} on ${peakCell.day}. Your quietest spending window is 1–5 AM, with Sunday evenings staying unusually calm.`}
      />
      <View style={styles.peakStripCard}>
        <Text style={[styles.peakLabel, { left: `${(peakHour / 24) * 100}%` }]}>peak: {formatHour(peakHour).toLowerCase()}</Text>
        <View style={styles.peakTimeline}>
          {hourlyTotals.map((total, hour) => (
            <View key={hour} style={[styles.peakSegment, { backgroundColor: peakColor(total) }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function HeatmapRow({ cellWidth, day, onSelect, rowIndex }: { cellWidth: number; day: string; onSelect: (cell: HeatCell) => void; rowIndex: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, delay: rowIndex * 40, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [opacity, rowIndex]);
  const cells = heatmapCells.filter((cell) => cell.day === day);

  return (
    <Animated.View style={[styles.heatRow, { opacity }]}>
      <Text style={styles.heatDayLabel}>{day}</Text>
      {cells.map((cell) => (
        <Pressable key={`${day}-${cell.hour}`} onPress={() => onSelect(cell)} style={[styles.heatCell, { width: cellWidth, backgroundColor: heatColor(cell.txns) }]} />
      ))}
    </Animated.View>
  );
}

function HeatTooltip({ cell }: { cell: HeatCell }) {
  return (
    <View style={styles.tooltipCard}>
      <Text style={styles.tooltipTitle}>{cell.day} {formatHour(cell.hour)}</Text>
      <Text style={styles.tooltipValue}>{cell.txns} transactions</Text>
      <Text style={styles.tooltipSub}>avg ₦{formatNaira(cell.avg)}/txn</Text>
    </View>
  );
}

function heatColor(txns: number) {
  if (txns === 0) return MonikeColors.bgOverlay;
  if (txns <= 2) return 'rgba(0,230,118,0.15)';
  if (txns <= 5) return 'rgba(0,230,118,0.40)';
  if (txns <= 9) return 'rgba(0,230,118,0.70)';
  return MonikeColors.accentPulse;
}

function peakColor(total: number) {
  if (total >= 34) return MonikeColors.accentPulse;
  if (total >= 18) return 'rgba(0,230,118,0.4)';
  return MonikeColors.bgElevated;
}

function formatHour(hour: number) {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export default function PatternsScreen() {
  const [activeTab, setActiveTab] = useState<PatternTab>('DAY OF WEEK');
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  const changeTab = (tab: PatternTab) => {
    if (tab === activeTab) return;
    Animated.timing(slide, { toValue: -18, duration: 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      slide.setValue(18);
      Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 24 }] }>
          <TopBar />
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>PATTERNS</Text>
            <Text style={styles.screenSubtitle}>Your spending rhythms</Text>
          </View>
          <TabSelector activeTab={activeTab} onChange={changeTab} />
          <Animated.View style={{ transform: [{ translateX: slide }] }}>
            {activeTab === 'DAY OF WEEK' ? <DayOfWeekTab /> : null}
            {activeTab === 'MONTHLY' ? <MonthlyTab /> : null}
            {activeTab === 'TIME OF DAY' ? <TimeOfDayTab /> : null}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="patterns" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, gap: 18 },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: MonikeColors.accentPulse, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '800' },
  topBrand: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  bellButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 9, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.signalRed },
  titleBlock: { alignItems: 'center', gap: 5 },
  screenTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', letterSpacing: 0.8 },
  screenSubtitle: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12 },
  tabSelector: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: MonikeColors.inkGhost },
  tabButton: { flex: 1, alignItems: 'center', paddingTop: 6 },
  tabLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '400' },
  tabLabelActive: { color: MonikeColors.inkPrimary, fontWeight: '600' },
  tabUnderline: { marginTop: 10, width: '100%', height: 2, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: MonikeColors.accentPulse },
  tabContent: { gap: 16 },
  sectionCard: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 14, overflow: 'hidden' },
  chartGridLayer: { position: 'absolute', left: 14, right: 14, top: 14, height: 160 },
  gridLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  gridLabel: { width: 42, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  dashedLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: MonikeColors.inkGhost },
  barChartRow: { height: 184, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 44, gap: 9 },
  dayBarWrap: { flex: 1, alignItems: 'center', gap: 5 },
  barValue: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 10 },
  barSlot: { height: 128, justifyContent: 'flex-end', alignItems: 'center' },
  dayBar: { width: 22, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  crownMarker: { color: MonikeColors.signalRed, fontFamily: Fonts.mono, fontSize: 9, marginBottom: 3 },
  axisLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  tooltipCard: { marginTop: 12, backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.accentPulse, borderRadius: 12, padding: 12 },
  tooltipTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  tooltipValue: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', marginTop: 5 },
  tooltipSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 12, marginTop: 3 },
  insightCard: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 14 },
  insightTitle: { color: MonikeColors.accentPulse, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
  insightText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 21, marginTop: 8 },
  statPairRow: { flexDirection: 'row', gap: 8 },
  rhythmStatCard: { flex: 1, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 13 },
  statHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 20 },
  rhythmLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  rhythmValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700', marginTop: 8 },
  rhythmSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },
  statBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontFamily: Fonts.mono, fontSize: 8, fontWeight: '700' },
  monthlyTable: { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.inkGhost, overflow: 'hidden' },
  monthRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: MonikeColors.bgSurface, paddingHorizontal: 12 },
  monthRowStripe: { backgroundColor: MonikeColors.bgStripe },
  monthCell: { flex: 1.1, color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13 },
  monthTotal: { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700' },
  monthChange: { flex: 0.9, color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 12 },
  statusBadge: { overflow: 'hidden', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },
  averageRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: MonikeColors.bgElevated, paddingHorizontal: 12 },
  averageText: { fontWeight: '800' },
  hourLabelsRow: { height: 18, marginLeft: 34, position: 'relative' },
  dayAxisSpacer: { width: 34 },
  hourLabel: { position: 'absolute', color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9 },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatDayLabel: { width: 34, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  heatCell: { height: 28, borderRadius: 2, marginRight: 1 },
  peakStripCard: { backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: CardRadius, padding: 14, paddingTop: 28 },
  peakLabel: { position: 'absolute', top: 9, color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 10 },
  peakTimeline: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  peakSegment: { flex: 1, height: 8, marginRight: 1 },
});

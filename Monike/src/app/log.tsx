import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Delete,
  FileSpreadsheet,
  Globe,
  PenLine,
  Phone,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Upload,
  Users,
  Utensils,
  Wifi,
  X,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { useRouter } from 'expo-router';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { useUploadStatement, type UploadProgress, type UploadDedup } from '@/hooks/use-upload-statement';
import { type UploadResult, postLog } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryKey =
  | 'person' | 'pos' | 'data' | 'airtime' | 'food'
  | 'online' | 'electricity' | 'other' | 'savings' | 'income';

type CategoryInput = {
  key: EntryKey;
  label: string;
  average: number;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
};

type EntryMode = 'manual' | 'upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_THRESHOLD = 5145.25;

function getToday() { return new Date(); }

const commonCategories: CategoryInput[] = [
  { key: 'person',  label: 'Person-to-Person', average: 2100, Icon: Users,       color: '#7B61FF' },
  { key: 'pos',     label: 'POS Purchase',      average: 3400, Icon: ShoppingBag, color: '#4FC3F7' },
  { key: 'data',    label: 'Data',              average: 1200, Icon: Wifi,        color: '#00E676' },
  { key: 'airtime', label: 'Airtime',           average: 850,  Icon: Phone,       color: '#FFB300' },
  { key: 'food',    label: 'Food & Dining',     average: 2850, Icon: Utensils,    color: '#EF5350' },
  { key: 'online',  label: 'Online Payment',    average: 4250, Icon: Globe,       color: '#FF7043' },
  { key: 'electricity', label: 'Electricity',   average: 5100, Icon: Zap,         color: '#FFD54F' },
  { key: 'other',   label: 'Other',             average: 1500, Icon: CreditCard,  color: '#78909C' },
];

const SAVINGS_CAT: CategoryInput = {
  key: 'savings', label: 'Savings', average: 0, Icon: TrendingUp, color: '#4FC3F7',
};
const INCOME_CAT: CategoryInput = {
  key: 'income', label: 'Money Received', average: 0, Icon: Banknote, color: '#00E676',
};

const allSpendKeys: EntryKey[] = commonCategories.map((c) => c.key).concat('savings');

const fmtWeekday  = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const fmtDayMonth = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')) || 0;
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }

function addDays(date: Date, n: number) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function formatDateLabel(date: Date) {
  const prefix = dateKey(date) === dateKey(getToday()) ? 'Today · ' : '';
  return `${prefix}${fmtWeekday.format(date)}, ${fmtDayMonth.format(date)}`;
}

function spendPalette(total: number) {
  const r = total / DAILY_THRESHOLD;
  if (total <= 0) return { color: MonikeColors.inkSecondary, dangerTint: false, high: false, pulsing: false };
  if (r < 0.7)   return { color: MonikeColors.accentPulse,  dangerTint: false, high: false, pulsing: false };
  if (r < 0.9)   return { color: MonikeColors.signalAmber,  dangerTint: false, high: false, pulsing: false };
  if (r < 1)     return { color: MonikeColors.signalRed,    dangerTint: false, high: true,  pulsing: true  };
  return               { color: MonikeColors.signalRed,    dangerTint: true,  high: true,  pulsing: false };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const insets      = useSafeAreaInsets();
  const scrollRef   = useRef<ScrollView>(null);
  const router = useRouter();

  const totalPulse     = useRef(new Animated.Value(1)).current;
  const dangerPulse    = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(320)).current;
  const successIcon    = useRef(new Animated.Value(0)).current;
  const warningShake   = useRef(new Animated.Value(0)).current;
  const modeSwitchAnim = useRef(new Animated.Value(0)).current;

  const [selectedDate,    setSelectedDate]    = useState(() => getToday());
  const [datePickerOpen,  setDatePickerOpen]  = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [successVisible,  setSuccessVisible]  = useState(false);
  const [entryMode,       setEntryMode]       = useState<EntryMode>('manual');
  const [activeCategory,  setActiveCategory]  = useState<CategoryInput | null>(null);
  const [sheetVisible,    setSheetVisible]    = useState(false);

  const { uploadState, pickAndUpload, reset: resetUpload } = useUploadStatement();

  const [values, setValues] = useState<Record<EntryKey, string>>({
    person: '', pos: '', data: '', airtime: '', food: '',
    online: '', electricity: '', other: '', savings: '', income: '',
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const spendTotal = useMemo(
    () => allSpendKeys.reduce((s, k) => s + parseAmount(values[k] ?? ''), 0),
    [values],
  );
  const enteredCategories = useMemo(
    () => allSpendKeys.filter((k) => parseAmount(values[k] ?? '') > 0).length,
    [values],
  );
  const palette  = spendPalette(spendTotal);
  const progress = Math.min(100, (spendTotal / DAILY_THRESHOLD) * 100);
  const hasData  = spendTotal > 0 || parseAmount(values.income) > 0 || uploadState.status === 'success';

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    totalPulse.setValue(0.95);
    Animated.spring(totalPulse, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start();
  }, [spendTotal, totalPulse]);

  useEffect(() => {
    if (!palette.pulsing) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dangerPulse, { toValue: 0.5, duration: 540, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(dangerPulse, { toValue: 1,   duration: 540, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [dangerPulse, palette.pulsing]);

  useEffect(() => {
    if (!successVisible) return;
    sheetTranslate.setValue(320);
    successIcon.setValue(0);
    warningShake.setValue(0);
    Animated.parallel([
      Animated.timing(sheetTranslate, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(successIcon,    { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      palette.high
        ? Animated.sequence([
            Animated.timing(warningShake, { toValue:  1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue: -1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue:  1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue:  0, duration: 70, useNativeDriver: true }),
          ])
        : Animated.timing(warningShake, { toValue: 0, duration: 1, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(dismissSuccess, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successVisible]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateValue = useCallback((key: EntryKey, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'),
    }));
  }, []);

  const moveDay = useCallback((n: number) => {
    setSelectedDate((prev) => {
      const next = addDays(prev, n);
      return dateKey(next) > dateKey(getToday()) ? prev : next;
    });
  }, []);

  const switchMode = useCallback((mode: EntryMode) => {
    setEntryMode(mode);
    Animated.timing(modeSwitchAnim, {
      toValue: mode === 'manual' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [modeSwitchAnim]);

  const openSheet = useCallback((cat: CategoryInput) => {
    setActiveCategory(cat);
    setSheetVisible(true);
  }, []);

  const saveEntry = useCallback(async () => {
    if (!hasData || saving) return;
    setSaving(true);
    try {
      await postLog({
        date: dateKey(selectedDate),
        p2p_spend:           parseAmount(values.person),
        pos_spend:           parseAmount(values.pos),
        data_spend:          parseAmount(values.data),
        airtime_spend:       parseAmount(values.airtime),
        food_spend:          parseAmount(values.food),
        online_spend:        parseAmount(values.online),
        family_spend:        0,
        electricity_spend:   parseAmount(values.electricity),
        subscription_spend:  0,
        loan_spend:          0,
        other_spend:         parseAmount(values.other),
        savings_out:         parseAmount(values.savings),
        total_credit:        parseAmount(values.income),
      });
      setSuccessVisible(true);
    } catch (e) {
      console.error('[saveEntry]', e);
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [hasData, saving, selectedDate, values]);

  const clearForm = useCallback(() => {
    setValues({ person: '', pos: '', data: '', airtime: '', food: '', online: '', electricity: '', other: '', savings: '', income: '' });
    resetUpload();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetUpload]);

  const dismissSuccess = useCallback(() => {
    Animated.timing(sheetTranslate, { toValue: 320, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => { setSuccessVisible(false); clearForm(); });
  }, [clearForm, sheetTranslate]);

  const pillLeft = modeSwitchAnim.interpolate({ inputRange: [0, 1], outputRange: ['2%', '50%'] });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>

        <MonikeHeader title="Log Spend" subtitle="Daily spend tracker" />
        <View style={s.dateRow}>
            <Pressable style={s.dateArrow} onPress={() => moveDay(-1)}>
              <ChevronLeft size={18} color={MonikeColors.inkSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable style={s.datePill} onPress={() => setDatePickerOpen(true)}>
              <Text style={s.dateText}>{formatDateLabel(selectedDate)}</Text>
              <ChevronDown size={12} color={MonikeColors.inkMuted} style={{ marginLeft: 4 }} />
            </Pressable>
            <Pressable
              style={s.dateArrow}
              disabled={dateKey(selectedDate) === dateKey(getToday())}
              onPress={() => moveDay(1)}
            >
              <ChevronRight
                size={18}
                color={dateKey(selectedDate) === dateKey(getToday()) ? MonikeColors.inkGhost : MonikeColors.inkSecondary}
                strokeWidth={2.2}
              />
            </Pressable>
        </View>

        {/* Spend summary card */}
        <View style={[s.totalCard, palette.dangerTint && s.totalCardDanger]}>
          <View style={s.totalLeft}>
            <Text style={s.totalLabel}>TOTAL SPEND</Text>
            <Animated.Text style={[s.totalValue, { color: palette.color, opacity: palette.pulsing ? dangerPulse : 1, transform: [{ scale: totalPulse }] }]}>
              ₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}
            </Animated.Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` as `${number}%`, backgroundColor: palette.color }]} />
            </View>
          </View>
          <View style={s.totalRight}>
            <View style={[s.limitBadge, { borderColor: palette.color + '44' }]}>
              <Text style={[s.limitBadgeText, { color: palette.color }]}>{Math.round(progress)}%</Text>
            </View>
            <Text style={s.limitText}>of ₦{formatNaira(DAILY_THRESHOLD)}</Text>
            <Text style={s.categoryCount}>{enteredCategories} {enteredCategories === 1 ? 'category' : 'categories'}</Text>
          </View>
        </View>

        {/* Mode toggle */}
        <View style={s.modeToggleWrap}>
          <View style={s.modeToggle}>
            <Animated.View style={[s.modePill, { left: pillLeft }]} />
            <TouchableOpacity activeOpacity={0.8} style={s.modeTab} onPress={() => switchMode('manual')}>
              <PenLine size={14} color={entryMode === 'manual' ? '#FFFFFF' : MonikeColors.inkMuted} strokeWidth={2} />
              <Text style={[s.modeTabText, entryMode === 'manual' && s.modeTabTextActive]}>Manual Entry</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} style={s.modeTab} onPress={() => switchMode('upload')}>
              <FileSpreadsheet size={14} color={entryMode === 'upload' ? '#FFFFFF' : MonikeColors.inkMuted} strokeWidth={2} />
              <Text style={[s.modeTabText, entryMode === 'upload' && s.modeTabTextActive]}>Upload XLSX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + BottomTabInset + 100 }]}
        >
          {entryMode === 'manual' ? (
            <>
              {/* Category grid */}
              <Text style={s.gridLabel}>Spending</Text>
              <CategoryGrid
                categories={commonCategories}
                values={values}
                onSelect={openSheet}
              />

              {/* Savings + Income tiles */}
              <Text style={s.gridLabel}>Savings & Income</Text>
              <View style={s.specialRow}>
                <CategoryTile
                  category={SAVINGS_CAT}
                  value={values.savings}
                  onPress={() => openSheet(SAVINGS_CAT)}
                  flex
                />
                <CategoryTile
                  category={INCOME_CAT}
                  value={values.income}
                  onPress={() => openSheet(INCOME_CAT)}
                  flex
                />
              </View>
            </>
          ) : (
            <UploadPanel
              uploadState={uploadState}
              onUpload={pickAndUpload}
              onReset={resetUpload}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Save button */}
      <View style={[s.saveDock, { bottom: insets.bottom + 68 + 14 }]}>
        <Pressable
          disabled={!hasData || saving}
          style={[s.saveButton, !hasData && s.saveButtonEmpty, hasData && palette.high && s.saveButtonHigh]}
          onPress={saveEntry}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={s.saveButtonInner}>
              <Text style={[s.saveText, !hasData && s.saveTextMuted]}>Save Entry</Text>
              {hasData && spendTotal > 0 && (
                <View style={s.saveBadge}>
                  <Text style={s.saveBadgeText}>₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>
      </View>

      <BottomNavigation activeRoute="log" />

      <DatePickerModal
        visible={datePickerOpen}
        selectedDate={selectedDate}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(d) => { setSelectedDate(d); setDatePickerOpen(false); }}
      />

      <AmountBottomSheet
        category={activeCategory}
        visible={sheetVisible}
        initialValue={activeCategory ? (values[activeCategory.key] ?? '') : ''}
        onClose={() => setSheetVisible(false)}
        onConfirm={(key, value) => { updateValue(key, value); setSheetVisible(false); }}
      />

      <SuccessSheet
        high={palette.high}
        total={spendTotal}
        translateY={sheetTranslate}
        iconProgress={successIcon}
        warningShake={warningShake}
        onDismiss={dismissSuccess}
        visible={successVisible}
      />
    </View>
  );
}

// ─── CategoryGrid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  categories,
  values,
  onSelect,
}: {
  categories: CategoryInput[];
  values: Record<EntryKey, string>;
  onSelect: (cat: CategoryInput) => void;
}) {
  const rows: CategoryInput[][] = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(categories.slice(i, i + 2));
  }
  return (
    <View style={s.grid}>
      {rows.map((pair, i) => (
        <View key={i} style={s.gridRow}>
          {pair.map((cat) => (
            <CategoryTile
              key={cat.key}
              category={cat}
              value={values[cat.key]}
              onPress={() => onSelect(cat)}
              flex
            />
          ))}
          {pair.length < 2 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

// ─── CategoryTile ─────────────────────────────────────────────────────────────

function CategoryTile({
  category,
  value,
  onPress,
  flex,
}: {
  category: CategoryInput;
  value: string;
  onPress: () => void;
  flex?: boolean;
}) {
  const entered = parseAmount(value) > 0;
  const Icon = category.Icon;
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.timing(scale, { toValue: 0.95, duration: 60, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale,  { toValue: 1, speed: 22, bounciness: 6, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={flex ? { flex: 1 } : undefined}
    >
      <Animated.View
        style={[
          s.tile,
          flex && s.tileFlex,
          entered && { borderColor: category.color + '55', backgroundColor: category.color + '0C' },
          { transform: [{ scale }] },
        ]}
      >
        <View style={[s.tileIcon, { backgroundColor: entered ? category.color + '25' : MonikeColors.bgElevated }]}>
          <Icon size={20} color={entered ? category.color : MonikeColors.inkMuted} strokeWidth={1.9} />
        </View>
        <Text style={[s.tileName, entered && { color: MonikeColors.inkPrimary }]} numberOfLines={2}>
          {category.label}
        </Text>
        {entered ? (
          <Text style={[s.tileAmount, { color: category.color }]}>
            ₦{formatNaira(parseAmount(value))}
          </Text>
        ) : (
          <Text style={s.tilePlaceholder}>Tap to add</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── AmountBottomSheet ────────────────────────────────────────────────────────

const PAD_KEYS = [['7','8','9'],['4','5','6'],['1','2','3'],['.','0','⌫']];

function AmountBottomSheet({
  category,
  visible,
  initialValue,
  onClose,
  onConfirm,
}: {
  category: CategoryInput | null;
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onConfirm: (key: EntryKey, value: string) => void;
}) {
  const [display, setDisplay] = useState('');
  const sheetY  = useRef(new Animated.Value(600)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets  = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setDisplay(initialValue || '');
      sheetY.setValue(600);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(sheetY,  { toValue: 0, speed: 16, bounciness: 3, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetY,  { toValue: 600, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleKey = useCallback((key: string) => {
    setDisplay((prev) => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === '.' && prev.includes('.')) return prev;
      if (key === '.' && prev === '') return '0.';
      if (prev.includes('.') && (prev.split('.')[1]?.length ?? 0) >= 2) return prev;
      if (prev === '0' && key !== '.') return key;
      return prev + key;
    });
  }, []);

  if (!category) return null;

  const Icon   = category.Icon;
  const amount = parseAmount(display);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.sheetScrim} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, s.sheetBackdrop, { opacity }]} />
      </Pressable>

      <Animated.View style={[s.amountSheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetY }] }]}>
        <View style={s.sheetHandle} />

        {/* Category header */}
        <View style={s.sheetCatRow}>
          <View style={[s.sheetCatIcon, { backgroundColor: category.color + '25' }]}>
            <Icon size={20} color={category.color} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sheetCatName}>{category.label}</Text>
            {category.average > 0 && (
              <Text style={s.sheetCatAvg}>avg ₦{formatNaira(category.average)} / day</Text>
            )}
          </View>
          <Pressable style={s.sheetCloseBtn} onPress={onClose} hitSlop={12}>
            <X size={15} color={MonikeColors.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Amount display */}
        <View style={s.sheetAmountRow}>
          <Text style={s.sheetCurrency}>₦</Text>
          <Text style={[s.sheetAmount, { color: amount > 0 ? category.color : MonikeColors.inkGhost }]}>
            {display || '0'}
          </Text>
        </View>

        {/* Numpad */}
        <View style={s.numpad}>
          {PAD_KEYS.map((row, ri) => (
            <View key={ri} style={s.numpadRow}>
              {row.map((key) => (
                <Pressable
                  key={key}
                  style={({ pressed }) => [s.numKey, pressed && s.numKeyPressed]}
                  onPress={() => handleKey(key)}
                >
                  {key === '⌫' ? (
                    <Delete size={20} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
                  ) : (
                    <Text style={s.numKeyText}>{key}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        {/* Confirm */}
        <Pressable
          style={[s.sheetConfirm, { backgroundColor: amount > 0 ? category.color : MonikeColors.bgElevated }]}
          onPress={() => onConfirm(category.key, display)}
        >
          <Text style={[s.sheetConfirmText, amount === 0 && { color: MonikeColors.inkMuted }]}>
            {amount > 0 ? `Confirm  ₦${formatNaira(amount)}` : 'Skip'}
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ─── UploadPanel ──────────────────────────────────────────────────────────────

function UploadPanel({
  uploadState,
  onUpload,
  onReset,
}: {
  uploadState: ReturnType<typeof useUploadStatement>['uploadState'];
  onUpload: () => void;
  onReset: () => void;
}) {
  return (
    <View style={s.uploadWrap}>
      {uploadState.status === 'idle' && <DropZone onPress={onUpload} />}

      {uploadState.status === 'picking' && (
        <View style={s.statusCard}>
          <ActivityIndicator color={MonikeColors.accentOrange} size="small" />
          <Text style={s.statusText}>Opening file picker…</Text>
        </View>
      )}

      {uploadState.status === 'uploading' && (
        <View style={s.statusCard}>
          <ActivityIndicator color={MonikeColors.accentOrange} />
          <View style={s.statusCopy}>
            <Text style={s.statusText}>Uploading</Text>
            <Text style={s.statusSub}>{uploadState.filename}</Text>
          </View>
        </View>
      )}

      {uploadState.status === 'processing' && (
        <ProcessingCard
          filename={uploadState.filename}
          total={uploadState.total}
          dedup={uploadState.dedup}
          progress={uploadState.progress}
        />
      )}

      {uploadState.status === 'error' && (
        <View style={[s.statusCard, s.statusCardError]}>
          <AlertCircle size={22} color={MonikeColors.signalRed} strokeWidth={2} />
          <View style={s.statusCopy}>
            <Text style={[s.statusText, { color: MonikeColors.signalRed }]}>Upload failed</Text>
            <Text style={s.statusSub}>{uploadState.message}</Text>
          </View>
          <Pressable style={s.retryButton} onPress={onUpload} hitSlop={12}>
            <RefreshCw size={15} color={MonikeColors.inkSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      {uploadState.status === 'success' && (
        <UploadSuccessCard
          result={uploadState.result}
          filename={uploadState.filename}
          onReset={onReset}
        />
      )}

      {uploadState.status !== 'success' && uploadState.status !== 'processing' && <UploadFormatHint />}
    </View>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────

function DropZone({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={s.dropZone} onPress={onPress}>
      <View style={s.uploadIconRing}>
        <Upload size={28} color={MonikeColors.accentOrange} strokeWidth={1.8} />
      </View>
      <Text style={s.dropZoneTitle}>Drop your statement here</Text>
      <Text style={s.dropZoneSub}>or tap to browse files</Text>
      <View style={s.formatBadge}>
        <FileSpreadsheet size={11} color={MonikeColors.signalBlue} />
        <Text style={s.formatBadgeText}>.xlsx · .xls · .csv</Text>
      </View>
    </Pressable>
  );
}

// ─── ProcessingCard ───────────────────────────────────────────────────────────

function ProcessingCard({ filename, total, dedup, progress }: {
  filename: string; total: number; dedup: UploadDedup | null; progress: UploadProgress | null;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: progress?.pct ?? 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [barAnim, progress?.pct]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const phaseLabel =
    !progress              ? 'Analyzing file…'
    : progress.phase === 'transactions' ? `Importing transactions (${progress.done} / ${progress.total})`
    : `Rebuilding daily totals (${progress.done} / ${progress.total})`;

  return (
    <View style={s.processingCard}>
      <View style={s.processingHeader}>
        <ActivityIndicator size="small" color={MonikeColors.accentOrange} />
        <View style={s.processingHeaderCopy}>
          <Text style={s.processingTitle}>Processing statement</Text>
          <Text style={s.processingFilename} numberOfLines={1}>{filename}</Text>
        </View>
        {total > 0 && (
          <View style={s.processingBadge}>
            <Text style={s.processingBadgeText}>{total} rows</Text>
          </View>
        )}
      </View>
      <View style={s.processingTrack}>
        <Animated.View style={[s.processingFill, { width: barWidth }]} />
      </View>
      <Text style={s.processingPhase}>{phaseLabel}</Text>
      {dedup !== null && (
        <View style={s.dedupRow}>
          <View style={s.dedupChip}>
            <Check size={11} color={MonikeColors.accentPulse} strokeWidth={2.5} />
            <Text style={s.dedupChipText}>{dedup.kept} new</Text>
          </View>
          {dedup.skipped > 0 && (
            <View style={[s.dedupChip, s.dedupChipMuted]}>
              <Text style={s.dedupChipTextMuted}>{dedup.skipped} duplicate{dedup.skipped !== 1 ? 's' : ''} skipped</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── UploadSuccessCard ────────────────────────────────────────────────────────

function UploadSuccessCard({ filename, onReset, result }: {
  filename: string; onReset: () => void; result: UploadResult;
}) {
  const stats: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Transactions in file',  value: String(result.total_rows_in_file) },
    { label: 'New days added',        value: String(result.new_days_inserted),               accent: true },
    { label: 'Days updated',          value: String(result.days_updated) },
    { label: 'Duplicates skipped',    value: String(result.duplicate_transactions_skipped) },
    { label: 'High-spend days found', value: String(result.high_spend_days_detected), accent: result.high_spend_days_detected > 0 },
  ];
  return (
    <View style={s.uploadSuccessCard}>
      <View style={s.uploadSuccessHeader}>
        <View style={s.uploadSuccessIconWrap}>
          <CheckCircle size={20} color={MonikeColors.accentPulse} strokeWidth={2} />
        </View>
        <View style={s.uploadSuccessHeaderCopy}>
          <Text style={s.uploadSuccessTitle}>Statement imported</Text>
          <Text style={s.uploadSuccessFilename} numberOfLines={1}>{filename}</Text>
        </View>
        <Pressable style={s.uploadResetButton} onPress={onReset} hitSlop={12}>
          <X size={15} color={MonikeColors.inkMuted} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={s.uploadDateRange}>{result.date_range_start}  →  {result.date_range_end}</Text>
      <View style={s.uploadStatsGrid}>
        {stats.map(({ label, value, accent }) => (
          <View key={label} style={s.uploadStatItem}>
            <Text style={[s.uploadStatValue, accent && s.uploadStatValueAccent]}>{value}</Text>
            <Text style={s.uploadStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── UploadFormatHint ─────────────────────────────────────────────────────────

function UploadFormatHint() {
  return (
    <View style={s.uploadHintCard}>
      <Text style={s.uploadHintTitle}>EXPECTED FORMAT</Text>
      <View style={s.uploadHintRow}>
        <View style={s.uploadHintCol}>
          <Text style={s.uploadHintCell}>Trans_Date</Text>
          <Text style={s.uploadHintCell}>Description</Text>
          <Text style={s.uploadHintCell}>Debit</Text>
          <Text style={s.uploadHintCell}>Credit</Text>
        </View>
        <View style={[s.uploadHintCol, { flex: 1.4 }]}>
          <Text style={s.uploadHintVal}>2026-06-05 10:23</Text>
          <Text style={s.uploadHintVal}>Transfer to JOHN…</Text>
          <Text style={s.uploadHintVal}>3400.00</Text>
          <Text style={s.uploadHintVal}>0.00</Text>
        </View>
      </View>
      <Text style={s.uploadHintNote}>
        OPay / Zenith statements supported. First 7 metadata rows are skipped automatically.
      </Text>
    </View>
  );
}

// ─── DatePickerModal ──────────────────────────────────────────────────────────

function DatePickerModal({ onClose, onSelect, selectedDate, visible }: {
  onClose: () => void; onSelect: (d: Date) => void;
  selectedDate: Date; visible: boolean;
}) {
  const today = useMemo(() => getToday(), []);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).reverse();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalScrim} onPress={onClose}>
        <View style={s.calendarCard}>
          <Text style={s.calendarTitle}>SELECT DATE</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {dates.map((date) => {
              const selected = dateKey(date) === dateKey(selectedDate);
              return (
                <Pressable key={dateKey(date)} style={[s.dateOption, selected && s.dateOptionSelected]} onPress={() => onSelect(date)}>
                  {selected && <View style={s.dateOptionDot} />}
                  <Text style={[s.dateOptionText, selected && s.dateOptionTextSelected]}>{formatDateLabel(date)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── SuccessSheet ─────────────────────────────────────────────────────────────

function SuccessSheet({ high, iconProgress, onDismiss, total, translateY, visible, warningShake }: {
  high: boolean; iconProgress: Animated.Value; onDismiss: () => void;
  total: number; translateY: Animated.Value; visible: boolean; warningShake: Animated.Value;
}) {
  const iconColor = high ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const shakeX    = warningShake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] });
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={s.successScrim} onPress={onDismiss}>
        <Animated.View style={[s.successSheet, { transform: [{ translateY }] }]}>
          <View style={s.handle} />
          <Animated.View style={{ opacity: iconProgress, transform: [{ scale: iconProgress }, { translateX: high ? shakeX : 0 }] }}>
            {high ? <AlertTriangle size={42} color={iconColor} strokeWidth={1.9} /> : <Check size={42} color={iconColor} strokeWidth={2.4} />}
          </Animated.View>
          <Text style={[s.successTitle, { color: iconColor }]}>{high ? 'HIGH SPEND DAY' : 'ENTRY SAVED'}</Text>
          <Text style={s.successBody}>
            {high
              ? `₦${formatNaira(total, total % 1 ? 2 : 0)} logged — above your ₦${formatNaira(DAILY_THRESHOLD, 2)} daily threshold.`
              : `₦${formatNaira(total, total % 1 ? 2 : 0)} logged for today. You're on track.`}
          </Text>
          {high && (
            <View style={s.tipCard}>
              <Text style={s.tipLabel}>TIP</Text>
              <Text style={s.tipText}>Review Food & Dining and POS purchases first — they usually move the needle fastest.</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1, backgroundColor: MonikeColors.bgVoid },

  // ── Date row ──────────────────────────────────────────────────────────────
  dateRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: ScreenPadding, paddingVertical: 10, backgroundColor: MonikeColors.bgElevated, borderBottomWidth: 1, borderBottomColor: MonikeColors.inkGhost },
  dateArrow:     { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  datePill:      { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  dateText:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },

  // ── Total card ────────────────────────────────────────────────────────────
  totalCard:      { marginHorizontal: ScreenPadding, borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  totalCardDanger:{ backgroundColor: '#1E0E0F', borderColor: '#FF3D3D44' },
  totalLeft:      { flex: 1 },
  totalLabel:     { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginBottom: 4 },
  totalValue:     { fontFamily: Fonts.mono, fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  progressTrack:  { height: 5, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden', marginTop: 10 },
  progressFill:   { height: '100%', borderRadius: 999 },
  totalRight:     { alignItems: 'flex-end', gap: 4 },
  limitBadge:     { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  limitBadgeText: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  limitText:      { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  categoryCount:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // ── Mode toggle ───────────────────────────────────────────────────────────
  modeToggleWrap: { paddingHorizontal: ScreenPadding, marginBottom: 4 },
  modeToggle:     { height: 46, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', position: 'relative', overflow: 'hidden' },
  modePill:       { position: 'absolute', top: 4, bottom: 4, width: '48%', borderRadius: 10, backgroundColor: MonikeColors.accentOrange },
  modeTab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 1 },
  modeTabText:        { color: MonikeColors.inkMuted, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600' },
  modeTabTextActive:  { color: '#FFFFFF' },

  // ── Scroll content ────────────────────────────────────────────────────────
  content: { paddingHorizontal: ScreenPadding, paddingTop: 12, gap: 8 },

  // ── Category grid ─────────────────────────────────────────────────────────
  gridLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, marginBottom: 4 },
  grid:      { gap: 10 },
  gridRow:   { flexDirection: 'row', gap: 10 },
  specialRow:{ flexDirection: 'row', gap: 10, marginBottom: 8 },

  tile: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  tileFlex: { flex: 1 },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  tileAmount: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  tilePlaceholder: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },

  // ── Amount bottom sheet ───────────────────────────────────────────────────
  sheetScrim:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetBackdrop:{ backgroundColor: 'rgba(0,0,0,0.72)' },
  amountSheet:  {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: MonikeColors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: ScreenPadding,
    paddingTop: 10,
  },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: MonikeColors.inkGhost, alignSelf: 'center', marginBottom: 20 },
  sheetCatRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetCatIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCatName: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  sheetCatAvg:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  sheetCloseBtn:{ width: 34, height: 34, borderRadius: 10, backgroundColor: MonikeColors.bgSurface, alignItems: 'center', justifyContent: 'center' },

  sheetAmountRow:{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 12, gap: 3 },
  sheetCurrency: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 28, fontWeight: '700', marginBottom: 10 },
  sheetAmount:   { fontFamily: Fonts.mono, fontSize: 52, fontWeight: '800', letterSpacing: -2, lineHeight: 62 },

  numpad:      { gap: 8, marginVertical: 12 },
  numpadRow:   { flexDirection: 'row', gap: 8 },
  numKey:      { flex: 1, height: 58, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: MonikeColors.inkGhost },
  numKeyPressed:{ backgroundColor: MonikeColors.bgOverlay },
  numKeyText:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '600' },

  sheetConfirm:     { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sheetConfirmText: { color: '#FFFFFF', fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },

  // ── Save dock ─────────────────────────────────────────────────────────────
  saveDock:        { position: 'absolute', left: ScreenPadding, right: ScreenPadding, zIndex: 20 },
  saveButton:      { height: 56, borderRadius: 16, backgroundColor: MonikeColors.accentOrange, alignItems: 'center', justifyContent: 'center' },
  saveButtonHigh:  { backgroundColor: MonikeColors.signalRed },
  saveButtonEmpty: { backgroundColor: MonikeColors.bgElevated },
  saveButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveText:        { color: '#FFFFFF', fontFamily: Fonts.heading, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  saveTextMuted:   { color: MonikeColors.inkMuted },
  saveBadge:       { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  saveBadgeText:   { color: 'rgba(255,255,255,0.9)', fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },

  // ── Upload ────────────────────────────────────────────────────────────────
  uploadWrap:     { gap: 14, paddingTop: 6 },
  dropZone:       { borderRadius: 18, borderWidth: 1.5, borderColor: MonikeColors.accentOrange + '55', borderStyle: 'dashed', backgroundColor: MonikeColors.accentOrange + '07', padding: 36, alignItems: 'center', gap: 8 },
  uploadIconRing: { width: 68, height: 68, borderRadius: 34, backgroundColor: MonikeColors.accentOrange + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  dropZoneTitle:  { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  dropZoneSub:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13 },
  formatBadge:    { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: MonikeColors.signalBlue + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  formatBadgeText:{ color: MonikeColors.signalBlue, fontFamily: Fonts.mono, fontSize: 10 },

  statusCard:      { borderRadius: 14, borderWidth: 1, borderColor: MonikeColors.inkGhost, backgroundColor: MonikeColors.bgSurface, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72 },
  statusCardError: { borderColor: MonikeColors.signalRed + '55', backgroundColor: '#1E0B0B' },
  statusCopy:      { flex: 1, gap: 3 },
  statusText:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },
  statusSub:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
  retryButton:     { width: 34, height: 34, borderRadius: 9, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },

  processingCard:       { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.accentOrange + '44', backgroundColor: MonikeColors.bgSurface, padding: 16, gap: 12 },
  processingHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processingHeaderCopy: { flex: 1 },
  processingTitle:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  processingFilename:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  processingBadge:      { backgroundColor: MonikeColors.bgElevated, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  processingBadgeText:  { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  processingTrack:      { height: 6, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  processingFill:       { height: '100%', borderRadius: 999, backgroundColor: MonikeColors.accentOrange },
  processingPhase:      { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
  dedupRow:             { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dedupChip:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: MonikeColors.accentPulse + '18', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  dedupChipText:        { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700' },
  dedupChipMuted:       { backgroundColor: MonikeColors.bgElevated },
  dedupChipTextMuted:   { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },

  uploadSuccessCard:       { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.accentPulse + '44', backgroundColor: MonikeColors.accentPulse + '08', padding: 16, gap: 12 },
  uploadSuccessHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadSuccessIconWrap:   { width: 40, height: 40, borderRadius: 12, backgroundColor: MonikeColors.accentPulse + '18', alignItems: 'center', justifyContent: 'center' },
  uploadSuccessHeaderCopy: { flex: 1 },
  uploadSuccessTitle:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  uploadSuccessFilename:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  uploadResetButton:       { width: 30, height: 30, borderRadius: 8, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  uploadDateRange:         { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.4 },
  uploadStatsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  uploadStatItem:          { minWidth: '45%', flex: 1, backgroundColor: MonikeColors.bgSurface, borderRadius: 10, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 10, gap: 3 },
  uploadStatValue:         { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700' },
  uploadStatValueAccent:   { color: MonikeColors.accentPulse },
  uploadStatLabel:         { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, lineHeight: 14 },
  uploadHintCard:          { borderRadius: 14, borderWidth: 1, borderColor: MonikeColors.inkGhost, backgroundColor: MonikeColors.bgSurface, padding: 14, gap: 10 },
  uploadHintTitle:         { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3 },
  uploadHintRow:           { flexDirection: 'row', gap: 12 },
  uploadHintCol:           { gap: 6 },
  uploadHintCell:          { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' },
  uploadHintVal:           { color: MonikeColors.accentOrange, fontFamily: Fonts.mono, fontSize: 11 },
  uploadHintNote:          { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 4 },

  // ── Date picker ───────────────────────────────────────────────────────────
  modalScrim:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  calendarCard:           { width: '100%', maxWidth: 360, maxHeight: 460, borderRadius: 20, backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  calendarTitle:          { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4, marginBottom: 12 },
  dateOption:             { minHeight: 46, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateOptionSelected:     { backgroundColor: MonikeColors.accentOrange + '18' },
  dateOptionDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.accentOrange },
  dateOptionText:         { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  dateOptionTextSelected: { color: MonikeColors.accentOrange, fontWeight: '700' },

  // ── Success sheet ─────────────────────────────────────────────────────────
  successScrim:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  successSheet:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: MonikeColors.bgOverlay, alignItems: 'center', paddingHorizontal: 26, paddingTop: 14, paddingBottom: 40, borderTopWidth: 1, borderColor: MonikeColors.inkGhost },
  handle:        { width: 40, height: 4, borderRadius: 999, backgroundColor: MonikeColors.inkGhost, marginBottom: 28 },
  successTitle:  { fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', marginTop: 16, letterSpacing: 0.8 },
  successBody:   { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  tipCard:       { marginTop: 18, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.signalAmber + '44', padding: 14, width: '100%' },
  tipLabel:      { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  tipText:       { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
});

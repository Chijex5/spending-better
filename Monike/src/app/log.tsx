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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
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
};

type EntryMode = 'manual' | 'upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_THRESHOLD = 5145.25;
const DEMO_TODAY      = new Date(2026, 5, 5);

const commonCategories: CategoryInput[] = [
  { key: 'person',  label: 'Person-to-Person', average: 2100, Icon: Users       },
  { key: 'pos',     label: 'POS Purchase',      average: 3400, Icon: ShoppingBag },
  { key: 'data',    label: 'Data',              average: 1200, Icon: Wifi        },
  { key: 'airtime', label: 'Airtime',           average: 850,  Icon: Phone       },
  { key: 'food',    label: 'Food & Dining',     average: 2850, Icon: Utensils    },
  { key: 'online',  label: 'Online Payment',    average: 4250, Icon: Globe       },
];

const otherCategories: CategoryInput[] = [
  { key: 'electricity', label: 'Electricity', average: 5100, Icon: Zap        },
  { key: 'other',       label: 'Other',       average: 1500, Icon: CreditCard },
];

const allSpendKeys: EntryKey[] = [
  ...commonCategories, ...otherCategories,
].map((c) => c.key).concat('savings');

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
  const prefix = dateKey(date) === dateKey(DEMO_TODAY) ? 'Today · ' : '';
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
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  
  // ── FIX: one stable Map for all refs — never recreated, never causes re-renders ──
  // Using a Map instead of a plain object + useCallback factories means each
  // TextInput gets the same ref-setter function object across every render.
  // React Native calls the ref callback only when the node mounts/unmounts, not
  // on every render, so this stops the cascade that was jumping focus.
  const inputRefs = useRef<Map<string, TextInput | null>>(new Map());

  // Stable setter factory — returns the same function for a given key because
  // the Map reference never changes. Individual setters are cached in a separate
  // ref so the object identity is stable across renders.
  const refSetterCache = useRef<Map<string, (node: TextInput | null) => void>>(new Map());
  const getRefSetter = useCallback((key: string) => {
    if (!refSetterCache.current.has(key)) {
      refSetterCache.current.set(key, (node: TextInput | null) => {
        inputRefs.current.set(key, node);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return refSetterCache.current.get(key)!;
  }, []); // empty deps — this never changes

  // ── FIX: focusInput reads from the stable Map ──────────────────────────────
  const focusInput = useCallback((key: EntryKey) => {
    inputRefs.current.get(key)?.focus();
  }, []);

  const totalPulse     = useRef(new Animated.Value(1)).current;
  const dangerPulse    = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(320)).current;
  const successIcon    = useRef(new Animated.Value(0)).current;
  const warningShake   = useRef(new Animated.Value(0)).current;
  const modeSwitchAnim = useRef(new Animated.Value(0)).current;

  const [selectedDate,   setSelectedDate]   = useState(DEMO_TODAY);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [otherOpen,      setOtherOpen]      = useState(false);
  const [focusedKey,     setFocusedKey]     = useState<EntryKey | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [entryMode,      setEntryMode]      = useState<EntryMode>('manual');

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

  // ── FIX: updateValue uses functional setState so it never needs `values`
  // in its dependency array, meaning it's truly stable across renders.
  // Previously it closed over `values` which changed on every keystroke,
  // invalidating the function reference and causing re-renders in children.
  const updateValue = useCallback((key: EntryKey, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'),
    }));
  }, []); // stable — no deps needed with functional update

  const moveDay = useCallback((n: number) => {
    setSelectedDate((prev) => {
      const next = addDays(prev, n);
      return next > DEMO_TODAY ? prev : next;
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
        family_spend:        0,           // no UI field yet
        electricity_spend:   parseAmount(values.electricity),
        subscription_spend:  0,           // no UI field yet
        loan_spend:          0,           // no UI field yet
        other_spend:         parseAmount(values.other),
        savings_out:         parseAmount(values.savings),
        total_credit:        parseAmount(values.income),
      });
      setSuccessVisible(true);
    } catch (e) {
      // surface the error — you can swap this for a toast later
      console.error('[saveEntry]', e);
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [hasData, saving, selectedDate, values]);

  const clearForm = useCallback(() => {
    setValues({ person: '', pos: '', data: '', airtime: '', food: '', online: '', electricity: '', other: '', savings: '', income: '' });
    setFocusedKey(null);
    setOtherOpen(false);
    resetUpload();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetUpload]);

  const dismissSuccess = useCallback(() => {
    Animated.timing(sheetTranslate, { toValue: 320, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => { setSuccessVisible(false); clearForm(); });
  }, [clearForm, sheetTranslate]);

  const pillLeft = modeSwitchAnim.interpolate({ inputRange: [0, 1], outputRange: ['2%', '50%'] });

  // ── Stable focus/blur handlers per key ────────────────────────────────────
  // These are defined once outside render (via useCallback with [] deps)
  // so child components that receive them never re-render just because
  // the parent rendered. Previously these were inline arrow functions.
  const handleFocus = useCallback((key: EntryKey) => setFocusedKey(key), []);
  const handleBlur  = useCallback(() => setFocusedKey(null), []);
  // ── Debug: track what triggers LogScreen re-renders ─────────────────────────
const logScreenRenderCount = useRef(0);
logScreenRenderCount.current += 1;

const prevLogScreenState = useRef<any>({});
const logScreenState = { focusedKey, values, spendTotal, entryMode, otherOpen, saving };
const changedLogScreenState: string[] = [];
for (const [k, v] of Object.entries(logScreenState)) {
  if (prevLogScreenState.current[k] !== v) changedLogScreenState.push(k);
}
prevLogScreenState.current = logScreenState;
  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>

        {/* Header */}
        <View style={s.headerBlock}>
          <Text style={s.screenTitle}>LOG SPEND</Text>
          <View style={s.dateRow}>
            <Pressable style={s.dateArrow} onPress={() => moveDay(-1)}>
              <ChevronLeft size={20} color={MonikeColors.inkSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable style={s.datePill} onPress={() => setDatePickerOpen(true)}>
              <Text style={s.dateText}>{formatDateLabel(selectedDate)}</Text>
              <ChevronDown size={13} color={MonikeColors.inkMuted} style={{ marginLeft: 4 }} />
            </Pressable>
            <Pressable
              style={s.dateArrow}
              disabled={dateKey(selectedDate) === dateKey(DEMO_TODAY)}
              onPress={() => moveDay(1)}
            >
              <ChevronRight
                size={20}
                color={dateKey(selectedDate) === dateKey(DEMO_TODAY) ? MonikeColors.inkGhost : MonikeColors.inkSecondary}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>
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
              <PenLine size={14} color={entryMode === 'manual' ? MonikeColors.bgVoid : MonikeColors.inkMuted} strokeWidth={2} />
              <Text style={[s.modeTabText, entryMode === 'manual' && s.modeTabTextActive]}>Manual Entry</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} style={s.modeTab} onPress={() => switchMode('upload')}>
              <FileSpreadsheet size={14} color={entryMode === 'upload' ? MonikeColors.bgVoid : MonikeColors.inkMuted} strokeWidth={2} />
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
              <SectionLabel icon="●" label="COMMON SPEND" />
              {commonCategories.map((cat) => (
                <CategoryRow
                  key={cat.key}
                  category={cat}
                  focused={focusedKey === cat.key}
                  value={values[cat.key]}
                  onChange={updateValue}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onPress={focusInput}
                  refSetter={getRefSetter(cat.key)}
                />
              ))}

              <Pressable style={s.showMoreRow} onPress={() => setOtherOpen((o) => !o)}>
                <Text style={s.showMoreText}>{otherOpen ? 'Hide categories' : 'More categories'}</Text>
                <ChevronDown size={15} color={MonikeColors.inkMuted} style={{ transform: [{ rotate: otherOpen ? '180deg' : '0deg' }] }} />
              </Pressable>

              {otherOpen && (
                <>
                  <SectionLabel icon="◆" label="OTHER" />
                  {otherCategories.map((cat) => (
                    <CategoryRow
                      key={cat.key}
                      category={cat}
                      focused={focusedKey === cat.key}
                      value={values[cat.key]}
                      onChange={updateValue}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                      onPress={focusInput}
                      refSetter={getRefSetter(cat.key)}
                    />
                  ))}
                </>
              )}

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerLabel}>SAVINGS</Text>
                <View style={s.dividerLine} />
              </View>
              <SavingsRow
                focused={focusedKey === 'savings'}
                value={values.savings}
                onChange={updateValue}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onPress={focusInput}
                refSetter={getRefSetter('savings')}
              />

              <IncomeRow
                value={values.income}
                onChange={updateValue}
                onFocus={handleFocus}
                onBlur={handleBlur}
                refSetter={getRefSetter('income')}
              />
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
            <ActivityIndicator size="small" color={MonikeColors.bgVoid} />
          ) : (
            <View style={s.saveButtonInner}>
              <Text style={[s.saveText, !hasData && s.saveTextMuted]}>SAVE ENTRY</Text>
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

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.sectionLabelRow}>
      <Text style={s.sectionLabelIcon}>{icon}</Text>
      <Text style={s.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────
// FIX: onFocus and onBlur now accept (key) and () signatures matching the
// stable handlers above. onPress accepts the key directly.
// The row's Pressable only covers the non-input area so it doesn't
// fight with the TextInput for touch events.

// ─── CategoryRow ──────────────────────────────────────────────────────────────

// ─── CategoryRow ──────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  focused,
  onChange,
  onFocus,
  onBlur,
  onPress,
  refSetter,
  value,
}: {
  category: CategoryInput;
  focused: boolean;
  onChange: (key: EntryKey, value: string) => void;
  onFocus: (key: EntryKey) => void;
  onBlur: () => void;
  onPress: (key: EntryKey) => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  const Icon    = category.Icon;

  const renderCount = useRef(0);
  renderCount.current += 1;

  // Track which props changed between renders
  const prevProps = useRef<any>({});
  const changedProps: string[] = [];
  const cur = { focused, onChange, onFocus, onBlur, onPress, refSetter, value, 'category.key': category.key };
  for (const [k, v] of Object.entries(cur)) {
    if (prevProps.current[k] !== v) changedProps.push(k);
  }
  prevProps.current = cur;

  return (
    <View style={[s.categoryRow, entered && s.categoryRowEntered, focused && s.categoryRowFocused]}>
      <Pressable
        style={s.categoryPressArea}
        onPress={() => onPress(category.key)}
      >
        <View style={[s.categoryIconShell, entered && s.categoryIconShellActive]}>
          <Icon size={18} color={entered ? MonikeColors.accentPulse : MonikeColors.inkSecondary} strokeWidth={1.9} />
        </View>
        <View style={s.categoryCopy}>
          <Text style={[s.categoryName, entered && s.categoryNameActive]}>{category.label}</Text>
          <Text style={s.categoryAverage}>avg ₦{formatNaira(category.average)}</Text>
        </View>
      </Pressable>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={(v) => onChange(category.key, v)}
        onFocus={() => {
          onFocus(category.key);
        }}
        onBlur={() => {
          onBlur();
        }}
        refSetter={refSetter}
        tint={MonikeColors.accentPulse}
      />
    </View>
  );
}

// ─── SavingsRow ───────────────────────────────────────────────────────────────

function SavingsRow({
  focused,
  onChange,
  onFocus,
  onBlur,
  onPress,
  refSetter,
  value,
}: {
  focused: boolean;
  onChange: (key: EntryKey, value: string) => void;
  onFocus: (key: EntryKey) => void;
  onBlur: () => void;
  onPress: (key: EntryKey) => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  // ── FIX: same as CategoryRow — memoize the 'savings' key closures
  const handleFocus  = useCallback(() => onFocus('savings'),  [onFocus]);
  const handlePress  = useCallback(() => onPress('savings'),  [onPress]);
  const handleChange = useCallback((v: string) => onChange('savings', v), [onChange]);

  return (
    <View style={[s.categoryRow, s.savingsRow, parseAmount(value) > 0 && s.savingsRowEntered, focused && s.savingsRowFocused]}>
      <Pressable style={s.categoryPressArea} onPress={handlePress}>
        <View style={[s.categoryIconShell, s.savingsIconShell]}>
          <TrendingUp size={18} color={MonikeColors.signalBlue} strokeWidth={2} />
        </View>
        <View style={s.categoryCopy}>
          <Text style={s.savingsLabel}>Moved to Savings</Text>
          <Text style={s.categoryAverage}>future you says thanks</Text>
        </View>
      </Pressable>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={onBlur}
        refSetter={refSetter}
        tint={MonikeColors.signalBlue}
      />
    </View>
  );
}

function CurrencyInput({
  focused,
  onBlur,
  onChange,
  onFocus,
  refSetter,
  tint,
  value,
}: {
  focused: boolean;
  onBlur: () => void;
  onChange: (v: string) => void;
  onFocus: () => void;
  refSetter: (n: TextInput | null) => void;
  tint: string;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  return (
    <View
      style={[
        s.inputShell,
        focused && { borderColor: tint },
        entered && s.inputShellEntered,
      ]}
      // ── FIX: box-none lets touch events pass through to the TextInput child
      pointerEvents="box-none"
    >
      <Text style={[s.currencyPrefix, entered && { color: tint }]}>₦</Text>
      <TextInput
        ref={refSetter}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={MonikeColors.inkGhost}
        style={[s.amountInput, entered && { color: tint }]}
      />
    </View>
  );
}

// ─── IncomeRow ────────────────────────────────────────────────────────────────

function IncomeRow({
  onChange,
  onFocus,
  onBlur,
  refSetter,
  value,
}: {
  onChange: (key: EntryKey, value: string) => void;
  onFocus: (key: EntryKey) => void;
  onBlur: () => void;
  refSetter: (n: TextInput | null) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const amount = parseAmount(value);
  return (
    <View style={[s.incomeCard, isFocused && s.incomeCardFocused]}>
      <View style={s.incomeHeaderRow}>
        <View style={s.incomeIconDot} />
        <Text style={s.incomeHeader}>MONEY RECEIVED TODAY</Text>
      </View>
      <View style={[s.incomeField, isFocused && s.incomeFieldFocused]} pointerEvents="box-none">
        <Text style={s.incomePrefix}>₦</Text>
        <TextInput
          ref={refSetter}
          value={value}
          onChangeText={(v) => onChange('income', v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
          onFocus={() => { setIsFocused(true); onFocus('income'); }}
          onBlur={() =>  { setIsFocused(false); onBlur(); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={MonikeColors.inkMuted}
          style={s.incomeInput}
          caretHidden={false}
          contextMenuHidden={false}
        />
      </View>
      {amount > 0 && <Text style={s.incomeHint}>Received ₦{formatNaira(amount)} today</Text>}
    </View>
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
          <ActivityIndicator color={MonikeColors.accentPulse} size="small" />
          <Text style={s.statusText}>Opening file picker…</Text>
        </View>
      )}

      {uploadState.status === 'uploading' && (
        <View style={s.statusCard}>
          <ActivityIndicator color={MonikeColors.accentPulse} />
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
        <Upload size={28} color={MonikeColors.accentPulse} strokeWidth={1.8} />
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

function ProcessingCard({
  filename,
  total,
  dedup,
  progress,
}: {
  filename: string;
  total: number;
  dedup: UploadDedup | null;
  progress: UploadProgress | null;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pct = progress?.pct ?? 0;
    Animated.timing(barAnim, {
      toValue: pct,
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
        <ActivityIndicator size="small" color={MonikeColors.accentPulse} />
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

function UploadSuccessCard({
  filename, onReset, result,
}: {
  filename: string; onReset: () => void; result: UploadResult;
}) {
  const stats: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Transactions in file',  value: String(result.total_rows_in_file) },
    { label: 'New days added',        value: String(result.new_days_inserted),               accent: true },
    { label: 'Days updated',          value: String(result.days_updated) },
    { label: 'Duplicates skipped',    value: String(result.duplicate_transactions_skipped) },
    { label: 'High-spend days found', value: String(result.high_spend_days_detected),       accent: result.high_spend_days_detected > 0 },
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
  const dates = Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i - 6)).reverse();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalScrim} onPress={onClose}>
        <View style={s.calendarCard}>
          <Text style={s.calendarTitle}>SELECT DATE</Text>
          {dates.map((date) => {
            const selected = dateKey(date) === dateKey(selectedDate);
            return (
              <Pressable key={dateKey(date)} style={[s.dateOption, selected && s.dateOptionSelected]} onPress={() => onSelect(date)}>
                {selected && <View style={s.dateOptionDot} />}
                <Text style={[s.dateOptionText, selected && s.dateOptionTextSelected]}>{formatDateLabel(date)}</Text>
              </Pressable>
            );
          })}
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

  headerBlock: { paddingHorizontal: ScreenPadding, paddingTop: 10, paddingBottom: 6 },
  screenTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 20, fontWeight: '800', letterSpacing: 1.2 },
  dateRow:  { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateArrow:{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  datePill: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dateText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },

  totalCard: { marginHorizontal: ScreenPadding, borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  totalCardDanger: { backgroundColor: '#1E0E0F', borderColor: '#FF3D3D44' },
  totalLeft: { flex: 1 },
  totalLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginBottom: 4 },
  totalValue: { fontFamily: Fonts.mono, fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden', marginTop: 10 },
  progressFill:  { height: '100%', borderRadius: 999 },
  totalRight:    { alignItems: 'flex-end', gap: 4 },
  limitBadge:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  limitBadgeText:{ fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  limitText:     { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  categoryCount: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  modeToggleWrap: { paddingHorizontal: ScreenPadding, marginBottom: 4 },
  modeToggle: { height: 44, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', position: 'relative', overflow: 'hidden' },
  modePill:   { position: 'absolute', top: 4, bottom: 4, width: '48%', borderRadius: 10, backgroundColor: MonikeColors.accentPulse },
  modeTab:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 1 },
  modeTabText:       { color: MonikeColors.inkMuted, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600' },
  modeTabTextActive: { color: MonikeColors.bgVoid },

  content: { paddingHorizontal: ScreenPadding, paddingTop: 12 },

  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 },
  sectionLabelIcon: { color: MonikeColors.accentPulse, fontSize: 7 },
  sectionLabel:     { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },

  // FIX: categoryRow is now a plain View; only categoryPressArea is a Pressable
  categoryRow:         { minHeight: 62, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingRight: 12, marginBottom: 6, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost },
  categoryRowEntered:  { borderColor: MonikeColors.accentPulse + '55', backgroundColor: MonikeColors.bgStripe },
  categoryRowFocused:  { borderColor: MonikeColors.accentPulse + '88' },
  // pressable covers just the icon+label, not the input side
  categoryPressArea:   { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingVertical: 10 },
  categoryIconShell:   { width: 38, height: 38, borderRadius: 11, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  categoryIconShellActive: { backgroundColor: MonikeColors.accentPulse + '18' },
  categoryCopy:        { flex: 1, minWidth: 0 },
  categoryName:        { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
  categoryNameActive:  { color: MonikeColors.inkPrimary },
  categoryAverage:     { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },

  inputShell:        { width: 116, height: 42, borderRadius: 10, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 6 },
  inputShellFocused: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 6},
  inputShellEntered: { backgroundColor: 'transparent' },
  currencyPrefix:    { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 15 },
  amountInput:       { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700', textAlign: 'right', paddingVertical: 0 },

  showMoreRow:  { height: 42, borderRadius: 11, borderWidth: 1, borderColor: MonikeColors.inkGhost, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 4 },
  showMoreText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600' },

  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: MonikeColors.inkGhost },
  dividerLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },

  savingsRow:        { borderColor: MonikeColors.signalBlue + '33', backgroundColor: '#0A1929', marginBottom: 10 },
  savingsRowEntered: { borderColor: MonikeColors.signalBlue + '77' },
  savingsRowFocused: { borderColor: MonikeColors.signalBlue },
  savingsIconShell:  { backgroundColor: MonikeColors.signalBlue + '18' },
  savingsLabel:      { color: MonikeColors.signalBlue, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },

  incomeCard:       { marginTop: 4, borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  incomeCardFocused:{ borderColor: MonikeColors.signalBlue + '88' },
  incomeHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  incomeIconDot:    { width: 7, height: 7, borderRadius: 999, backgroundColor: MonikeColors.signalBlue },
  incomeHeader:     { color: MonikeColors.signalBlue, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  incomeField:      { height: 54, borderRadius: 12, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  incomeFieldFocused: { borderColor: MonikeColors.signalBlue, backgroundColor: MonikeColors.signalBlue + '0D' },
  incomePrefix:     { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 18 },
  incomeInput:      { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700', textAlign: 'right', paddingVertical: 0, ...Platform.select({ android: { includeFontPadding: false } }) },
  incomeHint:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 8, textAlign: 'right' },

  saveDock:        { position: 'absolute', left: ScreenPadding, right: ScreenPadding, zIndex: 20 },
  saveButton:      { height: 54, borderRadius: 14, backgroundColor: MonikeColors.accentPulse, alignItems: 'center', justifyContent: 'center' },
  saveButtonHigh:  { backgroundColor: MonikeColors.signalRed },
  saveButtonEmpty: { backgroundColor: MonikeColors.bgElevated },
  saveButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveText:        { color: MonikeColors.bgVoid, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  saveTextMuted:   { color: MonikeColors.inkMuted },
  saveBadge:       { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  saveBadgeText:   { color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },

  uploadWrap: { gap: 14, paddingTop: 6 },

  dropZone: { borderRadius: 18, borderWidth: 1.5, borderColor: MonikeColors.accentPulse + '55', borderStyle: 'dashed', backgroundColor: MonikeColors.accentPulse + '07', padding: 36, alignItems: 'center', gap: 8 },
  uploadIconRing: { width: 68, height: 68, borderRadius: 34, backgroundColor: MonikeColors.accentPulse + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
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

  processingCard:       { borderRadius: CardRadius, borderWidth: 1, borderColor: MonikeColors.accentPulse + '44', backgroundColor: MonikeColors.bgSurface, padding: 16, gap: 12 },
  processingHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processingHeaderCopy: { flex: 1 },
  processingTitle:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  processingFilename:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  processingBadge:      { backgroundColor: MonikeColors.bgElevated, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  processingBadgeText:  { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  processingTrack:      { height: 6, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden' },
  processingFill:       { height: '100%', borderRadius: 999, backgroundColor: MonikeColors.accentPulse },
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

  uploadHintCard:  { borderRadius: 14, borderWidth: 1, borderColor: MonikeColors.inkGhost, backgroundColor: MonikeColors.bgSurface, padding: 14, gap: 10 },
  uploadHintTitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3 },
  uploadHintRow:   { flexDirection: 'row', gap: 12 },
  uploadHintCol:   { gap: 6 },
  uploadHintCell:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' },
  uploadHintVal:   { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 11 },
  uploadHintNote:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 4 },

  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  calendarCard:  { width: '100%', maxWidth: 360, borderRadius: 20, backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  calendarTitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4, marginBottom: 12 },
  dateOption:         { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateOptionSelected: { backgroundColor: MonikeColors.accentPulse + '18' },
  dateOptionDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.accentPulse },
  dateOptionText:         { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  dateOptionTextSelected: { color: MonikeColors.accentPulse, fontWeight: '700' },

  successScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  successSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: MonikeColors.bgOverlay, alignItems: 'center', paddingHorizontal: 26, paddingTop: 14, paddingBottom: 40, borderTopWidth: 1, borderColor: MonikeColors.inkGhost },
  handle:       { width: 40, height: 4, borderRadius: 999, backgroundColor: MonikeColors.inkGhost, marginBottom: 28 },
  successTitle: { fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', marginTop: 16, letterSpacing: 0.8 },
  successBody:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  tipCard:      { marginTop: 18, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.signalAmber + '44', padding: 14, width: '100%' },
  tipLabel:     { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  tipText:      { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
});
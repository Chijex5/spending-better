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
import { useUploadStatement } from '@/hooks/use-upload-statement';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryKey =
  | 'person'
  | 'pos'
  | 'data'
  | 'airtime'
  | 'food'
  | 'online'
  | 'electricity'
  | 'other'
  | 'savings'
  | 'income';

type CategoryInput = {
  key: EntryKey;
  label: string;
  average: number;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

type EntryMode = 'manual' | 'upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_THRESHOLD = 5145.25;
const DEMO_TODAY = new Date(2026, 5, 5);

const commonCategories: CategoryInput[] = [
  { key: 'person',   label: 'Person-to-Person', average: 2100, Icon: Users       },
  { key: 'pos',      label: 'POS Purchase',      average: 3400, Icon: ShoppingBag },
  { key: 'data',     label: 'Data',              average: 1200, Icon: Wifi        },
  { key: 'airtime',  label: 'Airtime',           average: 850,  Icon: Phone       },
  { key: 'food',     label: 'Food & Dining',     average: 2850, Icon: Utensils    },
  { key: 'online',   label: 'Online Payment',    average: 4250, Icon: Globe       },
];

const otherCategories: CategoryInput[] = [
  { key: 'electricity', label: 'Electricity', average: 5100, Icon: Zap        },
  { key: 'other',       label: 'Other',       average: 1500, Icon: CreditCard },
];

const allSpendKeys: EntryKey[] = [
  ...commonCategories,
  ...otherCategories,
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
  const normalized = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  return Number(normalized) || 0;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateLabel(date: Date) {
  const prefix = dateKey(date) === dateKey(DEMO_TODAY) ? 'Today · ' : '';
  return `${prefix}${fmtWeekday.format(date)}, ${fmtDayMonth.format(date)}`;
}

function spendPalette(total: number) {
  const ratio = total / DAILY_THRESHOLD;
  if (total <= 0)   return { color: MonikeColors.inkSecondary, dangerTint: false, high: false, pulsing: false };
  if (ratio < 0.7)  return { color: MonikeColors.accentPulse,  dangerTint: false, high: false, pulsing: false };
  if (ratio < 0.9)  return { color: MonikeColors.signalAmber,  dangerTint: false, high: false, pulsing: false };
  if (ratio < 1)    return { color: MonikeColors.signalRed,    dangerTint: false, high: true,  pulsing: true  };
  return                   { color: MonikeColors.signalRed,    dangerTint: true,  high: true,  pulsing: false };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  // Animated values
  const totalPulse     = useRef(new Animated.Value(1)).current;
  const dangerPulse    = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(320)).current;
  const successIcon    = useRef(new Animated.Value(0)).current;
  const warningShake   = useRef(new Animated.Value(0)).current;
  const modeSwitchAnim = useRef(new Animated.Value(0)).current;

  // UI state
  const [selectedDate,  setSelectedDate]  = useState(DEMO_TODAY);
  const [datePickerOpen,setDatePickerOpen] = useState(false);
  const [otherOpen,     setOtherOpen]      = useState(false);
  const [focusedKey,    setFocusedKey]     = useState<EntryKey | null>(null);
  const [saving,        setSaving]         = useState(false);
  const [successVisible,setSuccessVisible] = useState(false);
  const [entryMode,     setEntryMode]      = useState<EntryMode>('manual');

  // Upload hook
  const { uploadState, pickAndUpload, reset: resetUpload } = useUploadStatement();

  // Form values
  const [values, setValues] = useState<Record<EntryKey, string>>({
    person: '', pos: '', data: '', airtime: '', food: '',
    online: '', electricity: '', other: '', savings: '', income: '',
  });

  // ─── Derived ──────────────────────────────────────────────────────────────

  const spendTotal = useMemo(
    () => allSpendKeys.reduce((sum, key) => sum + parseAmount(values[key] ?? ''), 0),
    [values],
  );
  const enteredCategories = useMemo(
    () => allSpendKeys.filter((key) => parseAmount(values[key] ?? '') > 0).length,
    [values],
  );
  const palette  = spendPalette(spendTotal);
  const progress = Math.min(100, (spendTotal / DAILY_THRESHOLD) * 100);
  const hasData  =
    spendTotal > 0 ||
    parseAmount(values.income) > 0 ||
    uploadState.status === 'success';

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Bounce the total on change
  useEffect(() => {
    totalPulse.setValue(0.95);
    Animated.spring(totalPulse, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }).start();
  }, [spendTotal, totalPulse]);

  // Pulse opacity when near limit
  useEffect(() => {
    if (!palette.pulsing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dangerPulse, { toValue: 0.5, duration: 540, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(dangerPulse, { toValue: 1,   duration: 540, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dangerPulse, palette.pulsing]);

  // Success sheet entrance
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
    const timer = setTimeout(dismissSuccess, 2800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successVisible]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const updateValue = useCallback((key: EntryKey, value: string) => {
    setValues((cur) => ({
      ...cur,
      [key]: value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'),
    }));
  }, []);

  const focusInput = useCallback((key: EntryKey) => {
    inputRefs.current[key]?.focus();
  }, []);

  const makeRefSetter = useCallback(
    (key: string) => (node: TextInput | null) => { inputRefs.current[key] = node; },
    [],
  );

  const moveDay = (amount: number) => {
    const next = addDays(selectedDate, amount);
    if (next > DEMO_TODAY) return;
    setSelectedDate(next);
  };

  const switchMode = (mode: EntryMode) => {
    setEntryMode(mode);
    Animated.timing(modeSwitchAnim, {
      toValue: mode === 'manual' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const saveEntry = () => {
    if (!hasData || saving) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccessVisible(true);
    }, 480);
  };

  const clearForm = () => {
    setValues({ person: '', pos: '', data: '', airtime: '', food: '', online: '', electricity: '', other: '', savings: '', income: '' });
    setFocusedKey(null);
    setOtherOpen(false);
    resetUpload();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const dismissSuccess = () => {
    Animated.timing(sheetTranslate, {
      toValue: 320, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(() => {
      setSuccessVisible(false);
      clearForm();
    });
  };

  // Animated pill position for mode toggle
  const pillLeft = modeSwitchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '50%'],
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>LOG SPEND</Text>
          <View style={styles.dateRow}>
            <Pressable style={styles.dateArrow} onPress={() => moveDay(-1)}>
              <ChevronLeft size={20} color={MonikeColors.inkSecondary} strokeWidth={2.2} />
            </Pressable>
            <Pressable style={styles.datePill} onPress={() => setDatePickerOpen(true)}>
              <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
              <ChevronDown size={13} color={MonikeColors.inkMuted} style={{ marginLeft: 4 }} />
            </Pressable>
            <Pressable
              style={styles.dateArrow}
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

        {/* ── Spend Summary Card ──────────────────────────────────────────── */}
        <View style={[styles.totalCard, palette.dangerTint && styles.totalCardDanger]}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>TOTAL SPEND</Text>
            <Animated.Text
              style={[
                styles.totalValue,
                {
                  color:   palette.color,
                  opacity: palette.pulsing ? dangerPulse : 1,
                  transform: [{ scale: totalPulse }],
                },
              ]}
            >
              ₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}
            </Animated.Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: palette.color }]} />
            </View>
          </View>
          <View style={styles.totalRight}>
            <View style={[styles.limitBadge, { borderColor: palette.color + '44' }]}>
              <Text style={[styles.limitBadgeText, { color: palette.color }]}>
                {Math.round(progress)}%
              </Text>
            </View>
            <Text style={styles.limitText}>of ₦{formatNaira(DAILY_THRESHOLD)}</Text>
            <Text style={styles.categoryCount}>
              {enteredCategories} {enteredCategories === 1 ? 'category' : 'categories'}
            </Text>
          </View>
        </View>

        {/* ── Mode Toggle ─────────────────────────────────────────────────── */}
        <View style={styles.modeToggleWrap}>
          <View style={styles.modeToggle}>
            <Animated.View style={[styles.modePill, { left: pillLeft }]} />
            <TouchableOpacity activeOpacity={0.8} style={styles.modeTab} onPress={() => switchMode('manual')}>
              <PenLine size={14} color={entryMode === 'manual' ? MonikeColors.bgVoid : MonikeColors.inkMuted} strokeWidth={2} />
              <Text style={[styles.modeTabText, entryMode === 'manual' && styles.modeTabTextActive]}>
                Manual Entry
              </Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} style={styles.modeTab} onPress={() => switchMode('upload')}>
              <FileSpreadsheet size={14} color={entryMode === 'upload' ? MonikeColors.bgVoid : MonikeColors.inkMuted} strokeWidth={2} />
              <Text style={[styles.modeTabText, entryMode === 'upload' && styles.modeTabTextActive]}>
                Upload XLSX
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 100 }]}
        >
          {entryMode === 'manual' ? (
            <>
              {/* Common categories */}
              <SectionLabel icon="●" label="COMMON SPEND" />
              {commonCategories.map((category) => (
                <CategoryRow
                  key={category.key}
                  category={category}
                  focused={focusedKey === category.key}
                  value={values[category.key]}
                  onChange={updateValue}
                  onFocus={() => setFocusedKey(category.key)}
                  onBlur={() => setFocusedKey(null)}
                  onPress={() => focusInput(category.key)}
                  refSetter={makeRefSetter(category.key)}
                />
              ))}

              {/* Show more */}
              <Pressable style={styles.showMoreRow} onPress={() => setOtherOpen((o) => !o)}>
                <Text style={styles.showMoreText}>
                  {otherOpen ? 'Hide categories' : 'More categories'}
                </Text>
                <ChevronDown
                  size={15}
                  color={MonikeColors.inkMuted}
                  style={{ transform: [{ rotate: otherOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {otherOpen && (
                <>
                  <SectionLabel icon="◆" label="OTHER" />
                  {otherCategories.map((category) => (
                    <CategoryRow
                      key={category.key}
                      category={category}
                      focused={focusedKey === category.key}
                      value={values[category.key]}
                      onChange={updateValue}
                      onFocus={() => setFocusedKey(category.key)}
                      onBlur={() => setFocusedKey(null)}
                      onPress={() => focusInput(category.key)}
                      refSetter={makeRefSetter(category.key)}
                    />
                  ))}
                </>
              )}

              {/* Savings */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>SAVINGS</Text>
                <View style={styles.dividerLine} />
              </View>
              <SavingsRow
                focused={focusedKey === 'savings'}
                value={values.savings}
                onChange={updateValue}
                onFocus={() => setFocusedKey('savings')}
                onBlur={() => setFocusedKey(null)}
                onPress={() => focusInput('savings')}
                refSetter={makeRefSetter('savings')}
              />

              {/* Income — isolated focus state fixes cursor-jump bug */}
              <IncomeRow
                value={values.income}
                onChange={updateValue}
                onFocus={() => setFocusedKey('income')}
                onBlur={() => setFocusedKey(null)}
                refSetter={makeRefSetter('income')}
              />
            </>
          ) : (
            /* Upload mode */
            <UploadPanel
              uploadState={uploadState}
              onUpload={pickAndUpload}
              onReset={resetUpload}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Save Button ─────────────────────────────────────────────────────── */}
      <View style={[styles.saveDock, { bottom: insets.bottom + 68 + 14 }]}>
        <Pressable
          disabled={!hasData || saving}
          style={[
            styles.saveButton,
            !hasData && styles.saveButtonEmpty,
            hasData && palette.high && styles.saveButtonHigh,
          ]}
          onPress={saveEntry}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MonikeColors.bgVoid} />
          ) : (
            <View style={styles.saveButtonInner}>
              <Text style={[styles.saveText, !hasData && styles.saveTextMuted]}>
                SAVE ENTRY
              </Text>
              {hasData && spendTotal > 0 && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>
                    ₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}
                  </Text>
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
        onSelect={(date) => { setSelectedDate(date); setDatePickerOpen(false); }}
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
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelIcon}>{icon}</Text>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

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
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  const Icon    = category.Icon;

  return (
    <Pressable
      style={[
        styles.categoryRow,
        entered  && styles.categoryRowEntered,
        focused  && styles.categoryRowFocused,
      ]}
      onPress={onPress}
    >
      <View style={[styles.categoryIconShell, entered && styles.categoryIconShellActive]}>
        <Icon
          size={18}
          color={entered ? MonikeColors.accentPulse : MonikeColors.inkSecondary}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={[styles.categoryName, entered && styles.categoryNameActive]}>
          {category.label}
        </Text>
        <Text style={styles.categoryAverage}>avg ₦{formatNaira(category.average)}</Text>
      </View>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={(v) => onChange(category.key, v)}
        onFocus={onFocus}
        onBlur={onBlur}
        refSetter={refSetter}
        tint={MonikeColors.accentPulse}
      />
    </Pressable>
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
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  return (
    <Pressable
      style={[
        styles.categoryRow,
        styles.savingsRow,
        entered && styles.savingsRowEntered,
        focused && styles.savingsRowFocused,
      ]}
      onPress={onPress}
    >
      <View style={[styles.categoryIconShell, styles.savingsIconShell]}>
        <TrendingUp size={18} color={MonikeColors.signalBlue} strokeWidth={2} />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={styles.savingsLabel}>Moved to Savings</Text>
        <Text style={styles.categoryAverage}>future you says thanks</Text>
      </View>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={(v) => onChange('savings', v)}
        onFocus={onFocus}
        onBlur={onBlur}
        refSetter={refSetter}
        tint={MonikeColors.signalBlue}
      />
    </Pressable>
  );
}

// ─── CurrencyInput ────────────────────────────────────────────────────────────

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
  onChange: (value: string) => void;
  onFocus: () => void;
  refSetter: (node: TextInput | null) => void;
  tint: string;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  return (
    <View
      style={[
        styles.inputShell,
        focused  && { borderColor: tint },
        focused  && styles.inputShellFocused,
        entered  && styles.inputShellEntered,
      ]}
    >
      <Text style={[styles.currencyPrefix, entered && { color: tint }]}>₦</Text>
      <TextInput
        ref={refSetter}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={MonikeColors.inkGhost}
        style={[styles.amountInput, entered && { color: tint }]}
      />
    </View>
  );
}

// ─── IncomeRow ────────────────────────────────────────────────────────────────
//
// FIX: Uses its own local `isFocused` state for visual styling.
// This breaks the parent re-render → ref-reassignment → cursor-steal loop
// that caused the cursor to jump to other inputs on focus.
// We still call onFocus/onBlur so the parent knows which field is active
// (needed for the save-button state), but the border highlight is driven
// entirely by local state and never triggers a full screen re-render.

function IncomeRow({
  onChange,
  onFocus,
  onBlur,
  refSetter,
  value,
}: {
  onChange: (key: EntryKey, value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const amount = parseAmount(value);

  return (
    <View style={[styles.incomeCard, isFocused && styles.incomeCardFocused]}>
      <View style={styles.incomeHeaderRow}>
        <View style={styles.incomeIconDot} />
        <Text style={styles.incomeHeader}>MONEY RECEIVED TODAY</Text>
      </View>
      <View style={[styles.incomeField, isFocused && styles.incomeFieldFocused]}>
        <Text style={styles.incomePrefix}>₦</Text>
        <TextInput
          ref={refSetter}
          value={value}
          onChangeText={(v) =>
            onChange('income', v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))
          }
          onFocus={() => { setIsFocused(true); onFocus(); }}
          onBlur={() =>  { setIsFocused(false); onBlur(); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={MonikeColors.inkMuted}
          style={styles.incomeInput}
          // NOTE: do NOT set inputMode alongside keyboardType —
          // the combination causes cursor instability on some RN versions.
          caretHidden={false}
          contextMenuHidden={false}
        />
      </View>
      {amount > 0 && (
        <Text style={styles.incomeHint}>
          Received ₦{formatNaira(amount)} today
        </Text>
      )}
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
    <View style={styles.uploadWrap}>
      {uploadState.status === 'idle' && (
        <DropZone onPress={onUpload} />
      )}

      {uploadState.status === 'picking' && (
        <View style={styles.statusCard}>
          <ActivityIndicator color={MonikeColors.accentPulse} size="small" />
          <Text style={styles.statusText}>Opening file picker…</Text>
        </View>
      )}

      {uploadState.status === 'uploading' && (
        <View style={styles.statusCard}>
          <ActivityIndicator color={MonikeColors.accentPulse} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusText}>Uploading</Text>
            <Text style={styles.statusSub}>{uploadState.filename}</Text>
          </View>
        </View>
      )}

      {uploadState.status === 'error' && (
        <View style={[styles.statusCard, styles.statusCardError]}>
          <AlertCircle size={22} color={MonikeColors.signalRed} strokeWidth={2} />
          <View style={styles.statusCopy}>
            <Text style={[styles.statusText, { color: MonikeColors.signalRed }]}>Upload failed</Text>
            <Text style={styles.statusSub}>{uploadState.message}</Text>
          </View>
          <Pressable style={styles.retryButton} onPress={onUpload} hitSlop={12}>
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

      {uploadState.status !== 'success' && <UploadFormatHint />}
    </View>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────

function DropZone({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.dropZone} onPress={onPress}>
      <View style={styles.uploadIconRing}>
        <Upload size={28} color={MonikeColors.accentPulse} strokeWidth={1.8} />
      </View>
      <Text style={styles.dropZoneTitle}>Drop your statement here</Text>
      <Text style={styles.dropZoneSub}>or tap to browse files</Text>
      <View style={styles.formatBadge}>
        <FileSpreadsheet size={11} color={MonikeColors.signalBlue} />
        <Text style={styles.formatBadgeText}>.xlsx · .xls · .csv</Text>
      </View>
    </Pressable>
  );
}

// ─── UploadSuccessCard ────────────────────────────────────────────────────────

function UploadSuccessCard({
  filename,
  onReset,
  result,
}: {
  filename: string;
  onReset: () => void;
  result: {
    total_rows_in_file: number;
    new_days_inserted: number;
    days_updated: number;
    duplicate_transactions_skipped: number;
    date_range_start: string;
    date_range_end: string;
    high_spend_days_detected: number;
  };
}) {
  const stats: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Transactions in file',   value: String(result.total_rows_in_file) },
    { label: 'New days added',         value: String(result.new_days_inserted),               accent: true  },
    { label: 'Days updated',           value: String(result.days_updated)                                    },
    { label: 'Duplicates skipped',     value: String(result.duplicate_transactions_skipped)                  },
    { label: 'High-spend days found',  value: String(result.high_spend_days_detected),        accent: result.high_spend_days_detected > 0 },
  ];

  return (
    <View style={styles.uploadSuccessCard}>
      <View style={styles.uploadSuccessHeader}>
        <View style={styles.uploadSuccessIconWrap}>
          <CheckCircle size={20} color={MonikeColors.accentPulse} strokeWidth={2} />
        </View>
        <View style={styles.uploadSuccessHeaderCopy}>
          <Text style={styles.uploadSuccessTitle}>Statement imported</Text>
          <Text style={styles.uploadSuccessFilename} numberOfLines={1}>{filename}</Text>
        </View>
        <Pressable style={styles.uploadResetButton} onPress={onReset} hitSlop={12}>
          <X size={15} color={MonikeColors.inkMuted} strokeWidth={2} />
        </Pressable>
      </View>

      <Text style={styles.uploadDateRange}>
        {result.date_range_start}  →  {result.date_range_end}
      </Text>

      <View style={styles.uploadStatsGrid}>
        {stats.map(({ label, value, accent }) => (
          <View key={label} style={styles.uploadStatItem}>
            <Text style={[styles.uploadStatValue, accent && styles.uploadStatValueAccent]}>
              {value}
            </Text>
            <Text style={styles.uploadStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── UploadFormatHint ─────────────────────────────────────────────────────────

function UploadFormatHint() {
  return (
    <View style={styles.uploadHintCard}>
      <Text style={styles.uploadHintTitle}>EXPECTED FORMAT</Text>
      <View style={styles.uploadHintRow}>
        <View style={styles.uploadHintCol}>
          <Text style={styles.uploadHintCell}>Trans_Date</Text>
          <Text style={styles.uploadHintCell}>Description</Text>
          <Text style={styles.uploadHintCell}>Debit</Text>
          <Text style={styles.uploadHintCell}>Credit</Text>
        </View>
        <View style={[styles.uploadHintCol, { flex: 1.4 }]}>
          <Text style={styles.uploadHintVal}>2026-06-05 10:23</Text>
          <Text style={styles.uploadHintVal}>Transfer to JOHN…</Text>
          <Text style={styles.uploadHintVal}>3400.00</Text>
          <Text style={styles.uploadHintVal}>0.00</Text>
        </View>
      </View>
      <Text style={styles.uploadHintNote}>
        OPay / Zenith statements are supported. The first 7 metadata rows are skipped automatically.
      </Text>
    </View>
  );
}

// ─── DatePickerModal ──────────────────────────────────────────────────────────

function DatePickerModal({
  onClose,
  onSelect,
  selectedDate,
  visible,
}: {
  onClose: () => void;
  onSelect: (date: Date) => void;
  selectedDate: Date;
  visible: boolean;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i - 6)).reverse();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <View style={styles.calendarCard}>
          <Text style={styles.calendarTitle}>SELECT DATE</Text>
          {dates.map((date) => {
            const selected = dateKey(date) === dateKey(selectedDate);
            return (
              <Pressable
                key={dateKey(date)}
                style={[styles.dateOption, selected && styles.dateOptionSelected]}
                onPress={() => onSelect(date)}
              >
                {selected && <View style={styles.dateOptionDot} />}
                <Text style={[styles.dateOptionText, selected && styles.dateOptionTextSelected]}>
                  {formatDateLabel(date)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── SuccessSheet ─────────────────────────────────────────────────────────────

function SuccessSheet({
  high,
  iconProgress,
  onDismiss,
  total,
  translateY,
  visible,
  warningShake,
}: {
  high: boolean;
  iconProgress: Animated.Value;
  onDismiss: () => void;
  total: number;
  translateY: Animated.Value;
  visible: boolean;
  warningShake: Animated.Value;
}) {
  const iconColor = high ? MonikeColors.signalRed : MonikeColors.accentPulse;
  const shakeX    = warningShake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.successScrim} onPress={onDismiss}>
        <Animated.View style={[styles.successSheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <Animated.View
            style={{
              opacity: iconProgress,
              transform: [{ scale: iconProgress }, { translateX: high ? shakeX : 0 }],
            }}
          >
            {high
              ? <AlertTriangle size={42} color={iconColor} strokeWidth={1.9} />
              : <Check         size={42} color={iconColor} strokeWidth={2.4} />
            }
          </Animated.View>
          <Text style={[styles.successTitle, { color: iconColor }]}>
            {high ? 'HIGH SPEND DAY' : 'ENTRY SAVED'}
          </Text>
          <Text style={styles.successBody}>
            {high
              ? `₦${formatNaira(total, total % 1 ? 2 : 0)} logged — above your ₦${formatNaira(DAILY_THRESHOLD, 2)} daily threshold.`
              : `₦${formatNaira(total, total % 1 ? 2 : 0)} logged for today. You're on track.`
            }
          </Text>
          {high && (
            <View style={styles.tipCard}>
              <Text style={styles.tipLabel}>TIP</Text>
              <Text style={styles.tipText}>
                Review Food & Dining and POS purchases first — they usually move the needle fastest.
              </Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // Root
  root:     { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1, backgroundColor: MonikeColors.bgVoid },

  // Header
  headerBlock: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 10,
    paddingBottom: 6,
  },
  screenTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  dateRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  datePill: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '600',
  },

  // Total card
  totalCard: {
    marginHorizontal: ScreenPadding,
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  totalCardDanger: { backgroundColor: '#1E0E0F', borderColor: '#FF3D3D44' },
  totalLeft: { flex: 1 },
  totalLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  totalValue: {
    fontFamily: Fonts.mono,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { height: '100%', borderRadius: 999 },
  totalRight:   { alignItems: 'flex-end', gap: 4 },
  limitBadge: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitBadgeText: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  limitText:      { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  categoryCount:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },

  // Mode toggle
  modeToggleWrap: { paddingHorizontal: ScreenPadding, marginBottom: 4 },
  modeToggle: {
    height: 44,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  modePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '48%',
    borderRadius: 10,
    backgroundColor: MonikeColors.accentPulse,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  modeTabText:       { color: MonikeColors.inkMuted, fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600' },
  modeTabTextActive: { color: MonikeColors.bgVoid },

  // Scroll content
  content: { paddingHorizontal: ScreenPadding, paddingTop: 12 },

  // Section label
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionLabelIcon: { color: MonikeColors.accentPulse, fontSize: 7 },
  sectionLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },

  // Category row
  categoryRow: {
    minHeight: 62,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
  },
  categoryRowEntered: {
    borderColor: MonikeColors.accentPulse + '55',
    backgroundColor: MonikeColors.bgStripe,
  },
  categoryRowFocused: { borderColor: MonikeColors.accentPulse + '88' },
  categoryIconShell: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryIconShellActive: { backgroundColor: MonikeColors.accentPulse + '18' },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryName:       { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },
  categoryNameActive: { color: MonikeColors.inkPrimary },
  categoryAverage:    { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, marginTop: 3 },

  // Currency input
  inputShell: {
    width: 116,
    height: 42,
    borderRadius: 10,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
  },
  inputShellFocused: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  inputShellEntered: { backgroundColor: 'transparent' },
  currencyPrefix: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 15 },
  amountInput: {
    flex: 1,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: 0,
  },

  // Show more
  showMoreRow: {
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  showMoreText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600' },

  // Divider
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: MonikeColors.inkGhost },
  dividerLabel:{ color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },

  // Savings row
  savingsRow:        { borderColor: MonikeColors.signalBlue + '33', backgroundColor: '#0A1929', marginBottom: 10 },
  savingsRowEntered: { borderColor: MonikeColors.signalBlue + '77' },
  savingsRowFocused: { borderColor: MonikeColors.signalBlue },
  savingsIconShell:  { backgroundColor: MonikeColors.signalBlue + '18' },
  savingsLabel:      { color: MonikeColors.signalBlue, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600' },

  // Income row — fixed isolated focus
  incomeCard: {
    marginTop: 4,
    borderRadius: CardRadius,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 16,
  },
  incomeCardFocused: { borderColor: MonikeColors.signalBlue + '88' },
  incomeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  incomeIconDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: MonikeColors.signalBlue },
  incomeHeader: {
    color: MonikeColors.signalBlue,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  incomeField: {
    height: 54,
    borderRadius: 12,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  incomeFieldFocused: {
    borderColor: MonikeColors.signalBlue,
    backgroundColor: MonikeColors.signalBlue + '0D',
  },
  incomePrefix: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 18 },
  incomeInput: {
    flex: 1,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: 0,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  incomeHint: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 8, textAlign: 'right' },

  // Save dock
  saveDock: { position: 'absolute', left: ScreenPadding, right: ScreenPadding, zIndex: 20 },
  saveButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: MonikeColors.accentPulse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonHigh:  { backgroundColor: MonikeColors.signalRed },
  saveButtonEmpty: { backgroundColor: MonikeColors.bgElevated },
  saveButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveText:        { color: MonikeColors.bgVoid, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  saveTextMuted:   { color: MonikeColors.inkMuted },
  saveBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  saveBadgeText: { color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700' },

  // Upload panel
  uploadWrap: { gap: 14, paddingTop: 6 },

  dropZone: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: MonikeColors.accentPulse + '55',
    borderStyle: 'dashed',
    backgroundColor: MonikeColors.accentPulse + '07',
    padding: 36,
    alignItems: 'center',
    gap: 8,
  },
  uploadIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: MonikeColors.accentPulse + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropZoneTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  dropZoneSub:   { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13 },
  formatBadge: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: MonikeColors.signalBlue + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  formatBadgeText: { color: MonikeColors.signalBlue, fontFamily: Fonts.mono, fontSize: 10 },

  // Upload status cards
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: MonikeColors.bgSurface,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
  },
  statusCardError: { borderColor: MonikeColors.signalRed + '55', backgroundColor: '#1E0B0B' },
  statusCopy:      { flex: 1, gap: 3 },
  statusText:      { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },
  statusSub:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },
  retryButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Upload success card
  uploadSuccessCard: {
    borderRadius: CardRadius,
    borderWidth: 1,
    borderColor: MonikeColors.accentPulse + '44',
    backgroundColor: MonikeColors.accentPulse + '08',
    padding: 16,
    gap: 12,
  },
  uploadSuccessHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadSuccessIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: MonikeColors.accentPulse + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadSuccessHeaderCopy: { flex: 1 },
  uploadSuccessTitle:    { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '700' },
  uploadSuccessFilename: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 2 },
  uploadResetButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadDateRange: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.4 },
  uploadStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  uploadStatItem: {
    minWidth: '45%',
    flex: 1,
    backgroundColor: MonikeColors.bgSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 10,
    gap: 3,
  },
  uploadStatValue:       { color: MonikeColors.inkPrimary,  fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700' },
  uploadStatValueAccent: { color: MonikeColors.accentPulse },
  uploadStatLabel:       { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, lineHeight: 14 },

  // Upload format hint
  uploadHintCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: MonikeColors.bgSurface,
    padding: 14,
    gap: 10,
  },
  uploadHintTitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3 },
  uploadHintRow:   { flexDirection: 'row', gap: 12 },
  uploadHintCol:   { gap: 6 },
  uploadHintCell:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' },
  uploadHintVal:   { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 11 },
  uploadHintNote:  { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 4 },

  // Date picker modal
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: MonikeColors.bgOverlay,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    padding: 16,
  },
  calendarTitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  dateOption: {
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateOptionSelected:     { backgroundColor: MonikeColors.accentPulse + '18' },
  dateOptionDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: MonikeColors.accentPulse },
  dateOptionText:         { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  dateOptionTextSelected: { color: MonikeColors.accentPulse, fontWeight: '700' },

  // Success sheet
  successScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  successSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: MonikeColors.bgOverlay,
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 14,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: MonikeColors.inkGhost,
  },
  handle: { width: 40, height: 4, borderRadius: 999, backgroundColor: MonikeColors.inkGhost, marginBottom: 28 },
  successTitle: { fontFamily: Fonts.heading, fontSize: 18, fontWeight: '800', marginTop: 16, letterSpacing: 0.8 },
  successBody:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  tipCard: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.signalAmber + '44',
    padding: 14,
    width: '100%',
  },
  tipLabel: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  tipText:  { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
});
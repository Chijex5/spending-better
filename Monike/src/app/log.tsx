import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Globe,
  Phone,
  PlusCircle,
  ShoppingBag,
  TrendingUp,
  Users,
  Utensils,
  Wifi,
  Zap,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';

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

const DAILY_THRESHOLD = 5145.25;
const DEMO_TODAY = new Date(2026, 5, 5);

const commonCategories: CategoryInput[] = [
  { key: 'person', label: 'Person-to-Person', average: 2100, Icon: Users },
  { key: 'pos', label: 'POS Purchase', average: 3400, Icon: ShoppingBag },
  { key: 'data', label: 'Data', average: 1200, Icon: Wifi },
  { key: 'airtime', label: 'Airtime', average: 850, Icon: Phone },
  { key: 'food', label: 'Food & Dining', average: 2850, Icon: Utensils },
  { key: 'online', label: 'Online Payment', average: 4250, Icon: Globe },
];

const otherCategories: CategoryInput[] = [
  { key: 'electricity', label: 'Electricity', average: 5100, Icon: Zap },
  { key: 'other', label: 'Other', average: 1500, Icon: CreditCard },
];

const allSpendKeys: EntryKey[] = [...commonCategories, ...otherCategories].map((category) => category.key).concat('savings');
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

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
  return `${prefix}${weekday.format(date)}, ${dayMonth.format(date)}`;
}

function spendPalette(total: number) {
  const ratio = total / DAILY_THRESHOLD;
  if (total <= 0) return { color: MonikeColors.inkSecondary, dangerTint: false, high: false, pulsing: false };
  if (ratio < 0.7) return { color: MonikeColors.accentPulse, dangerTint: false, high: false, pulsing: false };
  if (ratio < 0.9) return { color: MonikeColors.signalAmber, dangerTint: false, high: false, pulsing: false };
  if (ratio < 1) return { color: MonikeColors.signalRed, dangerTint: false, high: true, pulsing: true };
  return { color: MonikeColors.signalRed, dangerTint: true, high: true, pulsing: false };
}

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const totalPulse = useRef(new Animated.Value(1)).current;
  const dangerPulse = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(280)).current;
  const successIcon = useRef(new Animated.Value(0)).current;
  const warningShake = useRef(new Animated.Value(0)).current;

  const [selectedDate, setSelectedDate] = useState(DEMO_TODAY);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [focusedKey, setFocusedKey] = useState<EntryKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [values, setValues] = useState<Record<EntryKey, string>>({
    person: '',
    pos: '',
    data: '',
    airtime: '',
    food: '',
    online: '',
    electricity: '',
    other: '',
    savings: '',
    income: '',
  });

  const spendTotal = useMemo(
    () => allSpendKeys.reduce((sum, key) => sum + parseAmount(values[key] ?? ''), 0),
    [values]
  );
  const enteredCategories = useMemo(
    () => allSpendKeys.filter((key) => parseAmount(values[key] ?? '') > 0).length,
    [values]
  );
  const palette = spendPalette(spendTotal);
  const progress = Math.min(100, (spendTotal / DAILY_THRESHOLD) * 100);
  const hasData = spendTotal > 0 || parseAmount(values.income) > 0;

  useEffect(() => {
    totalPulse.setValue(0.96);
    Animated.spring(totalPulse, {
      toValue: 1,
      speed: 22,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [spendTotal, totalPulse]);

  useEffect(() => {
    if (!palette.pulsing) return;
    dangerPulse.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dangerPulse, { toValue: 0.58, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(dangerPulse, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dangerPulse, palette.pulsing]);

  useEffect(() => {
    if (!successVisible) return;
    sheetTranslate.setValue(280);
    successIcon.setValue(0);
    warningShake.setValue(0);
    Animated.parallel([
      Animated.timing(sheetTranslate, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(successIcon, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      palette.high
        ? Animated.sequence([
            Animated.timing(warningShake, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue: -1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(warningShake, { toValue: 0, duration: 70, useNativeDriver: true }),
          ])
        : Animated.timing(warningShake, { toValue: 0, duration: 1, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(dismissSuccess, 2500);
    return () => clearTimeout(timer);
  }, [palette.high, sheetTranslate, successIcon, successVisible, warningShake]);

  const updateValue = (key: EntryKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') }));
  };

  const focusInput = (key: EntryKey) => inputRefs.current[key]?.focus();

  const moveDay = (amount: number) => {
    const next = addDays(selectedDate, amount);
    if (next > DEMO_TODAY) return;
    setSelectedDate(next);
  };

  const saveEntry = () => {
    if (!hasData || saving) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccessVisible(true);
    }, 450);
  };

  const clearForm = () => {
    setValues({ person: '', pos: '', data: '', airtime: '', food: '', online: '', electricity: '', other: '', savings: '', income: '' });
    setFocusedKey(null);
    setOtherOpen(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const dismissSuccess = () => {
    Animated.timing(sheetTranslate, { toValue: 280, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setSuccessVisible(false);
      clearForm();
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>LOG SPEND</Text>
          <View style={styles.dateRow}>
            <Pressable style={styles.dateArrow} onPress={() => moveDay(-1)}>
              <ChevronLeft size={22} color={MonikeColors.inkSecondary} strokeWidth={2} />
            </Pressable>
            <Pressable style={styles.datePill} onPress={() => setDatePickerOpen(true)}>
              <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
            </Pressable>
            <Pressable style={styles.dateArrow} disabled={dateKey(selectedDate) === dateKey(DEMO_TODAY)} onPress={() => moveDay(1)}>
              <ChevronRight
                size={22}
                color={dateKey(selectedDate) === dateKey(DEMO_TODAY) ? MonikeColors.inkMuted : MonikeColors.inkSecondary}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </View>

        <View style={[styles.totalCard, palette.dangerTint && styles.totalCardDanger]}>
          <View style={styles.totalCopy}>
            <Animated.Text style={[styles.totalValue, { color: palette.color, opacity: palette.pulsing ? dangerPulse : 1, transform: [{ scale: totalPulse }] }] }>
              ₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}
            </Animated.Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: palette.color }]} />
            </View>
          </View>
          <View style={styles.limitCopy}>
            <Text style={styles.limitText}>OF ₦{formatNaira(DAILY_THRESHOLD, 0)} LIMIT</Text>
            <Text style={styles.categoryCount}>{enteredCategories} categories entered</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 96 }]}
        >
          <SectionLabel>COMMON</SectionLabel>
          {commonCategories.map((category) => (
            <CategoryRow
              key={category.key}
              category={category}
              focused={focusedKey === category.key}
              value={values[category.key]}
              onChange={(value) => updateValue(category.key, value)}
              onFocus={() => setFocusedKey(category.key)}
              onPress={() => focusInput(category.key)}
              refSetter={(node) => { inputRefs.current[category.key] = node; }}
            />
          ))}

          <Pressable style={styles.showMoreRow} onPress={() => setOtherOpen((open) => !open)}>
            <Text style={styles.showMoreText}>{otherOpen ? 'Hide categories' : 'Show more categories'}</Text>
            <ChevronDown size={16} color={MonikeColors.inkMuted} style={{ transform: [{ rotate: otherOpen ? '180deg' : '0deg' }] }} />
          </Pressable>

          {otherOpen ? (
            <>
              <SectionLabel>OTHER</SectionLabel>
              {otherCategories.map((category) => (
                <CategoryRow
                  key={category.key}
                  category={category}
                  focused={focusedKey === category.key}
                  value={values[category.key]}
                  onChange={(value) => updateValue(category.key, value)}
                  onFocus={() => setFocusedKey(category.key)}
                  onPress={() => focusInput(category.key)}
                  refSetter={(node) => { inputRefs.current[category.key] = node; }}
                />
              ))}
            </>
          ) : null}

          <View style={styles.savingsDivider} />
          <SavingsRow
            focused={focusedKey === 'savings'}
            value={values.savings}
            onChange={(value) => updateValue('savings', value)}
            onFocus={() => setFocusedKey('savings')}
            onPress={() => focusInput('savings')}
            refSetter={(node) => { inputRefs.current.savings = node; }}
          />

          <View style={styles.incomeCard}>
            <Text style={styles.incomeHeader}>MONEY RECEIVED TODAY</Text>
            <View style={[styles.incomeField, focusedKey === 'income' && styles.incomeFieldFocused]}>
              <Text style={styles.incomePrefix}>₦</Text>
              <TextInput
                ref={(node) => { inputRefs.current.income = node; }}
                value={values.income}
                onChangeText={(value) => updateValue('income', value)}
                onFocus={() => setFocusedKey('income')}
                onBlur={() => setFocusedKey(null)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={MonikeColors.inkMuted}
                style={styles.incomeInput}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.saveDock, { bottom: insets.bottom + 68 + 12 }] }>
        <Pressable
          disabled={!hasData || saving}
          style={[styles.saveButton, !hasData && styles.saveButtonEmpty, hasData && palette.high && styles.saveButtonHigh]}
          onPress={saveEntry}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MonikeColors.bgVoid} />
          ) : (
            <>
              <Text style={[styles.saveText, !hasData && styles.saveTextEmpty]}>SAVE TODAY&apos;S ENTRY</Text>
              <Text style={[styles.saveSubtext, !hasData && styles.saveTextEmpty]}>₦{formatNaira(spendTotal, spendTotal % 1 ? 2 : 0)}</Text>
            </>
          )}
        </Pressable>
      </View>

      <BottomNavigation activeRoute="log" />
      <DatePickerModal
        visible={datePickerOpen}
        selectedDate={selectedDate}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(date) => {
          setSelectedDate(date);
          setDatePickerOpen(false);
        }}
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

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function CategoryRow({
  category,
  focused,
  onChange,
  onFocus,
  onPress,
  refSetter,
  value,
}: {
  category: CategoryInput;
  focused: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onPress: () => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const amount = parseAmount(value);
  const entered = amount > 0;
  const Icon = category.Icon;

  return (
    <Pressable style={[styles.categoryRow, entered && styles.categoryRowEntered]} onPress={onPress}>
      <View style={styles.categoryIconShell}>
        <Icon size={19} color={entered ? MonikeColors.accentPulse : MonikeColors.inkSecondary} strokeWidth={1.8} />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={styles.categoryName}>{category.label}</Text>
        <Text style={styles.categoryAverage}>usually ₦{formatNaira(category.average)}</Text>
      </View>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={() => undefined}
        refSetter={refSetter}
        tint={MonikeColors.accentPulse}
      />
    </Pressable>
  );
}

function SavingsRow({
  focused,
  onChange,
  onFocus,
  onPress,
  refSetter,
  value,
}: {
  focused: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onPress: () => void;
  refSetter: (node: TextInput | null) => void;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  return (
    <Pressable style={[styles.categoryRow, styles.savingsRow, entered && styles.categoryRowEntered]} onPress={onPress}>
      <View style={[styles.categoryIconShell, styles.savingsIconShell]}>
        <TrendingUp size={20} color={MonikeColors.accentPulse} strokeWidth={1.9} />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={styles.savingsLabel}>Moved to Savings</Text>
        <Text style={styles.categoryAverage}>future you says thanks</Text>
      </View>
      <CurrencyInput
        focused={focused}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={() => undefined}
        refSetter={refSetter}
        tint={MonikeColors.signalBlue}
      />
    </Pressable>
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
  onChange: (value: string) => void;
  onFocus: () => void;
  refSetter: (node: TextInput | null) => void;
  tint: string;
  value: string;
}) {
  const entered = parseAmount(value) > 0;
  return (
    <View style={[styles.inputShell, focused && { borderColor: tint, shadowColor: tint, shadowOpacity: 0.2, shadowRadius: 8 }, focused && styles.inputShellFocused]}>
      <Text style={styles.currencyPrefix}>₦</Text>
      <TextInput
        ref={refSetter}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        placeholderTextColor={MonikeColors.inkMuted}
        style={[styles.amountInput, entered && styles.amountInputEntered]}
      />
    </View>
  );
}

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
  const dates = Array.from({ length: 7 }, (_, index) => addDays(DEMO_TODAY, index - 6)).reverse();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <View style={styles.calendarCard}>
          <Text style={styles.calendarTitle}>Select date</Text>
          {dates.map((date) => {
            const selected = dateKey(date) === dateKey(selectedDate);
            return (
              <Pressable key={dateKey(date)} style={[styles.dateOption, selected && styles.dateOptionSelected]} onPress={() => onSelect(date)}>
                <Text style={[styles.dateOptionText, selected && styles.dateOptionTextSelected]}>{formatDateLabel(date)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

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
  const shakeX = warningShake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.successScrim} onPress={onDismiss}>
        <Animated.View style={[styles.successSheet, { transform: [{ translateY }] }] }>
          <View style={styles.handle} />
          <Animated.View style={{ opacity: iconProgress, transform: [{ scale: iconProgress }, { translateX: high ? shakeX : 0 }] }}>
            {high ? <AlertTriangle size={40} color={iconColor} strokeWidth={2} /> : <Check size={40} color={iconColor} strokeWidth={2.4} />}
          </Animated.View>
          <Text style={[styles.successTitle, { color: iconColor }]}>{high ? 'HIGH SPEND DAY' : 'ENTRY SAVED'}</Text>
          <Text style={styles.successBody}>
            {high
              ? `₦${formatNaira(total, total % 1 ? 2 : 0)} logged — above your ₦${formatNaira(DAILY_THRESHOLD, 2)} daily threshold.`
              : `₦${formatNaira(total, total % 1 ? 2 : 0)} logged for today. You're on track.`}
          </Text>
          {high ? (
            <View style={styles.tipCard}>
              <Text style={styles.tipLabel}>TIP</Text>
              <Text style={styles.tipText}>Review Food & Dining and POS purchases first — they usually move the needle fastest.</Text>
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  headerBlock: { paddingHorizontal: ScreenPadding, paddingTop: 12, paddingBottom: 12 },
  screenTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700', letterSpacing: 0.7 },
  dateRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  datePill: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '600' },
  totalCard: { marginHorizontal: ScreenPadding, borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  totalCardDanger: { backgroundColor: '#251113', borderColor: '#FF3D3D55' },
  totalCopy: { flex: 1 },
  totalValue: { fontFamily: Fonts.mono, fontSize: 36, fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 999 },
  limitCopy: { alignItems: 'flex-end', gap: 6 },
  limitText: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
  categoryCount: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 14 },
  sectionLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 10, marginBottom: 8 },
  categoryRow: { minHeight: 64, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8, backgroundColor: 'transparent', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  categoryRowEntered: { backgroundColor: MonikeColors.bgStripe, borderLeftColor: MonikeColors.accentPulse },
  categoryIconShell: { width: 40, height: 40, borderRadius: 20, backgroundColor: MonikeColors.bgElevated, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryName: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },
  categoryAverage: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  inputShell: { width: 120, height: 44, borderRadius: 10, backgroundColor: MonikeColors.bgElevated, borderWidth: 1, borderColor: MonikeColors.inkGhost, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 8 },
  inputShellFocused: { shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  currencyPrefix: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 16 },
  amountInput: { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700', textAlign: 'right', paddingVertical: 0 },
  amountInputEntered: { color: MonikeColors.accentPulse },
  showMoreRow: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: MonikeColors.inkGhost, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 4 },
  showMoreText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600' },
  savingsDivider: { height: 1, backgroundColor: MonikeColors.inkGhost, marginVertical: 14 },
  savingsRow: { marginBottom: 16 },
  savingsIconShell: { backgroundColor: '#00E67614' },
  savingsLabel: { color: MonikeColors.accentPulse, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600' },
  incomeCard: { marginTop: 6, borderRadius: CardRadius, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  incomeHeader: { color: MonikeColors.signalBlue, fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  incomeField: { height: 52, borderRadius: 12, backgroundColor: 'rgba(79,195,247,0.06)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.3)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  incomeFieldFocused: { borderColor: MonikeColors.signalBlue, shadowColor: MonikeColors.signalBlue, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  incomePrefix: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 18 },
  incomeInput: { flex: 1, color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700', textAlign: 'right', paddingVertical: 0 },
  saveDock: { position: 'absolute', left: 20, right: 20, zIndex: 20 },
  saveButton: { height: 56, borderRadius: 14, backgroundColor: MonikeColors.accentPulse, alignItems: 'center', justifyContent: 'center' },
  saveButtonHigh: { backgroundColor: MonikeColors.signalRed },
  saveButtonEmpty: { backgroundColor: MonikeColors.bgElevated },
  saveText: { color: MonikeColors.bgVoid, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '700', letterSpacing: 0.35 },
  saveSubtext: { color: 'rgba(0,0,0,0.5)', fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700', marginTop: 3 },
  saveTextEmpty: { color: MonikeColors.inkMuted },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  calendarCard: { width: '100%', maxWidth: 360, borderRadius: 20, backgroundColor: MonikeColors.bgOverlay, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 16 },
  calendarTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  dateOption: { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12 },
  dateOptionSelected: { backgroundColor: '#00E67616' },
  dateOptionText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13 },
  dateOptionTextSelected: { color: MonikeColors.accentPulse, fontWeight: '700' },
  successScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  successSheet: { height: 280, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: MonikeColors.bgOverlay, alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderColor: MonikeColors.inkGhost },
  handle: { width: 44, height: 4, borderRadius: 999, backgroundColor: MonikeColors.inkGhost, marginBottom: 28 },
  successTitle: { fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700', marginTop: 14, letterSpacing: 0.6 },
  successBody: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  tipCard: { marginTop: 18, borderRadius: 14, backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost, padding: 12, width: '100%' },
  tipLabel: { color: MonikeColors.signalAmber, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', marginBottom: 5 },
  tipText: { color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17 },
});

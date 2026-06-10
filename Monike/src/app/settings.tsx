import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  Calendar,
  ChevronRight,
  Fingerprint,
  Key,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { mutateAll } from '@/hooks/use-swr';
import { MonikeHeader } from '@/components/monike-header';
import { useAppLock } from '@/components/app-lock';
import { CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { API_BASE_URL, apiPost, apiFetch } from '@/services/api';
import { useSWR } from '@/hooks/use-swr';

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsData = {
  display_name: string;
  email: string;
  monthly_budget: number;
  high_spend_threshold: number;
  notify_high_spend: boolean;
  notify_weekly_summary: boolean;
  notify_model_updates: boolean;
};

type ModelStatus = {
  trained: boolean;
  last_trained_at: string | null;
  training_rows: number;
  accuracy: number | null;
  model_version: string;
};

type RetrainResult = {
  success: boolean;
  message: string;
  training_rows: number;
  accuracy: number;
  duration_ms: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(value: number) {
  return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(value)}`;
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────

function ShimmerBlock({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.06)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.16, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.06, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ backgroundColor: MonikeColors.inkPrimary, borderRadius: 8 }, { opacity }, style]} />;
}

function SettingsSkeleton() {
  return (
    <View style={{ gap: 20, paddingTop: 8 }}>
      <ShimmerBlock style={{ height: 88, borderRadius: CardRadius }} />
      <ShimmerBlock style={{ height: 116, borderRadius: CardRadius }} />
      <ShimmerBlock style={{ height: 154, borderRadius: CardRadius }} />
      <ShimmerBlock style={{ height: 140, borderRadius: CardRadius }} />
      <ShimmerBlock style={{ height: 176, borderRadius: CardRadius }} />
    </View>
  );
}

// ─── Icon Box ─────────────────────────────────────────────────────────────────

function IconBox({ icon, color }: { icon: React.ReactNode; color: string }) {
  return (
    <View style={[s.iconBox, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
      {icon}
    </View>
  );
}

// ─── Profile Hero Card ────────────────────────────────────────────────────────

function ProfileCard({ name, email }: { name: string; email: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  return (
    <View style={s.profileCard}>
      <View style={s.profileGrid} pointerEvents="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[s.profileGridLine, { top: 18 + i * 18 }]} />
        ))}
      </View>
      <View style={s.profileInner}>
        <View style={s.profileAvatarWrap}>
          <Text style={s.profileAvatarLetter}>{initial}</Text>
        </View>
        <View style={s.profileCopy}>
          <Text style={s.profileName}>{name}</Text>
          <Text style={s.profileEmail}>{email}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={s.sectionLabel}>{title}</Text>;
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ children }: { children: React.ReactNode }) {
  return <View style={s.groupCard}>{children}</View>;
}

function GroupDivider() {
  return <View style={s.groupDivider} />;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({
  icon,
  label,
  sublabel,
  value,
  right,
  onPress,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, pressed && !!onPress && s.rowPressed]}
    >
      {icon ? <View style={s.rowIconSlot}>{icon}</View> : null}
      <View style={s.rowLeft}>
        <Text style={[s.rowLabel, danger && { color: MonikeColors.signalRed }]}>{label}</Text>
        {sublabel ? <Text style={s.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right !== undefined ? right : (
        <View style={s.rowRight}>
          {value ? <Text style={s.rowValue}>{value}</Text> : null}
          {onPress ? <ChevronRight size={14} color={MonikeColors.inkGhost} strokeWidth={2} /> : null}
        </View>
      )}
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  sublabel,
  value,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row
      icon={icon}
      label={label}
      sublabel={sublabel}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: MonikeColors.bgElevated, true: `${MonikeColors.accentOrange}55` }}
          thumbColor={value ? MonikeColors.accentOrange : MonikeColors.inkMuted}
          ios_backgroundColor={MonikeColors.bgElevated}
        />
      }
    />
  );
}

// ─── Budget Edit Sheet ────────────────────────────────────────────────────────

function BudgetSheet({
  visible,
  title,
  sublabel,
  initialValue,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  sublabel?: string;
  initialValue: number;
  saving: boolean;
  onClose: () => void;
  onSave: (v: number) => void;
}) {
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (visible) setRaw(String(initialValue));
  }, [visible, initialValue]);

  const handleSave = () => {
    const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) onSave(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={bs.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={bs.kav}>
        <View style={bs.sheet}>
          <View style={bs.handle} />
          <View style={bs.header}>
            <View style={bs.headerText}>
              <Text style={bs.title}>{title}</Text>
              {sublabel ? <Text style={bs.subtitle}>{sublabel}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={bs.closeBtn} hitSlop={8}>
              <X size={18} color={MonikeColors.inkSecondary} />
            </Pressable>
          </View>
          <View style={bs.inputRow}>
            <Text style={bs.currencyLabel}>₦</Text>
            <TextInput
              style={bs.input}
              value={raw}
              keyboardType="numeric"
              autoFocus
              onChangeText={setRaw}
              selectionColor={MonikeColors.accentOrange}
              placeholderTextColor={MonikeColors.inkMuted}
              placeholder="0"
            />
          </View>
          <View style={bs.actions}>
            <Pressable style={bs.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={bs.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[bs.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={bs.saveText}>Save</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Auto-lock Selector ────────────────────────────────────────────────────────

function AutoLockSelector({
  value,
  onChange,
}: {
  value: 5 | 30;
  onChange: (v: 5 | 30) => void;
}) {
  const OPTIONS: { label: string; value: 5 | 30 }[] = [
    { label: '5 min', value: 5 },
    { label: '30 min', value: 30 },
  ];
  return (
    <Row
      icon={<IconBox icon={<Timer size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
      label="Auto-lock"
      sublabel="Lock when app is backgrounded"
      right={
        <View style={s.segmentControl}>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[s.segmentOption, value === opt.value && s.segmentOptionActive]}
              onPress={() => void onChange(opt.value)}
            >
              <Text style={[s.segmentOptionText, value === opt.value && s.segmentOptionTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      }
    />
  );
}

// ─── Security Status Header ────────────────────────────────────────────────────

function SecurityStatusHeader({ biometricEnabled }: { biometricEnabled: boolean }) {
  const activeCount = 2 + (biometricEnabled ? 1 : 0);
  return (
    <View style={s.securityHeader}>
      <View style={s.securityShieldBox}>
        <ShieldCheck size={20} color={MonikeColors.accentOrange} strokeWidth={1.6} />
      </View>
      <View style={s.securityHeaderCopy}>
        <Text style={s.securityTitle}>Protected</Text>
        <Text style={s.securitySub}>{activeCount} / 3 features enabled</Text>
      </View>
    </View>
  );
}

// ─── Model Status Card ────────────────────────────────────────────────────────

function ModelStatusCard({
  status,
  retraining,
  retrainProgress,
  onRetrain,
}: {
  status?: ModelStatus;
  retraining: boolean;
  retrainProgress: string;
  onRetrain: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!retraining) { spin.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [retraining, spin]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.7, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.3, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseOpacity]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const accuracy = status?.accuracy != null ? `${(status.accuracy * 100).toFixed(1)}%` : '—';
  const lastTrained = status?.last_trained_at
    ? new Date(status.last_trained_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Never';
  const trained = status?.trained ?? false;

  return (
    <View style={s.modelCard}>
      <View style={s.modelHeader}>
        <View style={s.modelStatusPill}>
          <Animated.View style={[s.modelPulseDot, { opacity: pulseOpacity, backgroundColor: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]} />
          <View style={[s.modelCoreDot, { backgroundColor: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]} />
          <Text style={[s.modelStatusText, { color: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]}>
            {trained ? 'Active' : 'Untrained'}
          </Text>
        </View>
        <Text style={s.modelVersionText}>{status?.model_version ?? 'v0'}</Text>
      </View>

      <View style={s.modelStats}>
        <View style={s.modelStat}>
          <Text style={s.modelStatVal}>{(status?.training_rows ?? 0).toLocaleString()}</Text>
          <Text style={s.modelStatKey}>rows</Text>
        </View>
        <View style={s.modelStatDivider} />
        <View style={s.modelStat}>
          <Text style={[s.modelStatVal, trained && { color: MonikeColors.accentPulse }]}>{accuracy}</Text>
          <Text style={s.modelStatKey}>accuracy</Text>
        </View>
        <View style={s.modelStatDivider} />
        <View style={s.modelStat}>
          <Text style={s.modelStatVal} numberOfLines={1} adjustsFontSizeToFit>{lastTrained}</Text>
          <Text style={s.modelStatKey}>last trained</Text>
        </View>
      </View>

      <Pressable
        style={[s.retrainBtn, retraining && s.retrainBtnActive]}
        onPress={onRetrain}
        disabled={retraining}
      >
        {retraining ? (
          <>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <RefreshCw size={14} color={MonikeColors.inkSecondary} strokeWidth={2} />
            </Animated.View>
            <Text style={[s.retrainBtnText, { color: MonikeColors.inkSecondary }]}>
              {retrainProgress || 'Training…'}
            </Text>
          </>
        ) : (
          <>
            <BrainCircuit size={14} color="#fff" strokeWidth={2} />
            <Text style={s.retrainBtnText}>Retrain model</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// ─── Upload Card ──────────────────────────────────────────────────────────────

function UploadCard() {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (uploading) {
      Animated.loop(
        Animated.timing(progressAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ).start();
    } else {
      progressAnim.setValue(0);
    }
  }, [uploading, progressAnim]);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['20%', '90%'] });

  const pickAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setUploading(true);
      setUploadStatus('Uploading…');
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as any);

      const uploadResp = await fetch(`${API_BASE_URL}/log/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResp.ok) {
        const err = await uploadResp.json();
        throw new Error(err.detail ?? 'Upload failed');
      }
      const { job_id } = await uploadResp.json();
      setUploadStatus('Processing…');

      const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/upload/${job_id}`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === 'started') {
          setUploadStatus(`Parsing ${msg.total} rows…`);
        } else if (msg.event === 'dedup') {
          setUploadStatus(`${msg.kept} new · ${msg.skipped} skipped`);
        } else if (msg.event === 'progress') {
          setUploadStatus(`${msg.done}/${msg.total} inserted`);
        } else if (msg.event === 'complete') {
          const r = msg.result;
          setUploadStatus(`✓ ${r.new_days_inserted} new days · ${r.duplicate_transactions_skipped} dupes skipped`);
          setUploading(false);
          ws.close();
        } else if (msg.event === 'error') {
          setUploadError(msg.message);
          setUploading(false);
          ws.close();
        }
      };
      ws.onerror = () => {
        setUploadError('WebSocket connection failed');
        setUploading(false);
      };
    } catch (err: any) {
      setUploadError(err.message ?? 'Unknown error');
      setUploading(false);
    }
  };

  return (
    <View style={s.uploadCard}>
      <View style={s.uploadTop}>
        <View style={s.uploadIconBox}>
          <Upload size={18} color={MonikeColors.accentOrange} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.uploadTitle}>Import statement</Text>
          <Text style={s.uploadSubtitle}>OPay · .xlsx  ·  .xls  ·  .csv</Text>
        </View>
        <Pressable
          style={[s.uploadChooseBtn, uploading && { opacity: 0.45 }]}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color={MonikeColors.inkMuted} style={{ width: 40 }} />
            : <Text style={s.uploadChooseBtnText}>Browse</Text>
          }
        </Pressable>
      </View>
      {uploading && (
        <View style={s.uploadProgressTrack}>
          <Animated.View style={[s.uploadProgressFill, { width: progressWidth }]} />
        </View>
      )}
      {uploadStatus && !uploadError ? (
        <Text style={s.uploadStatusText}>{uploadStatus}</Text>
      ) : null}
      {uploadError ? (
        <View style={s.uploadErrorRow}>
          <AlertTriangle size={11} color={MonikeColors.signalRed} />
          <Text style={s.uploadErrorText}>{uploadError}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [retraining, setRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState('');
  const [budgetSheet, setBudgetSheet] = useState<null | {
    field: 'monthly_budget' | 'high_spend_threshold';
    title: string;
    sublabel: string;
  }>(null);
  const [sheetSaving, setSheetSaving] = useState(false);

  const { data: settingsData, isLoading: settingsLoading, mutate: mutateSettings } = useSWR<SettingsData>('/settings', apiFetch);
  const { data: modelStatus, isLoading: modelLoading, mutate: mutateModel } = useSWR<ModelStatus>('/model/status', apiFetch);
  const {
    autoLockMinutes,
    beginPinChange,
    biometricAvailable,
    biometricEnabled,
    setAutoLockMinutes,
    setBiometricEnabled,
  } = useAppLock();

  const [form, setForm] = useState<SettingsData>({
    display_name: 'Chijioke',
    email: 'chijioke@monike.app',
    monthly_budget: 0,
    high_spend_threshold: 5000,
    notify_high_spend: true,
    notify_weekly_summary: true,
    notify_model_updates: false,
  });

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (settingsData) setForm(settingsData);
  }, [settingsData]);

  const saveField = useCallback(async <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    const prev = formRef.current;
    const next = { ...prev, [key]: value };
    setForm(next);
    try {
      await apiPost('/settings', next);
      mutateSettings();
    } catch (e: any) {
      setForm(prev);
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    }
  }, [mutateSettings]);

  const handleSheetSave = async (value: number) => {
    if (!budgetSheet) return;
    const prev = formRef.current;
    const next = { ...prev, [budgetSheet.field]: value };
    setSheetSaving(true);
    try {
      setForm(next);
      await apiPost('/settings', next);
      mutateSettings();
      setBudgetSheet(null);
    } catch (e: any) {
      setForm(prev);
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    } finally {
      setSheetSaving(false);
    }
  };

  const handleRetrain = async () => {
    if (retraining) return;
    setRetraining(true);
    setRetrainProgress('Loading data…');
    try {
      const result: RetrainResult = await apiPost('/retrain', {});
      const secs = (result.duration_ms / 1000).toFixed(1);
      setRetrainProgress(`Done — ${(result.accuracy * 100).toFixed(1)}% · ${result.training_rows.toLocaleString()} rows · ${secs}s`);
      mutateModel();
      setTimeout(() => setRetrainProgress(''), 5000);
    } catch (e: any) {
      setRetrainProgress('');
      Alert.alert('Retrain failed', e.message ?? 'Unknown error');
    } finally {
      setRetraining(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear cache',
      'Forces dashboard, prediction, and explore data to reload from the database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiPost('/cache/clear');
              mutateAll();
              Alert.alert('Done', 'All data reloading.');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <MonikeHeader title="Settings" back />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {settingsLoading ? (
            <SettingsSkeleton />
          ) : (
            <>
              {/* ── Profile ──────────────────────────────────────── */}
              <ProfileCard name={form.display_name} email={form.email} />

              {/* ── Spending Limits ───────────────────────────────── */}
              <View style={s.section}>
                <SectionLabel title="SPENDING LIMITS" />
                <GroupCard>
                  <Row
                    icon={<IconBox icon={<Wallet size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="Monthly budget"
                    sublabel="Dashboard spend bar target"
                    value={form.monthly_budget > 0 ? formatNaira(form.monthly_budget) : 'Not set'}
                    onPress={() => setBudgetSheet({
                      field: 'monthly_budget',
                      title: 'Monthly Budget',
                      sublabel: 'Dashboard spend bar target',
                    })}
                  />
                  <GroupDivider />
                  <Row
                    icon={<IconBox icon={<AlertTriangle size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="High-spend threshold"
                    sublabel="Flags a day as high risk"
                    value={formatNaira(form.high_spend_threshold)}
                    onPress={() => setBudgetSheet({
                      field: 'high_spend_threshold',
                      title: 'High-Spend Threshold',
                      sublabel: 'Flags a day as high risk in charts',
                    })}
                  />
                </GroupCard>
                <Text style={s.footNote}>Changes apply live — caches clear automatically.</Text>
              </View>

              {/* ── Notifications ─────────────────────────────────── */}
              <View style={s.section}>
                <SectionLabel title="NOTIFICATIONS" />
                <GroupCard>
                  <ToggleRow
                    icon={<IconBox icon={<Bell size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="High-spend alerts"
                    sublabel="When daily spend exceeds threshold"
                    value={form.notify_high_spend}
                    onChange={(v) => void saveField('notify_high_spend', v)}
                  />
                  <GroupDivider />
                  <ToggleRow
                    icon={<IconBox icon={<Calendar size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="Weekly summary"
                    sublabel="Every Monday morning"
                    value={form.notify_weekly_summary}
                    onChange={(v) => void saveField('notify_weekly_summary', v)}
                  />
                  <GroupDivider />
                  <ToggleRow
                    icon={<IconBox icon={<BrainCircuit size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="Model update alerts"
                    sublabel="When retraining completes"
                    value={form.notify_model_updates}
                    onChange={(v) => void saveField('notify_model_updates', v)}
                  />
                </GroupCard>
              </View>

              {/* ── ML Model ──────────────────────────────────────── */}
              <View style={s.section}>
                <SectionLabel title="ML MODEL" />
                {modelLoading ? (
                  <ShimmerBlock style={{ height: 140, borderRadius: CardRadius }} />
                ) : (
                  <ModelStatusCard
                    status={modelStatus}
                    retraining={retraining}
                    retrainProgress={retrainProgress}
                    onRetrain={handleRetrain}
                  />
                )}
                <Text style={s.footNote}>
                  Retrain after importing new data to improve tomorrow's risk prediction.
                </Text>
              </View>

              {/* ── Data ──────────────────────────────────────────── */}
              <View style={s.section}>
                <SectionLabel title="DATA" />
                <UploadCard />
                <View style={{ height: 10 }} />
                <GroupCard>
                  <Row
                    icon={<IconBox icon={<Trash2 size={16} color={MonikeColors.signalRed} strokeWidth={1.8} />} color={MonikeColors.signalRed} />}
                    label="Clear app cache"
                    sublabel="Force reload of dashboard, explore & predictions"
                    onPress={handleClearCache}
                    danger
                  />
                </GroupCard>
              </View>

              {/* ── Security ──────────────────────────────────────── */}
              <View style={s.section}>
                <SectionLabel title="SECURITY" />
                <GroupCard>
                  <SecurityStatusHeader biometricEnabled={biometricEnabled} />
                  <View style={s.securityDivider} />
                  <Row
                    icon={<IconBox icon={<Key size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="Change PIN"
                    sublabel="Update the 4-digit startup PIN"
                    onPress={beginPinChange}
                  />
                  <GroupDivider />
                  <ToggleRow
                    icon={<IconBox icon={<Fingerprint size={16} color={MonikeColors.accentOrange} strokeWidth={1.8} />} color={MonikeColors.accentOrange} />}
                    label="Biometric unlock"
                    sublabel={
                      biometricAvailable
                        ? 'Face ID, Touch ID, or fingerprint'
                        : 'No enrolled biometrics on this device'
                    }
                    value={biometricEnabled}
                    onChange={(v) => void setBiometricEnabled(v)}
                  />
                  <GroupDivider />
                  <AutoLockSelector value={autoLockMinutes} onChange={(v) => void setAutoLockMinutes(v)} />
                </GroupCard>
              </View>

              <Text style={s.versionText}>MONIKE v1.0.0  ·  PostgreSQL monike</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Budget / Threshold Edit Sheet */}
      <BudgetSheet
        visible={budgetSheet !== null}
        title={budgetSheet?.title ?? ''}
        sublabel={budgetSheet?.sublabel}
        initialValue={budgetSheet ? form[budgetSheet.field] : 0}
        saving={sheetSaving}
        onClose={() => !sheetSaving && setBudgetSheet(null)}
        onSave={handleSheetSave}
      />
    </View>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────────────────

const ORANGE = MonikeColors.accentOrange;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: ScreenPadding, paddingTop: 12 },

  // Profile card
  profileCard: {
    borderRadius: CardRadius + 2,
    borderWidth: 1,
    borderColor: '#21282F',
    backgroundColor: MonikeColors.bgSurface,
    overflow: 'hidden',
    marginBottom: 24,
  },
  profileGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  profileGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: `${MonikeColors.inkGhost}30`,
  },
  profileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  profileAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: `${ORANGE}1A`,
    borderWidth: 1.5,
    borderColor: `${ORANGE}45`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLetter: {
    color: ORANGE,
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  profileCopy: { flex: 1, gap: 3 },
  profileName: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileEmail: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },

  // Section
  section: { gap: 8, marginBottom: 22 },
  sectionLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    paddingHorizontal: 4,
    marginBottom: 2,
  },

  // Group card — matches sectionCard in forecast/categories
  groupCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  groupDivider: {
    height: 1,
    backgroundColor: '#20262C',
  },

  // Row — matches featureRow in forecast
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowPressed: { backgroundColor: MonikeColors.bgElevated },
  rowIconSlot: { flexShrink: 0 },
  rowLeft: { flex: 1, gap: 2 },
  rowLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
  rowSublabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 15,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },

  // Icon box
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Security header inside GroupCard
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: `${ORANGE}08`,
  },
  securityShieldBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: `${ORANGE}18`,
    borderColor: `${ORANGE}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityHeaderCopy: { flex: 1, gap: 2 },
  securityTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },
  securitySub: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  securityDivider: {
    height: 1,
    backgroundColor: '#20262C',
  },

  // Segment control (auto-lock)
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#21282F',
    overflow: 'hidden',
  },
  segmentOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionActive: { backgroundColor: ORANGE },
  segmentOptionText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  segmentOptionTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Foot note
  footNote: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
    marginTop: 2,
  },

  // Model card
  modelCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
    borderRadius: CardRadius,
    padding: 16,
    gap: 14,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: '#21282F',
  },
  modelPulseDot: {
    position: 'absolute',
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modelCoreDot: { width: 6, height: 6, borderRadius: 3 },
  modelStatusText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  modelVersionText: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
  },
  modelStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#21282F',
    paddingVertical: 12,
  },
  modelStat: { flex: 1, alignItems: 'center', gap: 3 },
  modelStatVal: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  modelStatKey: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  modelStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#21282F',
  },
  retrainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 10,
    height: 42,
  },
  retrainBtnActive: { backgroundColor: MonikeColors.bgElevated },
  retrainBtnText: {
    color: '#fff',
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },

  // Upload card
  uploadCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
    borderRadius: CardRadius,
    padding: 14,
    gap: 10,
  },
  uploadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${ORANGE}12`,
    borderWidth: 1,
    borderColor: `${ORANGE}28`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  uploadSubtitle: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  uploadChooseBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#21282F',
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadChooseBtnText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },
  uploadProgressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: MonikeColors.bgElevated,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: 2,
    backgroundColor: ORANGE,
    borderRadius: 1,
  },
  uploadStatusText: {
    color: ORANGE,
    fontFamily: Fonts.mono,
    fontSize: 11,
    paddingHorizontal: 2,
  },
  uploadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  uploadErrorText: {
    color: MonikeColors.signalRed,
    fontFamily: Fonts.sans,
    fontSize: 11,
    flex: 1,
  },

  versionText: {
    textAlign: 'center',
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.7,
    marginBottom: 8,
  },
});

// ─── Budget Sheet Styles ──────────────────────────────────────────────────────

const bs = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: MonikeColors.bgSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#21282F',
    paddingHorizontal: 20,
    paddingBottom: 34,
    gap: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonikeColors.inkGhost,
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, gap: 3 },
  title: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#21282F',
    paddingHorizontal: 16,
    height: 60,
    gap: 8,
  },
  currencyLabel: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 24,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 24,
    fontWeight: '700',
    padding: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: '#21282F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    backgroundColor: MonikeColors.accentOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#fff',
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
});

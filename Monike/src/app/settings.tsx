import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
  ChevronRight,
  Database,
  RefreshCw,
  Shield,
  Sliders,
  Trash2,
  Upload,
  User,
  Fingerprint,
  Timer,
  Key,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { mutateAll } from '@/hooks/use-swr';
import { MonikeHeader } from '@/components/monike-header';
import { useAppLock } from '@/components/app-lock';
import { CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
import { apiPost, apiFetch } from '@/services/api';
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
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(value);
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
      <View style={{ gap: 12 }}>
        <ShimmerBlock style={{ height: 110, borderRadius: CardRadius }} />
        <ShimmerBlock style={{ height: 76, borderRadius: CardRadius }} />
        <ShimmerBlock style={{ height: 76, borderRadius: CardRadius }} />
        <ShimmerBlock style={{ height: 140, borderRadius: CardRadius }} />
      </View>
    </View>
  );
}

// ─── Profile Hero Card ────────────────────────────────────────────────────────

function ProfileCard({ name, email }: { name: string; email: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.profileCard}>
      {/* Subtle grid texture lines */}
      <View style={styles.profileGrid} pointerEvents="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.profileGridLine, { top: 18 + i * 18 }]} />
        ))}
      </View>

      <View style={styles.profileInner}>
        <View style={styles.profileAvatarWrap}>
          <Text style={styles.profileAvatarLetter}>{initial}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
        </View>
        <View style={styles.profileBadge}>
          <Text style={styles.profileBadgeText}>PRO</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionLabel}>
      {icon}
      <Text style={styles.sectionLabelText}>{title}</Text>
    </View>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────
// Wraps a list of rows in a single bordered card with internal dividers

function GroupCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.groupCard}>{children}</View>;
}

function GroupDivider() {
  return <View style={styles.groupDivider} />;
}

// ─── Row types ────────────────────────────────────────────────────────────────

function Row({
  label,
  sublabel,
  right,
  onPress,
  danger,
  first,
  last,
}: {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const bg = useRef(new Animated.Value(0)).current;

  const pressIn = () => {
    if (!onPress) return;
    Animated.timing(bg, { toValue: 1, duration: 50, useNativeDriver: false }).start();
  };
  const pressOut = () => {
    Animated.timing(bg, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const bgColor = bg.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', MonikeColors.bgElevated],
  });

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={!onPress}>
      <Animated.View style={[styles.row, { backgroundColor: bgColor }]}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowLabel, danger && { color: MonikeColors.signalRed }]}>{label}</Text>
          {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
        </View>
        {right !== undefined ? right : onPress ? (
          <ChevronRight size={14} color={MonikeColors.inkGhost} strokeWidth={2} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row
      label={label}
      sublabel={sublabel}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: MonikeColors.bgElevated, true: `${MonikeColors.accentPulse}55` }}
          thumbColor={value ? MonikeColors.accentPulse : MonikeColors.inkMuted}
          ios_backgroundColor={MonikeColors.bgElevated}
        />
      }
    />
  );
}

function NairaRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <Row
      label={label}
      sublabel={sublabel}
      right={
        <View style={[styles.nairaWrap, focused && styles.nairaWrapFocused]}>
          <Text style={styles.nairaSymbol}>₦</Text>
          <TextInput
            style={styles.nairaInput}
            value={raw}
            keyboardType="numeric"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
              if (!isNaN(parsed) && parsed > 0) {
                onChange(parsed);
                setRaw(String(parsed));
              } else {
                setRaw(String(value));
              }
            }}
            onChangeText={setRaw}
            placeholderTextColor={MonikeColors.inkMuted}
            selectionColor={MonikeColors.accentPulse}
          />
        </View>
      }
    />
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
    <View style={styles.modelCard}>
      {/* Status badge row */}
      <View style={styles.modelHeader}>
        <View style={styles.modelStatusPill}>
          <Animated.View style={[styles.modelPulseDot, { opacity: pulseOpacity, backgroundColor: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]} />
          <View style={[styles.modelCoreDot, { backgroundColor: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]} />
          <Text style={[styles.modelStatusText, { color: trained ? MonikeColors.accentPulse : MonikeColors.signalAmber }]}>
            {trained ? 'Active' : 'Untrained'}
          </Text>
        </View>
        <Text style={styles.modelVersionText}>{status?.model_version ?? 'v0'}</Text>
      </View>

      {/* Stats */}
      <View style={styles.modelStats}>
        <View style={styles.modelStat}>
          <Text style={styles.modelStatVal}>{status?.training_rows ?? 0}</Text>
          <Text style={styles.modelStatKey}>rows</Text>
        </View>
        <View style={styles.modelStatDivider} />
        <View style={styles.modelStat}>
          <Text style={[styles.modelStatVal, trained && { color: MonikeColors.accentPulse }]}>{accuracy}</Text>
          <Text style={styles.modelStatKey}>accuracy</Text>
        </View>
        <View style={styles.modelStatDivider} />
        <View style={styles.modelStat}>
          <Text style={styles.modelStatVal}>{lastTrained}</Text>
          <Text style={styles.modelStatKey}>last trained</Text>
        </View>
      </View>

      {/* Retrain button */}
      <Pressable
        style={[styles.retrainBtn, retraining && styles.retrainBtnDisabled]}
        onPress={onRetrain}
        disabled={retraining}
      >
        {retraining ? (
          <>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <RefreshCw size={14} color={MonikeColors.bgVoid} strokeWidth={2} />
            </Animated.View>
            <Text style={styles.retrainBtnText}>{retrainProgress || 'Training…'}</Text>
          </>
        ) : (
          <>
            <BrainCircuit size={14} color={MonikeColors.bgVoid} strokeWidth={2} />
            <Text style={styles.retrainBtnText}>Retrain model</Text>
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

      const uploadResp = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/log/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResp.ok) {
        const err = await uploadResp.json();
        throw new Error(err.detail ?? 'Upload failed');
      }
      const { job_id } = await uploadResp.json();
      setUploadStatus('Processing…');

      const wsUrl = `${(process.env.EXPO_PUBLIC_API_URL ?? '').replace('http', 'ws')}/ws/upload/${job_id}`;
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
    <View style={styles.uploadCard}>
      <View style={styles.uploadTop}>
        <View style={styles.uploadIconBox}>
          <Upload size={18} color={MonikeColors.accentPulse} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.uploadTitle}>Import statement</Text>
          <Text style={styles.uploadSubtitle}>OPay · .xlsx  ·  .xls  ·  .csv</Text>
        </View>
        <Pressable
          style={[styles.uploadChooseBtn, uploading && { opacity: 0.45 }]}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color={MonikeColors.inkMuted} style={{ width: 40 }} />
            : <Text style={styles.uploadChooseBtnText}>Browse</Text>
          }
        </Pressable>
      </View>

      {/* Progress track — only shown while uploading */}
      {uploading && (
        <View style={styles.uploadProgressTrack}>
          <Animated.View style={[styles.uploadProgressFill, { width: progressWidth }]} />
        </View>
      )}

      {/* Status / error */}
      {uploadStatus && !uploadError ? (
        <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
      ) : null}
      {uploadError ? (
        <View style={styles.uploadErrorRow}>
          <AlertTriangle size={11} color={MonikeColors.signalRed} />
          <Text style={styles.uploadErrorText}>{uploadError}</Text>
        </View>
      ) : null}
    </View>
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
      label="Auto-lock"
      sublabel="Lock when app is backgrounded"
      right={
        <View style={styles.segmentControl}>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.segmentOption, value === opt.value && styles.segmentOptionActive]}
              onPress={() => void onChange(opt.value)}
            >
              <Text style={[styles.segmentOptionText, value === opt.value && styles.segmentOptionTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      }
    />
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState('');

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

  useEffect(() => {
    if (settingsData) setForm(settingsData);
  }, [settingsData]);

  const patch = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiPost('/settings', form);
      mutateSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetrain = async () => {
    if (retraining) return;
    setRetraining(true);
    setRetrainProgress('Loading data…');
    try {
      const result: RetrainResult = await apiPost('/retrain', {});
      setRetrainProgress(`Done — ${(result.accuracy * 100).toFixed(1)}%`);
      mutateModel();
      setTimeout(() => setRetrainProgress(''), 3000);
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
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MonikeHeader title="Settings" back />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        >
          {settingsLoading ? (
            <SettingsSkeleton />
          ) : (
            <>
              {/* ── Profile ──────────────────────────────────────── */}
              <ProfileCard name={form.display_name} email={form.email} />

              {/* ── Spending limits ───────────────────────────────── */}
              <View style={styles.section}>
                <SectionLabel
                  icon={<Sliders size={13} color={MonikeColors.accentPulse} strokeWidth={2} />}
                  title="Spending limits"
                />
                <GroupCard>
                  <NairaRow
                    label="Monthly budget"
                    sublabel="Budget bar target on the dashboard"
                    value={form.monthly_budget}
                    onChange={(v) => patch('monthly_budget', v)}
                  />
                  <GroupDivider />
                  <NairaRow
                    label="High-spend threshold"
                    sublabel="Flags a day as HIGH risk in charts"
                    value={form.high_spend_threshold}
                    onChange={(v) => patch('high_spend_threshold', v)}
                  />
                </GroupCard>
                <Text style={styles.footNote}>Changes apply on next model retrain.</Text>
              </View>

              {/* ── Notifications ─────────────────────────────────── */}
              <View style={styles.section}>
                <SectionLabel
                  icon={<Bell size={13} color={MonikeColors.accentPulse} strokeWidth={2} />}
                  title="Notifications"
                />
                <GroupCard>
                  <ToggleRow
                    label="High-spend alerts"
                    sublabel="When daily spend exceeds threshold"
                    value={form.notify_high_spend}
                    onChange={(v) => patch('notify_high_spend', v)}
                  />
                  <GroupDivider />
                  <ToggleRow
                    label="Weekly summary"
                    sublabel="Every Monday morning"
                    value={form.notify_weekly_summary}
                    onChange={(v) => patch('notify_weekly_summary', v)}
                  />
                  <GroupDivider />
                  <ToggleRow
                    label="Model update alerts"
                    sublabel="When retraining completes"
                    value={form.notify_model_updates}
                    onChange={(v) => patch('notify_model_updates', v)}
                  />
                </GroupCard>
              </View>

              {/* ── ML model ──────────────────────────────────────── */}
              <View style={styles.section}>
                <SectionLabel
                  icon={<BrainCircuit size={13} color={MonikeColors.accentPulse} strokeWidth={2} />}
                  title="ML model"
                />
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
                <Text style={styles.footNote}>
                  Retrain after importing new statement data to improve tomorrow's risk prediction.
                </Text>
              </View>

              {/* ── Data ──────────────────────────────────────────── */}
              <View style={styles.section}>
                <SectionLabel
                  icon={<Database size={13} color={MonikeColors.accentPulse} strokeWidth={2} />}
                  title="Data"
                />
                <UploadCard />
                <GroupCard>
                  <Row
                    label="Clear app cache"
                    sublabel="Force reload of dashboard, explore & predictions"
                    onPress={handleClearCache}
                    right={<Trash2 size={15} color={MonikeColors.inkMuted} strokeWidth={1.8} />}
                  />
                </GroupCard>
              </View>

              {/* ── Security ──────────────────────────────────────── */}
              <View style={styles.section}>
                <SectionLabel
                  icon={<Shield size={13} color={MonikeColors.accentPulse} strokeWidth={2} />}
                  title="Security"
                />
                <GroupCard>
                  <Row
                    label="Change PIN"
                    sublabel="Update the 4-digit startup PIN"
                    onPress={beginPinChange}
                    right={<Key size={15} color={MonikeColors.inkMuted} strokeWidth={1.8} />}
                  />
                  <GroupDivider />
                  <ToggleRow
                    label="Biometric unlock"
                    sublabel={
                      biometricAvailable
                        ? 'Face ID, Touch ID, or fingerprint'
                        : 'No enrolled biometrics on this device'
                    }
                    value={biometricEnabled}
                    onChange={(value) => void setBiometricEnabled(value)}
                  />
                  <GroupDivider />
                  <AutoLockSelector value={autoLockMinutes} onChange={(v) => void setAutoLockMinutes(v)} />
                </GroupCard>
              </View>

              {/* ── Save ──────────────────────────────────────────── */}
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }, saved && styles.saveBtnSaved]}
                onPress={saveSettings}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={MonikeColors.bgVoid} />
                ) : (
                  <Text style={styles.saveBtnText}>{saved ? '✓  Saved' : 'Save settings'}</Text>
                )}
              </Pressable>

              <Text style={styles.versionText}>MONIKE v1.0.0  ·  PostgreSQL monike</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = MonikeColors.accentPulse;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: ScreenPadding, paddingTop: 12, gap: 0 },

  // ── Profile card ────────────────────────────────────────
  profileCard: {
    borderRadius: CardRadius + 2,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
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
    backgroundColor: `${MonikeColors.inkGhost}40`,
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
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLetter: {
    color: MonikeColors.bgVoid,
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
  profileBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: `${ACCENT}18`,
    borderWidth: 1,
    borderColor: `${ACCENT}35`,
  },
  profileBadgeText: {
    color: ACCENT,
    fontFamily: Fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  // ── Section ──────────────────────────────────────────────
  section: { gap: 8, marginBottom: 22 },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  sectionLabelText: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Group card ───────────────────────────────────────────
  groupCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  groupDivider: {
    height: 1,
    backgroundColor: `${MonikeColors.inkGhost}60`,
    marginLeft: 16,
  },

  // ── Row ──────────────────────────────────────────────────
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
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

  // ── Naira input ──────────────────────────────────────────
  nairaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingHorizontal: 10,
    height: 34,
    minWidth: 110,
  },
  nairaWrapFocused: { borderColor: ACCENT },
  nairaSymbol: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    marginRight: 3,
  },
  nairaInput: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    flex: 1,
    padding: 0,
  },

  // ── Foot note ────────────────────────────────────────────
  footNote: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 2,
    marginTop: 2,
  },

  // ── Model card ───────────────────────────────────────────
  modelCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
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
    borderColor: MonikeColors.inkGhost,
  },
  modelPulseDot: {
    position: 'absolute',
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modelCoreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
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
    borderColor: MonikeColors.inkGhost,
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
    backgroundColor: MonikeColors.inkGhost,
  },
  retrainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 10,
    height: 42,
  },
  retrainBtnDisabled: { backgroundColor: MonikeColors.bgElevated },
  retrainBtnText: {
    color: MonikeColors.bgVoid,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Upload card ──────────────────────────────────────────
  uploadCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
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
    backgroundColor: `${ACCENT}12`,
    borderWidth: 1,
    borderColor: `${ACCENT}28`,
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
    borderColor: MonikeColors.inkGhost,
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
    backgroundColor: ACCENT,
    borderRadius: 1,
  },
  uploadStatusText: {
    color: ACCENT,
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

  // ── Segment control (auto-lock) ──────────────────────────
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    overflow: 'hidden',
  },
  segmentOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionActive: {
    backgroundColor: ACCENT,
  },
  segmentOptionText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  segmentOptionTextActive: {
    color: MonikeColors.bgVoid,
    fontWeight: '700',
  },

  // ── Save button ──────────────────────────────────────────
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  saveBtnSaved: { backgroundColor: '#00C766' },
  saveBtnText: {
    color: MonikeColors.bgVoid,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },

  versionText: {
    textAlign: 'center',
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.7,
  },
});
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
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { mutateAll } from '@/hooks/use-swr';
import { MonikeHeader } from '@/components/monike-header';
import { BottomNavigation } from '@/components/bottom-navigation';
import { BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding } from '@/constants/theme';
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>{icon}</View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SettingsRow({
  label,
  sublabel,
  right,
  onPress,
  danger,
  noBorder,
}: {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  noBorder?: boolean;
}) {
  const bg = useRef(new Animated.Value(0)).current;

  const pressIn = () => {
    if (!onPress) return;
    Animated.timing(bg, { toValue: 1, duration: 60, useNativeDriver: false }).start();
  };
  const pressOut = () => {
    Animated.timing(bg, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const bgColor = bg.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', MonikeColors.bgElevated],
  });

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={!onPress}>
      <Animated.View
        style={[
          styles.settingsRow,
          noBorder && styles.settingsRowNoBorder,
          { backgroundColor: bgColor },
        ]}
      >
        <View style={styles.settingsRowLeft}>
          <Text style={[styles.settingsRowLabel, danger && { color: MonikeColors.signalRed }]}>
            {label}
          </Text>
          {sublabel ? <Text style={styles.settingsRowSublabel}>{sublabel}</Text> : null}
        </View>
        {right ?? (onPress ? <ChevronRight size={15} color={MonikeColors.inkGhost} strokeWidth={2} /> : null)}
      </Animated.View>
    </Pressable>
  );
}

function NairaInput({
  label,
  value,
  onChange,
  sublabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  sublabel?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <View style={[styles.settingsRow, styles.settingsRowNoBorder]}>
      <View style={styles.settingsRowLeft}>
        <Text style={styles.settingsRowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.settingsRowSublabel}>{sublabel}</Text> : null}
      </View>
      <View style={[styles.nairaInputWrap, focused && styles.nairaInputWrapFocused]}>
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
    </View>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
  noBorder,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  noBorder?: boolean;
}) {
  return (
    <SettingsRow
      label={label}
      sublabel={sublabel}
      noBorder={noBorder}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: MonikeColors.bgElevated, true: `${MonikeColors.accentPulse}66` }}
          thumbColor={value ? MonikeColors.accentPulse : MonikeColors.inkMuted}
          ios_backgroundColor={MonikeColors.bgElevated}
        />
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
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!retraining) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [retraining, spin]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.3, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseScale]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const accuracy = status?.accuracy != null ? `${(status.accuracy * 100).toFixed(1)}%` : 'N/A';
  const lastTrained = status?.last_trained_at
    ? new Date(status.last_trained_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Never';

  return (
    <View style={styles.modelCard}>
      {/* Status indicator */}
      <View style={styles.modelTopRow}>
        <View style={styles.modelStatusDotWrap}>
          <Animated.View style={[styles.modelStatusPulse, { transform: [{ scale: pulseScale }] }]} />
          <View style={[styles.modelStatusDot, !status?.trained && { backgroundColor: MonikeColors.signalAmber }]} />
        </View>
        <Text style={styles.modelStatusLabel}>
          {status?.trained ? 'Model Active' : 'Model Not Trained'}
        </Text>
        <Text style={styles.modelVersion}>{status?.model_version ?? 'v0'}</Text>
      </View>

      {/* Stats row */}
      <View style={styles.modelStatsRow}>
        <View style={styles.modelStat}>
          <Text style={styles.modelStatValue}>{status?.training_rows ?? 0}</Text>
          <Text style={styles.modelStatLabel}>TRAINING ROWS</Text>
        </View>
        <View style={styles.modelStatDivider} />
        <View style={styles.modelStat}>
          <Text style={[styles.modelStatValue, { color: MonikeColors.accentPulse }]}>{accuracy}</Text>
          <Text style={styles.modelStatLabel}>ACCURACY</Text>
        </View>
        <View style={styles.modelStatDivider} />
        <View style={styles.modelStat}>
          <Text style={styles.modelStatValue}>{lastTrained}</Text>
          <Text style={styles.modelStatLabel}>LAST TRAINED</Text>
        </View>
      </View>

      {/* Retrain button */}
      <Pressable
        style={[styles.retrainButton, retraining && styles.retrainButtonDisabled]}
        onPress={onRetrain}
        disabled={retraining}
      >
        {retraining ? (
          <>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <RefreshCw size={15} color={MonikeColors.bgVoid} strokeWidth={2} />
            </Animated.View>
            <Text style={styles.retrainButtonText}>{retrainProgress || 'Training…'}</Text>
          </>
        ) : (
          <>
            <BrainCircuit size={15} color={MonikeColors.bgVoid} strokeWidth={2} />
            <Text style={styles.retrainButtonText}>Retrain Model</Text>
          </>
        )}
      </Pressable>

      {retraining && (
        <View style={styles.retrainProgressTrack}>
          <Animated.View style={[styles.retrainProgressFill]} />
        </View>
      )}
    </View>
  );
}

// ─── Upload Card ──────────────────────────────────────────────────────────────

function UploadCard() {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      setUploadStatus('Uploading file…');
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as any);

      // POST to kick off background job
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

      // Open WebSocket to track progress
      const wsUrl = `${(process.env.EXPO_PUBLIC_API_URL ?? '').replace('http', 'ws')}/ws/upload/${job_id}`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === 'started') {
          setUploadStatus(`Parsing ${msg.total} transactions…`);
        } else if (msg.event === 'dedup') {
          setUploadStatus(`${msg.kept} new · ${msg.skipped} skipped`);
        } else if (msg.event === 'progress') {
          setUploadStatus(`${msg.phase === 'transactions' ? 'Inserting' : 'Building daily'} ${msg.done}/${msg.total}…`);
        } else if (msg.event === 'complete') {
          const r = msg.result;
          setUploadStatus(
            `Done — ${r.new_days_inserted} new days, ${r.duplicate_transactions_skipped} dupes skipped`,
          );
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
      <View style={styles.uploadIconRow}>
        <View style={styles.uploadIconWrap}>
          <Upload size={22} color={MonikeColors.accentPulse} strokeWidth={1.8} />
        </View>
        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>Import Statement</Text>
          <Text style={styles.uploadSubtitle}>OPay .xlsx / .xls / .csv</Text>
        </View>
      </View>

      {uploadStatus && !uploadError ? (
        <View style={styles.uploadStatusRow}>
          {uploading && <ActivityIndicator size="small" color={MonikeColors.accentPulse} style={{ marginRight: 8 }} />}
          <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
        </View>
      ) : null}
      {uploadError ? (
        <View style={styles.uploadErrorRow}>
          <AlertTriangle size={12} color={MonikeColors.signalRed} />
          <Text style={styles.uploadErrorText}>{uploadError}</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
        onPress={pickAndUpload}
        disabled={uploading}
      >
        {uploading
          ? <ActivityIndicator size="small" color={MonikeColors.inkMuted} />
          : <Text style={styles.uploadButtonText}>Choose File</Text>
        }
      </Pressable>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
// inside SettingsScreen:
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState('');

  const { data: settingsData, mutate: mutateSettings } = useSWR<SettingsData>('/settings', apiFetch);
  const { data: modelStatus, mutate: mutateModel } = useSWR<ModelStatus>('/model/status', apiFetch);

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
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleRetrain = async () => {
    if (retraining) return;
    setRetraining(true);
    setRetrainProgress('Loading training data…');
    try {
      const result: RetrainResult = await apiPost('/retrain', {});
      setRetrainProgress(`Done — ${(result.accuracy * 100).toFixed(1)}% accuracy`);
      mutateModel();
      setTimeout(() => setRetrainProgress(''), 3000);
    } catch (e: any) {
      setRetrainProgress('');
      Alert.alert('Retrain failed', e.message ?? 'Unknown error');
    } finally {
      setRetraining(false);
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will force all dashboard, prediction, and explore data to reload from the database. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiPost('/cache/clear');
              mutateAll(); // wipes cache map + fires every mounted useSWR's revalidate
              Alert.alert('Cache cleared', 'All data is reloading.');
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <MonikeHeader title="Settings" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + BottomTabInset + 32 },
          ]}
        >
          {/* ── Profile ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<User size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="PROFILE"
            />
            <SettingsCard>
              <SettingsRow
                label={form.display_name}
                sublabel={form.email}
                noBorder
                right={
                  <View style={styles.avatarBubble}>
                    <Text style={styles.avatarLetter}>{form.display_name[0]}</Text>
                  </View>
                }
              />
            </SettingsCard>
          </View>

          {/* ── Spending Limits ──────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<Sliders size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="SPENDING LIMITS"
            />
            <SettingsCard>
              <NairaInput
                label="Monthly Budget"
                sublabel="Hero card budget bar target"
                value={form.monthly_budget}
                onChange={(v) => patch('monthly_budget', v)}
              />
              <View style={styles.cardDivider} />
              <NairaInput
                label="Daily High-Spend Threshold"
                sublabel="Marks a day as HIGH risk in charts"
                value={form.high_spend_threshold}
                onChange={(v) => patch('high_spend_threshold', v)}
              />
            </SettingsCard>
            <Text style={styles.footNote}>
              Threshold is used by the ML model, explore risk colors, and spend health streak. Changes take effect on next retrain.
            </Text>
          </View>

          {/* ── Notifications ────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<Bell size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="NOTIFICATIONS"
            />
            <SettingsCard>
              <ToggleRow
                label="High-Spend Alerts"
                sublabel="Notify when daily spend exceeds threshold"
                value={form.notify_high_spend}
                onChange={(v) => patch('notify_high_spend', v)}
              />
              <View style={styles.cardDivider} />
              <ToggleRow
                label="Weekly Summary"
                sublabel="Every Monday morning"
                value={form.notify_weekly_summary}
                onChange={(v) => patch('notify_weekly_summary', v)}
              />
              <View style={styles.cardDivider} />
              <ToggleRow
                label="Model Update Alerts"
                sublabel="When retraining completes"
                value={form.notify_model_updates}
                onChange={(v) => patch('notify_model_updates', v)}
                noBorder
              />
            </SettingsCard>
          </View>

          {/* ── ML Model ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<BrainCircuit size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="ML MODEL"
            />
            <ModelStatusCard
              status={modelStatus}
              retraining={retraining}
              retrainProgress={retrainProgress}
              onRetrain={handleRetrain}
            />
            <Text style={styles.footNote}>
              Retrain uses all rows in daily_log. Run after importing new statement data to improve tomorrow's risk prediction.
            </Text>
          </View>

          {/* ── Data ─────────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<Database size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="DATA"
            />
            <UploadCard />
            <SettingsCard>
              <SettingsRow
                label="Clear App Cache"
                sublabel="Force reload of dashboard, explore & predictions"
                onPress={handleClearCache}
                right={<Trash2 size={15} color={MonikeColors.inkMuted} strokeWidth={1.8} />}
                noBorder
              />
            </SettingsCard>
          </View>

          {/* ── Security ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeader
              icon={<Shield size={14} color={MonikeColors.accentPulse} strokeWidth={2} />}
              title="SECURITY"
            />
            <SettingsCard>
              <SettingsRow label="Change PIN" onPress={() => {}} />
              <View style={styles.cardDivider} />
              <SettingsRow label="Biometric Unlock" right={<Switch value={false} disabled trackColor={{ false: MonikeColors.bgElevated, true: `${MonikeColors.accentPulse}66` }} thumbColor={MonikeColors.inkMuted} />} noBorder />
            </SettingsCard>
          </View>

          {/* ── Save button ───────────────────────────────────────── */}
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled, saved && styles.saveButtonSaved]}
            onPress={saveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={MonikeColors.bgVoid} />
            ) : (
              <Text style={styles.saveButtonText}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
            )}
          </Pressable>

          {/* Version */}
          <Text style={styles.versionText}>MONIKE v1.0.0 · PostgreSQL monike</Text>
        </ScrollView>
      </SafeAreaView>
      <BottomNavigation activeRoute="home" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 8, gap: 6 },

  // Section
  section: { gap: 8, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionIconWrap: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: `${MonikeColors.accentPulse}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
  },

  // Card
  card: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  cardDivider: { height: 1, backgroundColor: `${MonikeColors.inkGhost}88`, marginHorizontal: 16 },

  // Settings Row
  settingsRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${MonikeColors.inkGhost}55`,
  },
  settingsRowNoBorder: { borderBottomWidth: 0 },
  settingsRowLeft: { flex: 1, gap: 3 },
  settingsRowLabel: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
  settingsRowSublabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },

  // Avatar
  avatarBubble: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: MonikeColors.accentPulse,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: {
    color: MonikeColors.bgVoid,
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },

  // Naira Input
  nairaInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    paddingHorizontal: 10,
    height: 36,
    minWidth: 120,
  },
  nairaInputWrapFocused: { borderColor: MonikeColors.accentPulse },
  nairaSymbol: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 13, marginRight: 4 },
  nairaInput: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    flex: 1,
    padding: 0,
  },

  // Foot note
  footNote: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 4,
  },

  // Model card
  modelCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    padding: 16,
    gap: 14,
  },
  modelTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelStatusDotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  modelStatusPulse: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: MonikeColors.accentPulse, opacity: 0.3,
  },
  modelStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: MonikeColors.accentPulse },
  modelStatusLabel: {
    flex: 1, color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600',
  },
  modelVersion: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10 },
  modelStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    paddingVertical: 10,
  },
  modelStat: { flex: 1, alignItems: 'center', gap: 3 },
  modelStatValue: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 12, fontWeight: '700',
  },
  modelStatLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, letterSpacing: 0.5 },
  modelStatDivider: { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },
  retrainButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: MonikeColors.accentPulse,
    borderRadius: 10, height: 44,
  },
  retrainButtonDisabled: { backgroundColor: MonikeColors.bgElevated },
  retrainButtonText: {
    color: MonikeColors.bgVoid, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600',
  },
  retrainProgressTrack: {
    height: 2, borderRadius: 1, backgroundColor: MonikeColors.bgElevated, overflow: 'hidden',
  },
  retrainProgressFill: {
    height: 2, width: '60%', backgroundColor: MonikeColors.accentPulse,
  },

  // Upload card
  uploadCard: {
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius,
    padding: 16,
    gap: 12,
    marginBottom: 8,
  },
  uploadIconRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  uploadIconWrap: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: `${MonikeColors.accentPulse}15`,
    borderWidth: 1, borderColor: `${MonikeColors.accentPulse}30`,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadCopy: { gap: 3 },
  uploadTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600' },
  uploadSubtitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
  uploadStatusRow: { flexDirection: 'row', alignItems: 'center' },
  uploadStatusText: { color: MonikeColors.accentPulse, fontFamily: Fonts.mono, fontSize: 12 },
  uploadErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadErrorText: { color: MonikeColors.signalRed, fontFamily: Fonts.sans, fontSize: 12 },
  uploadButton: {
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 8, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    height: 38, alignItems: 'center', justifyContent: 'center',
  },
  uploadButtonDisabled: { opacity: 0.5 },
  uploadButtonText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '500' },

  // Save
  saveButton: {
    backgroundColor: MonikeColors.accentPulse,
    borderRadius: 12, height: 50,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonSaved: { backgroundColor: '#00C766' },
  saveButtonText: {
    color: MonikeColors.bgVoid, fontFamily: Fonts.sans, fontSize: 15, fontWeight: '700',
  },

  versionText: {
    textAlign: 'center',
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    marginTop: 8,
    marginBottom: 4,
  },
});
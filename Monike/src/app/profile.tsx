import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  DollarSign,
  Download,
  Globe,
  Moon,
  Palette,
  Tag,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR, mutateAll } from '@/hooks/use-swr';
import { useUploadStatement } from '@/hooks/use-upload-statement';
import { useAccent } from '@/contexts/accent-context';
import { apiFetch, apiPost, type DashboardResponse } from '@/services/api';
import { AccentPresets, BottomTabInset, Fonts, ScreenPadding, hexAlpha, type AccentName } from '@/constants/theme';

// ─── Local types ──────────────────────────────────────────────────────────────
// Not (yet) exported from services/api.ts — declared locally to avoid backend/API surface changes.

type DrawerStats = {
  txn_this_month: number;
  days_tracked: number;
  high_days_this_month: number;
};

type ModelStatusResponse = {
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
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function daysAgo(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentName, accent, accentTint, setAccentName, dark, setDark, colors, settings, mutateSettings } = useAccent();

  const { data: stats } = useSWR<DrawerStats>('/stats', apiFetch);
  const { data: modelStatus, mutate: mutateModelStatus } = useSWR<ModelStatusResponse>('/model/status', apiFetch);
  const { data: dashboard } = useSWR<DashboardResponse>('/dashboard', apiFetch);

  const [editing, setEditing] = useState<'budget' | 'threshold' | null>(null);
  const [retraining, setRetraining] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleUploadSuccess = useCallback(() => { mutateAll(); }, []);
  const { uploadState, pickAndUpload, reset: resetUpload } = useUploadStatement(handleUploadSuccess);
  const uploadBusy = uploadState.status !== 'idle' && uploadState.status !== 'success' && uploadState.status !== 'error';
  const uploadValue =
    uploadState.status === 'picking' ? 'Opening…' :
    uploadState.status === 'uploading' ? 'Uploading…' :
    uploadState.status === 'processing' ? 'Processing…' :
    'CSV / XLSX';

  const notificationsOn = Boolean(
    settings?.notify_high_spend || settings?.notify_weekly_summary || settings?.notify_model_updates,
  );

  async function patchSettings(patch: Partial<NonNullable<typeof settings>>) {
    if (!settings) return;
    await apiPost('/settings', { ...settings, ...patch });
    await mutateSettings();
  }

  async function handleRetrain() {
    if (retraining) return;
    setRetraining(true);
    try {
      const result = await apiPost<RetrainResult>('/retrain', undefined);
      await mutateModelStatus();
      Alert.alert(result.success ? 'Model retrained' : 'Retrain failed', result.message);
    } catch (e) {
      Alert.alert('Retrain failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRetraining(false);
    }
  }

  const initial = (settings?.display_name?.trim()?.[0] ?? 'C').toUpperCase();
  const retrainSub = modelStatus?.trained
    ? `Trained on ${modelStatus.training_rows} days${modelStatus.last_trained_at ? ` · ${daysAgo(modelStatus.last_trained_at)}` : ''}`
    : 'Not yet trained';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {/* Profile head */}
          <View style={styles.profileHead}>
            <View style={[styles.avatar, { backgroundColor: accent }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View>
              <Text style={[styles.profileName, { color: colors.ink }]}>{settings?.display_name ?? 'Chijioke'}</Text>
              <Text style={[styles.profileSub, { color: colors.ink2 }]}>OPay account</Text>
            </View>
          </View>

          {/* Mini stats */}
          <View style={[styles.statRow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.ink }]}>{stats?.days_tracked ?? '—'}</Text>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>DAYS TRACKED</Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.line }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: accent }]}>{dashboard?.spend_health.streak_days ?? '—'}</Text>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>DAY STREAK</Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: colors.line }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.ink }]}>
                {modelStatus?.accuracy != null ? `${(modelStatus.accuracy * 100).toFixed(0)}%` : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.ink3 }]}>MODEL ACC.</Text>
            </View>
          </View>

          {/* Appearance */}
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.ink3 }]}>APPEARANCE</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
                <View style={[styles.rowIcon, { backgroundColor: accentTint }]}>
                  <Moon size={16} color={accent} strokeWidth={1.9} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.ink }]}>Theme</Text>
                <View style={[styles.segmentRow, { backgroundColor: colors.chip }]}>
                  <Pressable
                    style={[styles.segmentBtn, dark && { backgroundColor: accent }]}
                    onPress={() => setDark(true)}
                  >
                    <Text style={[styles.segmentText, { color: dark ? '#fff' : colors.ink2, fontWeight: dark ? '600' : '500' }]}>Dark</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentBtn, !dark && { backgroundColor: accent }]}
                    onPress={() => setDark(false)}
                  >
                    <Text style={[styles.segmentText, { color: !dark ? '#fff' : colors.ink2, fontWeight: !dark ? '600' : '500' }]}>Light</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: accentTint }]}>
                  <Palette size={16} color={accent} strokeWidth={1.9} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.ink }]}>Accent</Text>
                <View style={styles.swatchRow}>
                  {(Object.keys(AccentPresets) as AccentName[]).map((name) => {
                    const active = name === accentName;
                    const swatchColor = AccentPresets[name];
                    return (
                      <Pressable key={name} onPress={() => setAccentName(name)}>
                        <View style={[styles.swatchRing, active && { backgroundColor: swatchColor }]}>
                          <View style={[styles.swatchGap, active && { backgroundColor: colors.card }]}>
                            <View style={[styles.swatchDot, { backgroundColor: swatchColor }]} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          {/* Budget */}
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.ink3 }]}>BUDGET</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <SettingsRow
                colors={colors}
                Icon={DollarSign}
                iconColor="#5B7CFA"
                label="Monthly budget"
                value={`₦${formatNaira(settings?.monthly_budget ?? 0)}`}
                onPress={() => setEditing('budget')}
                divider
              />
              <SettingsRow
                colors={colors}
                Icon={TriangleAlert}
                iconColor="#E5645B"
                label="High-spend threshold"
                value={`₦${formatNaira(settings?.high_spend_threshold ?? 0)}`}
                onPress={() => setEditing('threshold')}
                divider
              />
              <SettingsRow
                colors={colors}
                Icon={Tag}
                iconColor="#E08A3C"
                label="Categories"
                onPress={() => router.navigate('/patterns' as any)}
              />
            </View>
          </View>

          {/* Preferences */}
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.ink3 }]}>PREFERENCES</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <SettingsRow
                colors={colors}
                Icon={Bell}
                iconColor={accent}
                label="Notifications"
                value={notificationsOn ? 'On' : 'Off'}
                onPress={() => setShowNotifications(true)}
                divider
              />
              <SettingsRow
                colors={colors}
                Icon={Globe}
                iconColor="#2BB3A3"
                label="Currency"
                value="₦ NGN"
                chevron={false}
                divider
              />
              <SettingsRow
                colors={colors}
                Icon={Download}
                iconColor="#B06FD6"
                label="Export data"
                value="CSV"
                onPress={() => Alert.alert('Export data', 'Data export is coming soon.')}
                divider
              />
              <SettingsRow
                colors={colors}
                Icon={Upload}
                iconColor="#E0A11C"
                label="Import statement"
                value={uploadValue}
                onPress={pickAndUpload}
                disabled={uploadBusy}
                rightAdornment={uploadBusy ? <ActivityIndicator size="small" color={accent} /> : undefined}
                chevron={!uploadBusy}
              />
            </View>
          </View>

          {/* Retrain card */}
          <View style={[styles.retrainCard, { backgroundColor: accentTint }]}>
            <View style={styles.retrainBody}>
              <Text style={[styles.retrainTitle, { color: colors.ink }]}>Retrain your model</Text>
              <Text style={[styles.retrainSub, { color: colors.ink2 }]}>{retrainSub}</Text>
            </View>
            <Pressable style={[styles.retrainPill, { backgroundColor: accent }]} onPress={handleRetrain} disabled={retraining}>
              {retraining ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={styles.retrainPillText}>Retrain</Text>
              )}
            </Pressable>
          </View>

          <Text style={[styles.footer, { color: colors.ink3 }]}>Monike v2.0 · Spending, better</Text>
        </ScrollView>
      </SafeAreaView>

      {editing === 'budget' && (
        <EditValueModal
          visible
          title="Monthly budget"
          initialValue={String(settings?.monthly_budget ?? 0)}
          accent={accent}
          colors={colors}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            const n = parseFloat(value);
            if (Number.isFinite(n)) await patchSettings({ monthly_budget: n });
            setEditing(null);
          }}
        />
      )}
      {editing === 'threshold' && (
        <EditValueModal
          visible
          title="High-spend threshold"
          initialValue={String(settings?.high_spend_threshold ?? 0)}
          accent={accent}
          colors={colors}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            const n = parseFloat(value);
            if (Number.isFinite(n)) await patchSettings({ high_spend_threshold: n });
            setEditing(null);
          }}
        />
      )}

      <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
        <Pressable style={modalStyles.backdrop} onPress={() => setShowNotifications(false)}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={(e) => e.stopPropagation()}>
            <View style={modalStyles.sheetHeader}>
              <Text style={[modalStyles.sheetTitle, { color: colors.ink }]}>Notifications</Text>
              <Pressable onPress={() => setShowNotifications(false)} hitSlop={8}>
                <X size={18} color={colors.ink3} />
              </Pressable>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>High-spend alerts</Text>
              <Switch
                value={settings?.notify_high_spend ?? false}
                onValueChange={(v) => patchSettings({ notify_high_spend: v })}
                trackColor={{ false: colors.chip, true: accent }}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>Weekly summary</Text>
              <Switch
                value={settings?.notify_weekly_summary ?? false}
                onValueChange={(v) => patchSettings({ notify_weekly_summary: v })}
                trackColor={{ false: colors.chip, true: accent }}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>Model update notices</Text>
              <Switch
                value={settings?.notify_model_updates ?? false}
                onValueChange={(v) => patchSettings({ notify_model_updates: v })}
                trackColor={{ false: colors.chip, true: accent }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={uploadState.status === 'success' || uploadState.status === 'error'}
        transparent
        animationType="fade"
        onRequestClose={resetUpload}
      >
        <View style={modalStyles.backdrop}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {uploadState.status === 'success' ? (
              <>
                <View style={[modalStyles.checkCircle, { backgroundColor: accentTint, borderColor: accent }]}>
                  <Download size={24} color={accent} strokeWidth={2.5} />
                </View>
                <Text style={[modalStyles.title, { color: colors.ink }]}>Statement imported</Text>
                <Text style={[modalStyles.summary, { color: colors.ink2 }]}>
                  {uploadState.result.new_days_inserted} new days · {uploadState.result.days_updated} updated · {uploadState.result.duplicate_transactions_skipped} duplicates skipped
                </Text>
                <Text style={[modalStyles.summaryMuted, { color: colors.ink3 }]}>
                  {uploadState.result.date_range_start} → {uploadState.result.date_range_end}
                </Text>
              </>
            ) : uploadState.status === 'error' ? (
              <>
                <View style={[modalStyles.checkCircle, { backgroundColor: hexAlpha('#E0A11C', 0.16), borderColor: '#E0A11C' }]}>
                  <TriangleAlert size={24} color="#E0A11C" strokeWidth={2.5} />
                </View>
                <Text style={[modalStyles.title, { color: colors.ink }]}>Upload failed</Text>
                <Text style={[modalStyles.summaryMuted, { color: colors.ink3 }]}>{uploadState.message}</Text>
              </>
            ) : null}
            <Pressable style={[modalStyles.doneButton, { backgroundColor: accent }]} onPress={resetUpload}>
              <Text style={modalStyles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BottomNavigation activeRoute="profile" />
    </View>
  );
}

// ─── Settings row ──────────────────────────────────────────────────────────────

function SettingsRow({
  colors,
  Icon,
  iconColor,
  label,
  value,
  onPress,
  disabled,
  chevron = true,
  divider = false,
  rightAdornment,
}: {
  colors: { ink: string; ink2: string; ink3: string; line: string };
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconColor: string;
  label: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  divider?: boolean;
  rightAdornment?: React.ReactNode;
}) {
  return (
    <Pressable
      style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: colors.line }]}
      onPress={onPress}
      disabled={!onPress || disabled}
    >
      <View style={[styles.rowIcon, { backgroundColor: hexAlpha(iconColor, 0.16) }]}>
        <Icon size={16} color={iconColor} strokeWidth={1.9} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.ink2 }]}>{value}</Text> : null}
      {rightAdornment}
      {chevron && !rightAdornment ? <ChevronRight size={17} color={colors.ink3} strokeWidth={2} /> : null}
    </Pressable>
  );
}

// ─── Edit-value modal ──────────────────────────────────────────────────────────

function EditValueModal({
  visible,
  title,
  initialValue,
  accent,
  colors,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue: string;
  accent: string;
  colors: { ink: string; ink3: string; card: string; line: string };
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.sheetHeader}>
            <Text style={[modalStyles.sheetTitle, { color: colors.ink }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={colors.ink3} />
            </Pressable>
          </View>
          <TextInput
            style={[modalStyles.input, { color: colors.ink, borderColor: colors.line }]}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            autoFocus
          />
          <Pressable style={[modalStyles.saveBtn, { backgroundColor: accent }]} onPress={() => onSave(value)}>
            <Text style={modalStyles.saveBtnText}>Save</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 12 },

  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingBottom: 24 },
  avatar: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontFamily: Fonts.heading, fontSize: 24, fontWeight: '600' },
  profileName: { fontFamily: Fonts.heading, fontSize: 21, fontWeight: '600' },
  profileSub: { fontFamily: Fonts.mono, fontSize: 12, marginTop: 4 },

  statRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 6,
    marginBottom: 26,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statSep: { width: 1, height: 28 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9.5, letterSpacing: 0.6, marginTop: 4 },
  statValue: { fontFamily: Fonts.heading, fontSize: 18, fontWeight: '600' },

  group: { marginBottom: 22 },
  groupTitle: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, marginLeft: 4, marginBottom: 10 },
  sectionCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: Fonts.sans, fontSize: 14.5, fontWeight: '500' },
  rowValue: { fontFamily: Fonts.mono, fontSize: 12.5 },
  divider: { height: 1 },

  segmentRow: { flexDirection: 'row', gap: 6, borderRadius: 999, padding: 3 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  segmentText: { fontFamily: Fonts.sans, fontSize: 12.5 },

  swatchRow: { flexDirection: 'row', gap: 10 },
  swatchRing: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swatchGap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 26, height: 26, borderRadius: 13 },

  retrainCard: { borderRadius: 20, padding: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  retrainBody: { flex: 1 },
  retrainTitle: { fontFamily: Fonts.heading, fontSize: 15, fontWeight: '600' },
  retrainSub: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 3, lineHeight: 17 },
  retrainPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, minWidth: 70, alignItems: 'center' },
  retrainPillText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '600' },

  footer: { textAlign: 'center', fontFamily: Fonts.mono, fontSize: 11, paddingVertical: 14 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  sheet: {
    borderRadius: 16, borderWidth: 1, padding: 20, gap: 14,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  input: {
    fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700',
    borderWidth: 1, borderRadius: 10, padding: 12,
  },
  saveBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  checkCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 4, alignSelf: 'center' },
  title: { fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  summary: { fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center' },
  summaryMuted: { fontFamily: Fonts.mono, fontSize: 11, textAlign: 'center' },
  doneButton: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, marginTop: 8, alignSelf: 'center' },
  doneText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

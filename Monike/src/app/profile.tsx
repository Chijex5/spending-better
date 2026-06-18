import { useState } from 'react';
import {
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
import { ChevronRight, RefreshCw, User, X } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { useSWR } from '@/hooks/use-swr';
import { useAccent } from '@/contexts/accent-context';
import { apiFetch, apiPost, type DashboardResponse } from '@/services/api';
import { AccentPresets, BottomTabInset, CardRadius, Fonts, MonikeColors, ScreenPadding, type AccentName } from '@/constants/theme';

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

// ─── Edit-value modal ──────────────────────────────────────────────────────────

function EditValueModal({
  visible,
  title,
  initialValue,
  accent,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue: string;
  accent: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={MonikeColors.inkMuted} />
            </Pressable>
          </View>
          <TextInput
            style={modalStyles.input}
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentName, accent, setAccentName, settings, mutateSettings } = useAccent();

  const { data: stats } = useSWR<DrawerStats>('/stats', apiFetch);
  const { data: modelStatus, mutate: mutateModelStatus } = useSWR<ModelStatusResponse>('/model/status', apiFetch);
  const { data: dashboard } = useSWR<DashboardResponse>('/dashboard', apiFetch);

  const [editing, setEditing] = useState<'budget' | 'threshold' | null>(null);
  const [retraining, setRetraining] = useState(false);

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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + 28 }]}
        >
          {/* Profile head */}
          <View style={styles.profileHead}>
            <View style={[styles.avatar, { backgroundColor: accent + '22', borderColor: accent }]}>
              <User size={26} color={accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.profileName}>{settings?.display_name ?? 'Chijioke'}</Text>
            <Text style={styles.profileSub}>OPay account</Text>
          </View>

          {/* Mini stats */}
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>DAYS TRACKED</Text>
              <Text style={styles.statValue}>{stats?.days_tracked ?? '—'}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>DAY STREAK</Text>
              <Text style={styles.statValue}>{dashboard?.spend_health.streak_days ?? '—'}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>MODEL ACC.</Text>
              <Text style={styles.statValue}>
                {modelStatus?.accuracy != null ? `${(modelStatus.accuracy * 100).toFixed(0)}%` : '—'}
              </Text>
            </View>
          </View>

          {/* Appearance */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>APPEARANCE</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.rowLabel}>Accent color</Text>
              <View style={styles.swatchRow}>
                {(Object.keys(AccentPresets) as AccentName[]).map((name) => {
                  const active = name === accentName;
                  return (
                    <Pressable
                      key={name}
                      style={styles.swatchWrap}
                      onPress={() => setAccentName(name)}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: AccentPresets[name] },
                          active && styles.swatchActive,
                        ]}
                      >
                        {active ? <View style={styles.swatchDot} /> : null}
                      </View>
                      <Text style={[styles.swatchLabel, active && { color: accent, fontWeight: '700' }]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Budget */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>BUDGET</Text>
            <View style={styles.sectionCard}>
              <Pressable style={styles.row} onPress={() => setEditing('budget')}>
                <Text style={styles.rowLabel}>Monthly budget</Text>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>₦{formatNaira(settings?.monthly_budget ?? 0)}</Text>
                  <ChevronRight size={16} color={MonikeColors.inkMuted} />
                </View>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.row} onPress={() => setEditing('threshold')}>
                <Text style={styles.rowLabel}>High-spend threshold</Text>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>₦{formatNaira(settings?.high_spend_threshold ?? 0)}</Text>
                  <ChevronRight size={16} color={MonikeColors.inkMuted} />
                </View>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.row} onPress={() => router.navigate('/patterns' as any)}>
                <Text style={styles.rowLabel}>Categories</Text>
                <ChevronRight size={16} color={MonikeColors.inkMuted} />
              </Pressable>
            </View>
          </View>

          {/* Preferences */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>PREFERENCES</Text>
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>High-spend alerts</Text>
                <Switch
                  value={settings?.notify_high_spend ?? false}
                  onValueChange={(v) => patchSettings({ notify_high_spend: v })}
                  trackColor={{ false: MonikeColors.bgElevated, true: accent }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Weekly summary</Text>
                <Switch
                  value={settings?.notify_weekly_summary ?? false}
                  onValueChange={(v) => patchSettings({ notify_weekly_summary: v })}
                  trackColor={{ false: MonikeColors.bgElevated, true: accent }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Model update notices</Text>
                <Switch
                  value={settings?.notify_model_updates ?? false}
                  onValueChange={(v) => patchSettings({ notify_model_updates: v })}
                  trackColor={{ false: MonikeColors.bgElevated, true: accent }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Currency</Text>
                <Text style={styles.rowValue}>NGN (₦)</Text>
              </View>
              <View style={styles.divider} />
              <Pressable
                style={styles.row}
                onPress={() => Alert.alert('Export data', 'Data export is coming soon.')}
              >
                <Text style={styles.rowLabel}>Export data</Text>
                <ChevronRight size={16} color={MonikeColors.inkMuted} />
              </Pressable>
            </View>
          </View>

          {/* Retrain card */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>MODEL</Text>
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.rowLabel}>Prediction model</Text>
                  <Text style={styles.rowSub}>
                    {modelStatus?.trained
                      ? `Trained on ${modelStatus.training_rows} days · ${modelStatus.model_version}`
                      : 'Not yet trained'}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Pressable style={[styles.retrainBtn, { borderColor: accent }]} onPress={handleRetrain} disabled={retraining}>
                <RefreshCw size={15} color={accent} strokeWidth={2} />
                <Text style={[styles.retrainBtnText, { color: accent }]}>{retraining ? 'Retraining…' : 'Retrain model'}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.footer}>Monike v2.0</Text>
        </ScrollView>
      </SafeAreaView>

      <EditValueModal
        visible={editing === 'budget'}
        title="Monthly budget"
        initialValue={String(settings?.monthly_budget ?? 0)}
        accent={accent}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          const n = parseFloat(value);
          if (Number.isFinite(n)) await patchSettings({ monthly_budget: n });
          setEditing(null);
        }}
      />
      <EditValueModal
        visible={editing === 'threshold'}
        title="High-spend threshold"
        initialValue={String(settings?.high_spend_threshold ?? 0)}
        accent={accent}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          const n = parseFloat(value);
          if (Number.isFinite(n)) await patchSettings({ high_spend_threshold: n });
          setEditing(null);
        }}
      />

      <BottomNavigation activeRoute="profile" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingTop: 24, gap: 18 },

  profileHead: { alignItems: 'center', gap: 6, marginBottom: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '700', marginTop: 6 },
  profileSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 12 },

  statRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingVertical: 14,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 5 },
  statSep: { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },
  statLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  statValue: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700' },

  group: { gap: 8 },
  groupTitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginLeft: 4 },
  sectionCard: {
    backgroundColor: MonikeColors.bgSurface, borderWidth: 1, borderColor: MonikeColors.inkGhost,
    borderRadius: CardRadius, paddingHorizontal: 16, paddingVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  rowLabel: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 13.5 },
  rowSub: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11.5, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 13 },
  divider: { height: 0.5, backgroundColor: MonikeColors.inkGhost },

  swatchRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  swatchWrap: { alignItems: 'center', gap: 6 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 2.5, borderColor: '#fff' },
  swatchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  swatchLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },

  retrainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginVertical: 12,
  },
  retrainBtnText: { fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },

  footer: { textAlign: 'center', color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11, marginTop: 8, marginBottom: 8 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  sheet: {
    backgroundColor: MonikeColors.bgSurface, borderRadius: CardRadius, borderWidth: 1,
    borderColor: MonikeColors.inkGhost, padding: 20, gap: 14,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 16, fontWeight: '700' },
  input: {
    color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 20, fontWeight: '700',
    borderWidth: 1, borderColor: MonikeColors.inkGhost, borderRadius: 10, padding: 12,
  },
  saveBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
});

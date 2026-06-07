import { useRouter } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Pencil, DollarSign, RefreshCw, Settings, X, Activity } from 'lucide-react-native';

import { Fonts, MonikeColors } from '@/constants/theme';

type ShellContextValue = {
  openDrawer: () => void;
  closeDrawer: () => void;
  showAlerts: (hasAlerts?: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useMonikeShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useMonikeShell must be used inside MonikeShellProvider');
  return context;
}

export function MonikeShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alertsVisible, setAlertsVisible] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const drawerProgress = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const dbPing = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const { width } = Dimensions.get('window');
  const drawerWidth = width * 0.80;

  // DB pulse loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(dbPing, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [dbPing]);

  // Spin loop while retraining
  useEffect(() => {
    if (!retraining) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [retraining, spin]);

  const animateDrawer = (open: boolean) => {
    if (open) setDrawerOpen(true);
    Animated.timing(drawerProgress, {
      toValue: open ? 1 : 0,
      duration: open ? 300 : 240,
      easing: open ? Easing.bezier(0.32, 0, 0.15, 1) : Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setDrawerOpen(false);
    });
  };

  const openDrawer = () => animateDrawer(true);
  const closeDrawer = () => animateDrawer(false);

  const edgePanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !drawerOpen && g.moveX <= 32 && g.dx > 12 && Math.abs(g.dy) < 20,
      onPanResponderRelease: (_, g) => { if (g.dx > 24) openDrawer(); },
    }),
    [drawerOpen],
  );

  const drawerPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => drawerOpen && g.dx < -12 && Math.abs(g.dy) < 24,
      onPanResponderRelease: (_, g) => { if (g.dx < -28) closeDrawer(); },
    }),
    [drawerOpen],
  );

  const navigateToSettings = () => {
    closeDrawer();
    router.navigate('/settings');
  };

  const navigateToBudget = () => {
    closeDrawer();
    router.navigate('/flow-velocity');
  }

  const retrainModel = async () => {
    if (retraining) return;
    setRetraining(true);
    setToastVisible(false);
    try {
      await fetch('/retrain', { method: 'POST' });
      setToastVisible(true);
      toastOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(toastOpacity, { toValue: 0, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => setToastVisible(false));
    } finally {
      setRetraining(false);
    }
  };

  const shell = useMemo(
    () => ({ openDrawer, closeDrawer, showAlerts: () => setAlertsVisible(true) }),
    [],
  );

  const translateX = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] });
  const scrimOpacity = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const contentScale = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const dbPulseScale = dbPing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const dbPulseOpacity = dbPing.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });

  return (
    <ShellContext.Provider value={shell}>
      <View style={styles.shellRoot}>
        <Animated.View style={[styles.appContent, { transform: [{ scale: contentScale }] }]}>
          {children}
        </Animated.View>

        {!drawerOpen && (
          <View style={styles.edgeSwipeZone} {...edgePanResponder.panHandlers} />
        )}

        {drawerOpen && (
          <>
            {/* Scrim */}
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
            </Animated.View>

            {/* Drawer */}
            <Animated.View
              style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}
              {...drawerPanResponder.panHandlers}
            >
              {/* Top safe area */}
              <View style={{ height: insets.top }} />

              {/* Close row */}
              <View style={styles.closeRow}>
                <Pressable style={styles.closeButton} onPress={closeDrawer}>
                  <X size={18} color={MonikeColors.inkMuted} strokeWidth={1.8} />
                </Pressable>
              </View>

              {/* Profile */}
              <View style={styles.profileBlock}>
                <View style={styles.avatarWrap}>
                  <Text style={styles.avatarText}>C</Text>
                  {/* Neon ring around avatar */}
                  <View style={styles.avatarRing} />
                </View>
                <View style={styles.profileMeta}>
                  <Text style={styles.name}>Chijioke</Text>
                  <Text style={styles.email}>chijioke@monike.app</Text>
                </View>
                <Pressable style={styles.editProfile} onPress={navigateToSettings}>
                  <Pencil size={12} color={MonikeColors.accentPulse} strokeWidth={2} />
                  <Text style={styles.editText}>Edit profile</Text>
                </Pressable>
              </View>

              {/* Stats strip */}
              <View style={styles.statsStrip}>
                <Stat value="142" label="TXN THIS MO" />
                <View style={styles.statSep} />
                <Stat value="156" label="DAYS TRACKED" />
                <View style={styles.statSep} />
                <Stat value="8" label="HIGH DAYS" color={MonikeColors.signalRed} />
              </View>

              <View style={styles.divider} />

              {/* Actions */}
              <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>

              <ActionRow
                icon={<Settings size={17} color={MonikeColors.inkSecondary} strokeWidth={1.7} />}
                title="Settings"
                subtitle="Notifications, threshold, export"
                onPress={navigateToSettings}
              />
              <ActionRow
                icon={
                  <Animated.View style={{ transform: [{ rotate }] }}>
                    <RefreshCw size={17} color={MonikeColors.inkSecondary} strokeWidth={1.7} />
                  </Animated.View>
                }
                title="Retrain Model"
                subtitle={retraining ? 'Training…' : 'Update risk predictions with new data'}
                right={retraining ? <ActivityIndicator size="small" color={MonikeColors.accentPulse} /> : undefined}
                onPress={retrainModel}
              />

              <ActionRow
                icon={<DollarSign size={17} color={MonikeColors.inkSecondary} strokeWidth={1.7} />}
                title="Flow Velocity"
                subtitle="Set limits and track spending"
                onPress={navigateToBudget}
              />

              <ActionRow
                icon={<Activity size={17} color={MonikeColors.inkSecondary} strokeWidth={1.7} />}
                title="Patternns"
                subtitle="See detailed patterns in your transactions"
                onPress={() => {
                  closeDrawer();
                  router.navigate('/patterns');
                }}
              />

              {toastVisible && (
                <Animated.View style={[styles.toastWrap, { opacity: toastOpacity }]}>
                  <View style={styles.toastPip} />
                  <Text style={styles.toastText}>Model updated</Text>
                </Animated.View>
              )}

              <View style={styles.divider} />

              {/* DB status */}
              <View style={styles.dbRow}>
                <View style={styles.statusDotWrap}>
                  <Animated.View style={[styles.statusPulse, { opacity: dbPulseOpacity, transform: [{ scale: dbPulseScale }] }]} />
                  <View style={styles.statusDot} />
                </View>
                <Text style={styles.dbText}>PostgreSQL · monike</Text>
                <Text style={styles.syncText}>synced 2m ago</Text>
              </View>

              <View style={{ flex: 1 }} />

              {/* Version */}
              <View style={[styles.versionBlock, { paddingBottom: insets.bottom + 20 }]}>
                <Text style={styles.version}>MONIKE v1.0.0</Text>
              </View>
            </Animated.View>
          </>
        )}

        {/* Alerts sheet */}
        <Modal visible={alertsVisible} transparent animationType="fade" onRequestClose={() => setAlertsVisible(false)}>
          <Pressable style={styles.sheetScrim} onPress={() => setAlertsVisible(false)}>
            <SafeAreaView edges={['bottom']} style={styles.alertSheet}>
              <View style={styles.alertHandle} />
              <Text style={styles.alertTitle}>Notifications</Text>
              <Text style={styles.alertEmpty}>No alerts yet</Text>
            </SafeAreaView>
          </Pressable>
        </Modal>
      </View>
    </ShellContext.Provider>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ color = MonikeColors.inkPrimary, label, value }: { color?: string; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon, onPress, right, subtitle, title,
}: {
  icon: ReactNode;
  onPress: () => void;
  right?: ReactNode;
  subtitle: string;
  title: string;
}) {
  const bg = useRef(new Animated.Value(0)).current;
  const bgColor = bg.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', MonikeColors.bgElevated] });
  return (
    <Pressable
      onPressIn={() => Animated.timing(bg, { toValue: 1, duration: 60, useNativeDriver: false }).start()}
      onPressOut={() => Animated.timing(bg, { toValue: 0, duration: 180, useNativeDriver: false }).start()}
      onPress={onPress}
    >
      <Animated.View style={[styles.actionRow, { backgroundColor: bgColor }]}>
        <View style={styles.actionIconWrap}>{icon}</View>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSubtitle}>{subtitle}</Text>
        </View>
        {right ?? <ChevronRight size={15} color={MonikeColors.inkGhost} strokeWidth={2} />}
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shell
  shellRoot: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  appContent: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  edgeSwipeZone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, zIndex: 30 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 80 },

  // Drawer
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 90,
    backgroundColor: MonikeColors.bgSurface,
    borderRightWidth: 1,
    borderRightColor: MonikeColors.inkGhost,
  },

  closeRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile block
  profileBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: MonikeColors.accentPulse,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarRing: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: MonikeColors.accentPulse,
    opacity: 0.28,
  },
  avatarText: {
    color: MonikeColors.bgVoid,
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  profileMeta: { gap: 3 },
  name: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
  },
  email: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  editProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 11,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${MonikeColors.accentPulse}40`,
    backgroundColor: `${MonikeColors.accentPulse}0D`,
  },
  editText: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },

  // Stats
  statsStrip: {
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700' },
  statLabel: {
    marginTop: 4,
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  statSep: { width: 1, height: 28, backgroundColor: MonikeColors.inkGhost },

  // Divider
  divider: { height: 1, backgroundColor: MonikeColors.inkGhost, marginVertical: 10 },

  // Section label
  sectionLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },

  // Action rows
  actionRow: {
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1 },
  actionTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
  },
  actionSubtitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },

  // Toast
  toastWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  toastPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MonikeColors.accentPulse,
  },
  toastText: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },

  // DB status
  dbRow: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  statusPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: MonikeColors.accentPulse,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: MonikeColors.accentPulse,
  },
  dbText: { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  syncText: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },

  // Version
  versionBlock: { paddingHorizontal: 20, paddingTop: 12 },
  version: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // Alerts modal
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  alertSheet: {
    minHeight: 200,
    backgroundColor: MonikeColors.bgSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  alertHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonikeColors.inkGhost,
    marginBottom: 4,
  },
  alertTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  alertEmpty: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
});
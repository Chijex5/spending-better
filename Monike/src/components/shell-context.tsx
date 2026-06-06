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
import {
  ChevronRight,
  Pencil,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react-native';

import { Fonts, MonikeColors } from '@/constants/theme';

type ShellContextValue = {
  openDrawer: () => void;
  closeDrawer: () => void;
  showAlerts: (hasAlerts?: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useMonikeShell() {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error('useMonikeShell must be used inside MonikeShellProvider');
  }
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

  const width = Dimensions.get('window').width;
  const drawerWidth = width * 0.78;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(dbPing, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [dbPing]);

  useEffect(() => {
    if (!retraining) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [retraining, spin]);

  const animateDrawer = (open: boolean) => {
    if (open) setDrawerOpen(true);
    Animated.timing(drawerProgress, {
      toValue: open ? 1 : 0,
      duration: open ? 300 : 250,
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
      onMoveShouldSetPanResponder: (_, gesture) => !drawerOpen && gesture.moveX <= 32 && gesture.dx > 12 && Math.abs(gesture.dy) < 20,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 24) openDrawer();
      },
    }),
    [drawerOpen]
  );

  const drawerPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => drawerOpen && gesture.dx < -12 && Math.abs(gesture.dy) < 24,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -28) closeDrawer();
      },
    }),
    [drawerOpen]
  );

  const navigateToSettings = () => {
    closeDrawer();
    router.navigate('/settings');
  };

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
    []
  );

  const translateX = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] });
  const scrimOpacity = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const contentScale = drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const dbPulseScale = dbPing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const dbPulseOpacity = dbPing.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <ShellContext.Provider value={shell}>
      <View style={styles.shellRoot}>
        <Animated.View style={[styles.appContent, { transform: [{ scale: contentScale }] }]}>{children}</Animated.View>

        {!drawerOpen ? <View style={styles.edgeSwipeZone} {...edgePanResponder.panHandlers} /> : null}

        {drawerOpen ? (
          <>
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
            </Animated.View>
            <Animated.View
              style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}
              {...drawerPanResponder.panHandlers}
            >
              <View style={styles.drawerAtmosphere} />
              <View style={{ height: insets.top }} />
              <View style={styles.closeRow}>
                <Pressable style={styles.closeButton} onPress={closeDrawer}>
                  <X size={20} color={MonikeColors.inkMuted} strokeWidth={1.9} />
                </Pressable>
              </View>

              <View style={styles.profileBlock}>
                <View style={styles.avatar}><Text style={styles.avatarText}>C</Text></View>
                <Text style={styles.name}>Chijioke</Text>
                <Text style={styles.email}>chijioke@monike.app</Text>
                <Pressable style={styles.editProfile} onPress={navigateToSettings}>
                  <Pencil size={13} color={MonikeColors.accentPulse} strokeWidth={2} />
                  <Text style={styles.editText}>Edit Profile</Text>
                </Pressable>
              </View>

              <View style={styles.dividerCompact} />
              <View style={styles.statsStrip}>
                <Stat value="142" label="TXN THIS MO" />
                <View style={styles.statSeparator} />
                <Stat value="156" label="DAYS TRACKED" />
                <View style={styles.statSeparator} />
                <Stat value="8" label="HIGH DAYS" color={MonikeColors.signalRed} />
              </View>
              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
              <ActionRow
                icon={<Settings size={18} color={MonikeColors.inkSecondary} strokeWidth={1.8} />}
                title="Settings"
                subtitle="Notifications, threshold, export"
                onPress={navigateToSettings}
              />
              <ActionRow
                icon={<Animated.View style={{ transform: [{ rotate }] }}><RefreshCw size={18} color={MonikeColors.inkSecondary} strokeWidth={1.8} /></Animated.View>}
                title="Retrain Model"
                subtitle={retraining ? 'Training...' : 'Update risk predictions with new data'}
                right={retraining ? <ActivityIndicator size="small" color={MonikeColors.accentPulse} /> : undefined}
                onPress={retrainModel}
              />
              {toastVisible ? <Animated.Text style={[styles.toast, { opacity: toastOpacity }]}>✓ Model updated</Animated.Text> : null}

              <View style={styles.divider} />
              <View style={styles.dbRow}>
                <View style={styles.statusDotWrap}><Animated.View style={[styles.statusPulse, { opacity: dbPulseOpacity, transform: [{ scale: dbPulseScale }] }]} /><View style={styles.statusDot} /></View>
                <Text style={styles.dbText}>PostgreSQL · monike</Text>
                <Text style={styles.syncText}>synced 2m ago</Text>
              </View>

              <View style={{ flex: 1 }} />
              <View style={[styles.versionBlock, { paddingBottom: insets.bottom + 16 }] }>
                <Text style={styles.version}>MONIKE v1.0.0</Text>
              </View>
            </Animated.View>
          </>
        ) : null}

        <Modal visible={alertsVisible} transparent animationType="fade" onRequestClose={() => setAlertsVisible(false)}>
          <Pressable style={styles.sheetScrim} onPress={() => setAlertsVisible(false)}>
            <SafeAreaView edges={['bottom']} style={styles.alertSheet}>
              <Text style={styles.alertText}>No alerts yet</Text>
            </SafeAreaView>
          </Pressable>
        </Modal>
      </View>
    </ShellContext.Provider>
  );
}

function Stat({ color = MonikeColors.inkPrimary, label, value }: { color?: string; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({ icon, onPress, right, subtitle, title }: { icon: ReactNode; onPress: () => void; right?: ReactNode; subtitle: string; title: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      {right ?? <ChevronRight size={16} color={MonikeColors.inkGhost} strokeWidth={2} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shellRoot: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  appContent: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  edgeSwipeZone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, zIndex: 30 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 80 },
  drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 90, backgroundColor: MonikeColors.bgSurface, borderRightWidth: 1, borderRightColor: MonikeColors.inkGhost },
  drawerAtmosphere: { position: 'absolute', left: 0, right: 0, top: 0, height: '30%', backgroundColor: 'rgba(0,230,118,0.015)' },
  closeRow: { alignItems: 'flex-end', paddingRight: 20, paddingTop: 20 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  profileBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: MonikeColors.accentPulse, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: MonikeColors.bgVoid, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '700' },
  name: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 17, fontWeight: '700' },
  email: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 12, marginTop: 4 },
  editProfile: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  editText: { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 12 },
  dividerCompact: { height: 1, backgroundColor: MonikeColors.inkGhost, marginVertical: 4 },
  divider: { height: 1, backgroundColor: MonikeColors.inkGhost, marginVertical: 8 },
  statsStrip: { marginHorizontal: 16, paddingVertical: 16, paddingHorizontal: 20, backgroundColor: MonikeColors.bgElevated, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700' },
  statLabel: { marginTop: 4, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 9, fontWeight: '700', letterSpacing: 0.72 },
  statSeparator: { width: 1, height: 30, backgroundColor: MonikeColors.inkGhost },
  sectionLabel: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 10, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  actionRow: { minHeight: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  actionPressed: { backgroundColor: MonikeColors.bgElevated },
  actionIcon: { width: 34, alignItems: 'flex-start' },
  actionCopy: { flex: 1 },
  actionTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.sans, fontSize: 14 },
  actionSubtitle: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  toast: { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 12, paddingHorizontal: 54, paddingTop: 2, paddingBottom: 6 },
  dbRow: { paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  statusPulse: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#00E67644' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MonikeColors.accentPulse },
  dbText: { flex: 1, color: MonikeColors.inkSecondary, fontFamily: Fonts.mono, fontSize: 12 },
  syncText: { color: MonikeColors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
  versionBlock: { paddingHorizontal: 20, paddingTop: 16 },
  version: { color: MonikeColors.inkGhost, fontFamily: Fonts.mono, fontSize: 10 },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  alertSheet: { minHeight: 180, backgroundColor: MonikeColors.bgSurface, borderTopLeftRadius: 22, borderTopRightRadius: 22, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderColor: MonikeColors.inkGhost },
  alertText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 14 },
});

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, MonikeColors } from '@/constants/theme';

type ShellContextValue = {
  showAlerts: (hasAlerts?: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useMonikeShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useMonikeShell must be used inside MonikeShellProvider');
  return context;
}

export function MonikeShellProvider({ children }: { children: ReactNode }) {
  const [alertsVisible, setAlertsVisible] = useState(false);

  const shell = useMemo<ShellContextValue>(
    () => ({ showAlerts: () => setAlertsVisible(true) }),
    [],
  );

  return (
    <ShellContext.Provider value={shell}>
      <View style={styles.root}>{children}</View>

      <Modal
        visible={alertsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertsVisible(false)}
      >
        <Pressable style={styles.sheetScrim} onPress={() => setAlertsVisible(false)}>
          <SafeAreaView edges={['bottom']} style={styles.alertSheet}>
            <View style={styles.alertHandle} />
            <Text style={styles.alertTitle}>Notifications</Text>
            <Text style={styles.alertEmpty}>No alerts yet</Text>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </ShellContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },

  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
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

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Menu } from 'lucide-react-native';

import { useMonikeShell } from '@/components/shell-context';
import { Fonts, MonikeColors } from '@/constants/theme';

export function MonikeHeader({ hasAlerts = false, home = false, title }: { hasAlerts?: boolean; home?: boolean; title: string }) {
  const { openDrawer, showAlerts } = useMonikeShell();

  return (
    <View style={styles.header}>
      <Pressable style={styles.iconButton} onPress={openDrawer}>
        <Menu size={22} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
      </Pressable>
      <Text style={home ? styles.wordmark : styles.title}>{home ? 'MONIKE' : title}</Text>
      <Pressable style={styles.iconButton} onPress={() => showAlerts(hasAlerts)}>
        <Bell size={22} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
        {hasAlerts ? <View style={styles.alertDot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 15, fontWeight: '600', letterSpacing: 0.6 },
  wordmark: { color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 13, fontWeight: '700', letterSpacing: 2.6 },
  alertDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: MonikeColors.accentPulse },
});

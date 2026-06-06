import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings } from 'lucide-react-native';

import { MonikeHeader } from '@/components/monike-header';
import { Fonts, MonikeColors } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <MonikeHeader title="Settings" />
        <View style={styles.placeholder}>
          <Settings size={48} color={MonikeColors.inkGhost} strokeWidth={1.7} />
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Coming soon</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  safeArea: { flex: 1, backgroundColor: MonikeColors.bgVoid },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 16, color: MonikeColors.inkSecondary, fontFamily: Fonts.heading, fontSize: 18, fontWeight: '600' },
  subtitle: { marginTop: 8, color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 13 },
});

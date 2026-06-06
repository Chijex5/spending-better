import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlusCircle } from 'lucide-react-native';

import { BottomNavigation } from '@/components/bottom-navigation';
import { MonikeHeader } from '@/components/monike-header';
import { BottomTabInset, Fonts, MonikeColors } from '@/constants/theme';

export default function LogScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <MonikeHeader title="Log Spend" />
        <View style={[styles.placeholder, { paddingBottom: insets.bottom + BottomTabInset }]}>
          <PlusCircle size={48} color={MonikeColors.inkGhost} strokeWidth={1.7} />
          <Text style={styles.title}>Log Spend</Text>
          <Text style={styles.subtitle}>Coming soon</Text>
        </View>
      </SafeAreaView>
      <BottomNavigation activeRoute="log" />
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

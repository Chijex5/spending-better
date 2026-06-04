import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <ThemedView type="backgroundElement" style={styles.tabList}>
          <TabTrigger name="index" href="/" asChild>
            <Pressable style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold">Dashboard</ThemedText>
            </Pressable>
          </TabTrigger>
        </ThemedView>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabList: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    borderRadius: Spacing.four,
    padding: Spacing.one,
  },
  tabButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});

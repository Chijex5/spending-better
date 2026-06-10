import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Activity,
  DollarSign,
  RefreshCw,
  Settings,
  TrendingUp,
} from 'lucide-react-native';

import { MonikeHeader } from '@/components/monike-header';
import { BottomNavigation } from '@/components/bottom-navigation';
import { Fonts, MonikeColors, BottomTabInset } from '@/constants/theme';
import { API_BASE_URL } from '@/services/api';

const ORANGE = MonikeColors.accentOrange;

export default function MorePage() {
  const router = useRouter();

  const [retraining, setRetraining]     = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const spin         = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!retraining) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [retraining, spin]);

  const retrainModel = useCallback(async () => {
    if (retraining) return;
    setRetraining(true);
    try {
      await fetch(`${API_BASE_URL}/retrain`, { method: 'POST' });
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
  }, [retraining, toastOpacity]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <MonikeHeader title="More" subtitle="Do more on the Monike app" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.chooseLabel}>Choose what you want to do</Text>

        <MenuItem
          icon={<Settings size={20} color={ORANGE} strokeWidth={1.7} />}
          title="Settings"
          subtitle="Notifications, threshold, export"
          onPress={() => router.navigate('/settings')}
        />
        <MenuItem
          icon={<Activity size={20} color={ORANGE} strokeWidth={1.7} />}
          title="Risk"
          subtitle="Spending risk analysis and forecast"
          onPress={() => router.navigate('/forecast' as any)}
        />
        <MenuItem
          icon={<TrendingUp size={20} color={ORANGE} strokeWidth={1.7} />}
          title="Patterns"
          subtitle="Detailed transaction pattern analysis"
          onPress={() => router.navigate('/patterns' as any)}
        />
        <MenuItem
          icon={<DollarSign size={20} color={ORANGE} strokeWidth={1.7} />}
          title="Flow Velocity"
          subtitle="Budget limits and spend velocity"
          onPress={() => router.navigate('/flow-velocity' as any)}
        />
        <MenuItem
          icon={
            <Animated.View style={{ transform: [{ rotate }] }}>
              <RefreshCw size={20} color={ORANGE} strokeWidth={1.7} />
            </Animated.View>
          }
          title="Retrain Model"
          subtitle={retraining ? 'Training…' : 'Update risk predictions with new data'}
          right={retraining ? <ActivityIndicator size="small" color={MonikeColors.accentPulse} /> : undefined}
          onPress={retrainModel}
        />

        {toastVisible && (
          <Animated.View style={[s.toast, { opacity: toastOpacity }]}>
            <View style={s.toastPip} />
            <Text style={s.toastText}>Model updated successfully</Text>
          </Animated.View>
        )}
      </ScrollView>

      <BottomNavigation activeRoute="more" />
    </SafeAreaView>
  );
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  right?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && s.cardPressed]}
      onPress={onPress}
    >
      <View style={s.iconBox}>{icon}</View>
      <View style={s.copy}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
      {right ?? null}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: MonikeColors.bgVoid },
  scroll:  { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: BottomTabInset + 20,
    gap: 10,
  },

  chooseLabel: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },

  // Each item is its own standalone card — matching Zenith's separated layout
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: MonikeColors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#21282F',
  },
  cardPressed: {
    backgroundColor: MonikeColors.bgOverlay,
  },

  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${ORANGE}15`,
    borderWidth: 1,
    borderColor: `${ORANGE}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  copy: { flex: 1 },
  title: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },

  // Toast
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: `${MonikeColors.accentPulse}30`,
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
});

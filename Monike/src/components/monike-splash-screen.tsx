import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const LOAD_DURATION_MS = 1500;

export function MonikeSplashScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: LOAD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <Text style={styles.logo}>Monike</Text>
        <Text style={styles.arrow}>↗</Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      <Text style={styles.tagline}>Know where your money goes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  arrow: {
    color: '#2ECC71',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -16,
  },
  progressTrack: {
    width: 220,
    height: 2,
    borderRadius: 99,
    backgroundColor: '#2ECC7140',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2ECC71',
  },
  tagline: {
    color: '#8A8A8A',
    fontSize: 12,
    lineHeight: 16,
  },
});

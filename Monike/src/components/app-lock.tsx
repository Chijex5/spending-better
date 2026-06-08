import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react-native';

import { Fonts, MonikeColors } from '@/constants/theme';

type AutoLockMinutes = 5 | 30;

type AppLockContextValue = {
  autoLockMinutes: AutoLockMinutes;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  beginPinChange: () => void;
  lockNow: () => void;
  setAutoLockMinutes: (minutes: AutoLockMinutes) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
};

const PIN_KEY = 'monike.pin';
const BIOMETRIC_KEY = 'monike.biometricEnabled';
const AUTO_LOCK_KEY = 'monike.autoLockMinutes';
const DEFAULT_AUTO_LOCK_MINUTES: AutoLockMinutes = 5;

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('useAppLock must be used inside AppLockProvider');
  return context;
}

async function getStoredValue(key: string) {
  if (Platform.OS === 'web') return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

function normaliseAutoLock(value: string | null): AutoLockMinutes {
  return value === '30' ? 30 : 5;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState<string | null>(null);
  const [pinEntry, setPinEntry] = useState('');
  const [mode, setMode] = useState<'create' | 'unlock'>('unlock');
  const [message, setMessage] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<AutoLockMinutes>(DEFAULT_AUTO_LOCK_MINUTES);
  const lastInactiveAt = useRef<number | null>(null);

  const unlockWithBiometrics = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Monike',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (result.success) {
      setLocked(false);
      setPinEntry('');
      setMessage('');
      return true;
    }
    return false;
  }, [biometricAvailable, biometricEnabled]);

  useEffect(() => {
    let mounted = true;
    async function bootstrapLock() {
      const [storedPin, storedBiometric, storedAutoLock, hasHardware, enrolled] = await Promise.all([
        getStoredValue(PIN_KEY),
        getStoredValue(BIOMETRIC_KEY),
        getStoredValue(AUTO_LOCK_KEY),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      if (!mounted) return;
      const canUseBiometrics = Boolean(hasHardware && enrolled);
      setPin(storedPin);
      setMode(storedPin ? 'unlock' : 'create');
      setBiometricAvailable(canUseBiometrics);
      setBiometricEnabledState(storedBiometric === 'true' && canUseBiometrics);
      setAutoLockMinutesState(normaliseAutoLock(storedAutoLock));
      setReady(true);
      setLocked(true);
    }
    void bootstrapLock();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || !locked || mode !== 'unlock') return;
    void unlockWithBiometrics();
  }, [locked, mode, ready, unlockWithBiometrics]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        lastInactiveAt.current = Date.now();
        return;
      }
      if (state !== 'active' || !lastInactiveAt.current) return;
      const elapsedMinutes = (Date.now() - lastInactiveAt.current) / 60000;
      if (elapsedMinutes >= autoLockMinutes) {
        setMode(pin ? 'unlock' : 'create');
        setLocked(true);
      }
      lastInactiveAt.current = null;
    });
    return () => subscription.remove();
  }, [autoLockMinutes, pin]);

  const submitPin = async () => {
    if (pinEntry.length !== 4) {
      setMessage('Enter a 4-digit PIN.');
      return;
    }

    if (mode === 'create') {
      await setStoredValue(PIN_KEY, pinEntry);
      setPin(pinEntry);
      setMode('unlock');
      setLocked(false);
      setPinEntry('');
      setMessage('');
      return;
    }

    if (pinEntry === pin) {
      setLocked(false);
      setPinEntry('');
      setMessage('');
      return;
    }

    setPinEntry('');
    setMessage('Incorrect PIN. Try again.');
  };

  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !biometricAvailable) {
      Alert.alert('Biometrics unavailable', 'Set up Face ID, Touch ID, or fingerprint unlock on this device first.');
      return;
    }
    if (enabled) {
      const ok = await unlockWithBiometrics();
      if (!ok) return;
    }
    setBiometricEnabledState(enabled);
    await setStoredValue(BIOMETRIC_KEY, String(enabled));
  }, [biometricAvailable, unlockWithBiometrics]);

  const setAutoLockMinutes = useCallback(async (minutes: AutoLockMinutes) => {
    setAutoLockMinutesState(minutes);
    await setStoredValue(AUTO_LOCK_KEY, String(minutes));
  }, []);

  const context = useMemo<AppLockContextValue>(() => ({
    autoLockMinutes,
    biometricAvailable,
    biometricEnabled,
    beginPinChange: () => {
      setMode('create');
      setLocked(true);
      setPinEntry('');
      setMessage('Choose a new 4-digit PIN.');
    },
    lockNow: () => {
      setMode(pin ? 'unlock' : 'create');
      setLocked(true);
    },
    setAutoLockMinutes,
    setBiometricEnabled,
  }), [autoLockMinutes, biometricAvailable, biometricEnabled, pin, setAutoLockMinutes, setBiometricEnabled]);

  return (
    <AppLockContext.Provider value={context}>
      {children}
      {!ready || locked ? (
        <View style={styles.lockOverlay}>
          <View style={styles.lockCard}>
            <View style={styles.lockIconWrap}>
              <LockKeyhole size={30} color={MonikeColors.accentPulse} strokeWidth={1.8} />
            </View>
            <Text style={styles.lockTitle}>{!ready ? 'Securing Monike' : mode === 'create' ? 'Protect Monike' : 'Unlock Monike'}</Text>
            <Text style={styles.lockSubtitle}>
              {!ready
                ? 'Preparing the privacy lock before showing your finance data.'
                : mode === 'create'
                ? 'Create a 4-digit PIN before using your finance dashboard.'
                : 'Your spending and cashflow data are locked.'}
            </Text>

            {ready ? (
              <>
                <View style={styles.pinDots}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pinDot, pinEntry.length > i && styles.pinDotFilled]} />
              ))}
                </View>
            {message ? <Text style={styles.lockMessage}>{message}</Text> : null}

            <View style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((key) => (
                <Pressable
                  key={key}
                  style={[styles.keypadButton, key === 'OK' && styles.keypadButtonPrimary]}
                  onPress={() => {
                    if (key === '⌫') {
                      setPinEntry((prev) => prev.slice(0, -1));
                    } else if (key === 'OK') {
                      void submitPin();
                    } else {
                      setPinEntry((prev) => (prev.length < 4 ? `${prev}${key}` : prev));
                    }
                  }}
                >
                  <Text style={[styles.keypadText, key === 'OK' && styles.keypadTextPrimary]}>{key}</Text>
                </Pressable>
              ))}
            </View>

            {mode === 'unlock' && biometricEnabled && biometricAvailable ? (
              <Pressable style={styles.biometricButton} onPress={() => void unlockWithBiometrics()}>
                <Fingerprint size={16} color={MonikeColors.accentPulse} strokeWidth={1.8} />
                <Text style={styles.biometricText}>Use biometrics</Text>
              </Pressable>
            ) : null}

            <View style={styles.secureRow}>
              <ShieldCheck size={13} color={MonikeColors.inkMuted} strokeWidth={1.8} />
              <Text style={styles.secureText}>Auto-locks after {autoLockMinutes} minutes away.</Text>
            </View>
            </>
            ) : null}
          </View>
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: MonikeColors.bgVoid,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: MonikeColors.bgSurface,
    padding: 22,
    alignItems: 'center',
  },
  lockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: `${MonikeColors.accentPulse}16`,
    borderWidth: 1,
    borderColor: `${MonikeColors.accentPulse}35`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockTitle: { color: MonikeColors.inkPrimary, fontFamily: Fonts.heading, fontSize: 22, fontWeight: '800' },
  lockSubtitle: { marginTop: 8, color: MonikeColors.inkSecondary, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  pinDots: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 },
  pinDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: MonikeColors.inkMuted },
  pinDotFilled: { backgroundColor: MonikeColors.accentPulse, borderColor: MonikeColors.accentPulse },
  lockMessage: { color: MonikeColors.signalAmber, fontFamily: Fonts.sans, fontSize: 12, marginBottom: 6 },
  keypad: { marginTop: 12, width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  keypadButton: {
    width: '29%',
    height: 52,
    borderRadius: 16,
    backgroundColor: MonikeColors.bgElevated,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonPrimary: { backgroundColor: MonikeColors.accentPulse, borderColor: MonikeColors.accentPulse },
  keypadText: { color: MonikeColors.inkPrimary, fontFamily: Fonts.mono, fontSize: 18, fontWeight: '700' },
  keypadTextPrimary: { color: MonikeColors.bgVoid },
  biometricButton: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  biometricText: { color: MonikeColors.accentPulse, fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  secureRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secureText: { color: MonikeColors.inkMuted, fontFamily: Fonts.sans, fontSize: 11 },
});

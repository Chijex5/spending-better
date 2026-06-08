import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, LockKeyhole, ShieldCheck, Delete } from 'lucide-react-native';

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

// ─── PIN Flow modes ────────────────────────────────────────────────────────────
// 'unlock'         → normal unlock at startup / after auto-lock
// 'create'         → first-time PIN setup
// 'change_current' → verifying current PIN before change
// 'change_new'     → entering new PIN
// 'change_confirm' → confirming new PIN

type PinMode = 'unlock' | 'create' | 'change_current' | 'change_new' | 'change_confirm';

// ─── Digit display ─────────────────────────────────────────────────────────────

function PinDigit({ filled, shake }: { filled: boolean; shake: Animated.Value }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (filled) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 80, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [filled, scale]);

  const translateX = shake.interpolate({
    inputRange: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1],
    outputRange: [0, -8, 8, -8, 8, -4, 0],
  });

  return (
    <Animated.View style={[styles.pinDigit, filled && styles.pinDigitFilled, { transform: [{ scale }, { translateX }] }]}>
      {filled && <View style={styles.pinDigitDot} />}
    </Animated.View>
  );
}

function triggerShake(anim: Animated.Value) {
  anim.setValue(0);
  Animated.timing(anim, {
    toValue: 1,
    duration: 400,
    useNativeDriver: true,
    easing: Easing.linear,
  }).start(() => anim.setValue(0));
}

// ─── Keypad ────────────────────────────────────────────────────────────────────

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((key, idx) => {
        if (key === '') {
          return <View key={idx} style={styles.keypadEmpty} />;
        }
        const isDel = key === 'DEL';
        return (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.keypadKey, isDel && styles.keypadKeyDel, pressed && styles.keypadKeyPressed]}
            onPress={() => onKey(key)}
          >
            {isDel
              ? <Delete size={18} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
              : <Text style={styles.keypadKeyText}>{key}</Text>
            }
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Pin Screen ────────────────────────────────────────────────────────────────

function PinScreen({
  mode,
  entry,
  message,
  shakeAnim,
  biometricEnabled,
  biometricAvailable,
  autoLockMinutes,
  onKey,
  onBiometric,
  onBack,
}: {
  mode: PinMode;
  entry: string;
  message: string;
  shakeAnim: Animated.Value;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  autoLockMinutes: AutoLockMinutes;
  onKey: (k: string) => void;
  onBiometric: () => void;
  onBack?: () => void;
}) {
  const titleMap: Record<PinMode, string> = {
    unlock: 'Enter PIN',
    create: 'Create PIN',
    change_current: 'Confirm current PIN',
    change_new: 'Choose new PIN',
    change_confirm: 'Confirm new PIN',
  };

  const subtitleMap: Record<PinMode, string> = {
    unlock: 'Your finance data is locked.',
    create: 'Set a 4-digit PIN to protect your data.',
    change_current: 'Enter your existing PIN to continue.',
    change_new: 'Enter a new 4-digit PIN.',
    change_confirm: 'Re-enter the PIN to confirm.',
  };

  const showBiometric = mode === 'unlock' && biometricEnabled && biometricAvailable;
  const showBack = mode === 'change_current';

  return (
    <View style={styles.lockOverlay}>
      <View style={styles.lockCard}>
        {/* Header */}
        <View style={styles.lockCardHeader}>
          {showBack && (
            <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
          )}
          <View style={styles.lockIconWrap}>
            <LockKeyhole size={26} color={MonikeColors.accentPulse} strokeWidth={1.6} />
          </View>
          <Text style={styles.lockTitle}>{titleMap[mode]}</Text>
          <Text style={styles.lockSubtitle}>{subtitleMap[mode]}</Text>
        </View>

        {/* PIN dots */}
        <View style={styles.pinRow}>
          {[0, 1, 2, 3].map((i) => (
            <PinDigit key={i} filled={i < entry.length} shake={i < entry.length ? shakeAnim : new Animated.Value(0)} />
          ))}
        </View>

        {/* Error message */}
        {message ? (
          <Text style={styles.pinMessage}>{message}</Text>
        ) : (
          <View style={{ height: 18 }} />
        )}

        {/* Keypad */}
        <Keypad onKey={onKey} />

        {/* Biometric */}
        {showBiometric && (
          <Pressable style={styles.biometricButton} onPress={onBiometric}>
            <Fingerprint size={16} color={MonikeColors.accentPulse} strokeWidth={1.8} />
            <Text style={styles.biometricText}>Use biometrics</Text>
          </Pressable>
        )}

        {/* Footer */}
        <View style={styles.secureRow}>
          <ShieldCheck size={12} color={MonikeColors.inkGhost} strokeWidth={1.8} />
          <Text style={styles.secureText}>Locks after {autoLockMinutes} min away</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState<string | null>(null);
  const [mode, setMode] = useState<PinMode>('unlock');
  const [entry, setEntry] = useState('');
  const [pendingNewPin, setPendingNewPin] = useState('');
  const [message, setMessage] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<AutoLockMinutes>(DEFAULT_AUTO_LOCK_MINUTES);
  const lastInactiveAt = useRef<number | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const unlockWithBiometrics = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Monike',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (result.success) {
      setLocked(false);
      setEntry('');
      setMessage('');
      return true;
    }
    return false;
  }, [biometricAvailable, biometricEnabled]);

  // Standalone biometric prompt (not tied to lock state) — for enabling feature
  const promptBiometricForEnabling = useCallback(async (): Promise<boolean> => {
    if (!biometricAvailable) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm with biometrics to enable',
      fallbackLabel: 'Cancel',
      disableDeviceFallback: true,
    });
    return result.success;
  }, [biometricAvailable]);

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

  // Auto-attempt biometrics on lock screen
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

  const handleKey = useCallback((key: string) => {
    if (key === 'DEL') {
      setEntry((prev) => prev.slice(0, -1));
      setMessage('');
      return;
    }

    setEntry((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + key;

      // Auto-submit when 4th digit entered
      if (next.length === 4) {
        // defer to avoid batched setState conflict
        setTimeout(() => handleSubmit(next), 80);
      }

      return next;
    });
  }, [mode, pin, pendingNewPin]); // eslint-disable-line

  const handleSubmit = useCallback((submittedEntry: string) => {
    if (submittedEntry.length !== 4) return;

    if (mode === 'create') {
      void (async () => {
        await setStoredValue(PIN_KEY, submittedEntry);
        setPin(submittedEntry);
        setMode('unlock');
        setLocked(false);
        setEntry('');
        setMessage('');
      })();
      return;
    }

    if (mode === 'unlock') {
      if (submittedEntry === pin) {
        setLocked(false);
        setEntry('');
        setMessage('');
      } else {
        triggerShake(shakeAnim);
        setEntry('');
        setMessage('Incorrect PIN');
      }
      return;
    }

    if (mode === 'change_current') {
      if (submittedEntry === pin) {
        setMode('change_new');
        setEntry('');
        setMessage('');
      } else {
        triggerShake(shakeAnim);
        setEntry('');
        setMessage('Incorrect PIN');
      }
      return;
    }

    if (mode === 'change_new') {
      setPendingNewPin(submittedEntry);
      setMode('change_confirm');
      setEntry('');
      setMessage('');
      return;
    }

    if (mode === 'change_confirm') {
      if (submittedEntry === pendingNewPin) {
        void (async () => {
          await setStoredValue(PIN_KEY, submittedEntry);
          setPin(submittedEntry);
          setPendingNewPin('');
          // Return to app — go back to unlock mode but immediately unlock
          setMode('unlock');
          setLocked(false);
          setEntry('');
          setMessage('');
        })();
      } else {
        triggerShake(shakeAnim);
        setPendingNewPin('');
        setMode('change_new');
        setEntry('');
        setMessage('PINs don\'t match — try again');
      }
      return;
    }
  }, [mode, pin, pendingNewPin, shakeAnim]);

  // Fix: setBiometricEnabled no longer gates on unlockWithBiometrics (which requires lock screen)
  // Instead, it calls a standalone biometric prompt for confirmation when ENABLING
  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !biometricAvailable) {
      Alert.alert('Biometrics unavailable', 'Set up Face ID, Touch ID, or fingerprint on this device first.');
      return;
    }
    if (enabled) {
      const confirmed = await promptBiometricForEnabling();
      if (!confirmed) return; // user cancelled — don't toggle on
    }
    setBiometricEnabledState(enabled);
    await setStoredValue(BIOMETRIC_KEY, String(enabled));
  }, [biometricAvailable, promptBiometricForEnabling]);

  const setAutoLockMinutes = useCallback(async (minutes: AutoLockMinutes) => {
    setAutoLockMinutesState(minutes);
    await setStoredValue(AUTO_LOCK_KEY, String(minutes));
  }, []);

  const context = useMemo<AppLockContextValue>(() => ({
    autoLockMinutes,
    biometricAvailable,
    biometricEnabled,
    beginPinChange: () => {
      setMode('change_current');
      setLocked(true);
      setEntry('');
      setMessage('');
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
      {(!ready || locked) ? (
        ready ? (
          <PinScreen
            mode={mode}
            entry={entry}
            message={message}
            shakeAnim={shakeAnim}
            biometricEnabled={biometricEnabled}
            biometricAvailable={biometricAvailable}
            autoLockMinutes={autoLockMinutes}
            onKey={handleKey}
            onBiometric={() => void unlockWithBiometrics()}
            onBack={mode === 'change_current' ? () => {
              setMode('unlock');
              setLocked(false);
              setEntry('');
              setMessage('');
            } : undefined}
          />
        ) : (
          // Boot splash — just the lock icon while SecureStore loads
          <View style={styles.bootSplash}>
            <View style={styles.lockIconWrap}>
              <LockKeyhole size={26} color={MonikeColors.accentPulse} strokeWidth={1.6} />
            </View>
            <Text style={styles.bootText}>Securing Monike…</Text>
          </View>
        )
      ) : null}
    </AppLockContext.Provider>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  lockOverlay: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 1000,
    backgroundColor: MonikeColors.bgVoid,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  lockCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: MonikeColors.bgSurface,
    padding: 24,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 0,
  },

  lockCardHeader: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
    marginBottom: 8,
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  backButtonText: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },

  lockIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: `${MonikeColors.accentPulse}14`,
    borderWidth: 1,
    borderColor: `${MonikeColors.accentPulse}28`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  lockTitle: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  lockSubtitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 2,
  },

  // PIN dots — large, airy, elegant
  pinRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigit: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigitFilled: {
    borderColor: MonikeColors.accentPulse,
    backgroundColor: `${MonikeColors.accentPulse}20`,
  },
  pinDigitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MonikeColors.accentPulse,
  },
  pinMessage: {
    color: MonikeColors.signalAmber,
    fontFamily: Fonts.sans,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    height: 18,
  },

  // Keypad — clean, spacious, no border clutter
  keypad: {
    marginTop: 20,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  keypadKey: {
    width: '29.5%',
    height: 56,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyDel: {
    backgroundColor: 'transparent',
  },
  keypadKeyPressed: {
    backgroundColor: `${MonikeColors.accentPulse}18`,
  },
  keypadEmpty: {
    width: '29.5%',
    height: 56,
  },
  keypadKeyText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '600',
  },

  biometricButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: `${MonikeColors.accentPulse}10`,
    borderWidth: 1,
    borderColor: `${MonikeColors.accentPulse}25`,
  },
  biometricText: {
    color: MonikeColors.accentPulse,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },

  secureRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  secureText: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 10,
  },

  // Boot splash
  bootSplash: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 1000,
    backgroundColor: MonikeColors.bgVoid,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  bootText: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
});
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
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint, Delete } from 'lucide-react-native';

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
        Animated.timing(scale, { toValue: 1.3, duration: 70, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]).start();
    }
  }, [filled, scale]);

  const translateX = shake.interpolate({
    inputRange: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1],
    outputRange: [0, -8, 8, -8, 8, -4, 0],
  });

  return (
    <Animated.View style={[ls.pinDot, filled && ls.pinDotFilled, { transform: [{ scale }, { translateX }] }]}>
      {filled && <View style={ls.pinDotCore} />}
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
    <View style={ls.keypad}>
      {KEYS.map((key, idx) => {
        if (key === '') return <View key={idx} style={ls.keyEmpty} />;
        const isDel = key === 'DEL';
        return (
          <Pressable
            key={idx}
            style={({ pressed }) => [
              ls.key,
              isDel ? ls.keyDel : null,
              pressed ? ls.keyPressed : null,
            ]}
            onPress={() => onKey(key)}
          >
            {isDel
              ? <Delete size={20} color={MonikeColors.inkSecondary} strokeWidth={1.8} />
              : <Text style={ls.keyText}>{key}</Text>
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
  const headlineMap: Record<PinMode, string> = {
    unlock:         'Welcome back',
    create:         'Secure your data',
    change_current: 'Verify identity',
    change_new:     'Choose new PIN',
    change_confirm: 'Confirm new PIN',
  };

  const subtitleMap: Record<PinMode, string> = {
    unlock:         'Enter your 4-digit PIN to continue',
    create:         'Set a PIN to protect your finances',
    change_current: 'Enter your current PIN first',
    change_new:     'Pick a strong 4-digit PIN',
    change_confirm: 'Re-enter the same PIN to confirm',
  };

  const showBiometric = mode === 'unlock' && biometricEnabled && biometricAvailable;

  return (
    <SafeAreaView style={ls.screen} edges={['top', 'bottom']}>
      {/* Back button */}
      {onBack && (
        <Pressable onPress={onBack} style={ls.backBtn} hitSlop={12}>
          <Text style={ls.backBtnText}>← Back</Text>
        </Pressable>
      )}

      {/* ── Logo + Branding ── */}
      <View style={ls.hero}>
        <View style={ls.logoBox}>
          <Text style={ls.logoLetter}>M</Text>
        </View>
        <Text style={ls.appName}>MONIKE</Text>
      </View>

      {/* ── Mode headline ── */}
      <View style={ls.headlineBlock}>
        <Text style={ls.headline}>{headlineMap[mode]}</Text>
        <Text style={ls.subtitle}>{subtitleMap[mode]}</Text>
      </View>

      {/* ── PIN dots ── */}
      <View style={ls.pinRow}>
        {[0, 1, 2, 3].map((i) => (
          <PinDigit key={i} filled={i < entry.length} shake={i < entry.length ? shakeAnim : new Animated.Value(0)} />
        ))}
      </View>

      {/* ── Error message ── */}
      <View style={ls.messageBox}>
        {message ? <Text style={ls.message}>{message}</Text> : null}
      </View>

      {/* ── Keypad ── */}
      <Keypad onKey={onKey} />

      {/* ── Biometrics button (Zenith-style secondary button) ── */}
      {showBiometric && (
        <Pressable
          style={({ pressed }) => [ls.biometricBtn, pressed && ls.biometricBtnPressed]}
          onPress={onBiometric}
        >
          <Fingerprint size={18} color={MonikeColors.inkSecondary} strokeWidth={1.7} />
          <Text style={ls.biometricBtnText}>Login with biometrics</Text>
        </Pressable>
      )}

      {/* ── Footer ── */}
      <Text style={ls.footer}>Locks after {autoLockMinutes} min of inactivity</Text>
    </SafeAreaView>
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
          // Boot splash — branding while SecureStore loads
          <SafeAreaView style={ls.screen} edges={['top', 'bottom']}>
            <View style={ls.hero}>
              <View style={ls.logoBox}>
                <Text style={ls.logoLetter}>M</Text>
              </View>
              <Text style={ls.appName}>MONIKE</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={ls.footer}>Securing your data…</Text>
            </View>
          </SafeAreaView>
        )
      ) : null}
    </AppLockContext.Provider>
  );
}

// ─── Lock Screen Styles ────────────────────────────────────────────────────────

const ls = StyleSheet.create({
  // Full screen container — covers app like Zenith Bank's login screen
  screen: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 1000,
    backgroundColor: MonikeColors.bgVoid,
    paddingHorizontal: 28,
  },

  // Back button (change PIN flow)
  backBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backBtnText: {
    color: MonikeColors.accentOrange,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Logo / Branding ───────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    gap: 12,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: `${MonikeColors.accentOrange}15`,
    borderWidth: 1.5,
    borderColor: `${MonikeColors.accentOrange}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: MonikeColors.accentOrange,
    fontFamily: Fonts.heading,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 48,
  },
  appName: {
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },

  // ── Mode headline ─────────────────────────────────────────────────────────
  headlineBlock: {
    alignItems: 'center',
    marginTop: 28,
    gap: 6,
  },
  headline: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.heading,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: MonikeColors.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },

  // ── PIN dots ──────────────────────────────────────────────────────────────
  pinRow: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: MonikeColors.inkGhost,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotFilled: {
    borderColor: MonikeColors.accentOrange,
    backgroundColor: `${MonikeColors.accentOrange}22`,
  },
  pinDotCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MonikeColors.accentOrange,
  },

  // ── Error message ─────────────────────────────────────────────────────────
  messageBox: {
    height: 24,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    color: MonikeColors.signalAmber,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Keypad ────────────────────────────────────────────────────────────────
  keypad: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  key: {
    width: '29%',
    height: 62,
    borderRadius: 16,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDel: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyPressed: {
    backgroundColor: `${MonikeColors.accentOrange}14`,
    borderColor: `${MonikeColors.accentOrange}30`,
  },
  keyEmpty: {
    width: '29%',
    height: 62,
  },
  keyText: {
    color: MonikeColors.inkPrimary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '600',
  },

  // ── Biometrics button (Zenith "Login with Face ID" style) ─────────────────
  biometricBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 14,
    backgroundColor: MonikeColors.bgSurface,
    borderWidth: 1,
    borderColor: '#21282F',
  },
  biometricBtnPressed: {
    backgroundColor: MonikeColors.bgElevated,
  },
  biometricBtnText: {
    color: MonikeColors.inkSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 16,
    textAlign: 'center',
    color: MonikeColors.inkGhost,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },

});
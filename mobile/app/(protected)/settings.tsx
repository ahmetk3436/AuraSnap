import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  hapticError,
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../../lib/haptics';
import api from '../../lib/api';
import {
  loadGuestAuraHistory,
  type GuestAuraReading,
} from '../../lib/guestAuraHistory';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';

type ThemeMode = 'dark' | 'light' | 'system';

type DeleteStep = 1 | 2 | 3;

interface AuraSummary {
  totalScans: number;
  avgEnergy: number;
  avgMood: number;
  streak: number;
  uniqueColors: number;
}

interface SettingsRowProps {
  icon: string;
  activeIcon?: string;
  iconGradient: [string, string];
  label: string;
  description: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
  highlighted?: boolean;
  quickActionLabel?: string;
  quickActionColor?: string;
  onQuickAction?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const APP_VERSION = '1.0.0';
const GUEST_RETENTION_DAYS = 30;

const STORAGE_KEYS = {
  BIOMETRIC: 'biometric_enabled',
  THEME: 'theme_mode_v1',
  TRUE_BLACK: 'true_black_mode_v1',
  REMEMBER_ME: 'remember_me_v1',
  DEV_MODE: 'developer_mode_enabled_v1',
  PROFILE_PHOTO: 'profile_photo_url',
  API_TARGET: 'api_target_v1',
} as const;

function formatRelativeSync(ts: Date): string {
  const diffMs = Date.now() - ts.getTime();
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function computeGuestStreak(readings: GuestAuraReading[]): number {
  if (!readings.length) return 0;

  const daySet = new Set<number>();
  for (const row of readings) {
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    daySet.add(d.getTime());
  }

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (daySet.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function computeSummaryFromGuest(readings: GuestAuraReading[]): AuraSummary {
  if (!readings.length) {
    return {
      totalScans: 0,
      avgEnergy: 0,
      avgMood: 0,
      streak: 0,
      uniqueColors: 0,
    };
  }

  let totalEnergy = 0;
  let totalMood = 0;
  const colors = new Set<string>();

  for (const row of readings) {
    totalEnergy += Number(row.energy_level) || 0;
    totalMood += Number(row.mood_score) || 0;
    colors.add((row.aura_color || '').toLowerCase());
  }

  return {
    totalScans: readings.length,
    avgEnergy: totalEnergy / readings.length,
    avgMood: totalMood / readings.length,
    streak: computeGuestStreak(readings),
    uniqueColors: colors.size,
  };
}

function SectionHeading({
  icon,
  title,
  accent,
}: {
  icon: string;
  title: string;
  accent: [string, string];
}) {
  return (
    <View className="mb-2 mt-1 px-1">
      <View className="flex-row items-center">
        <View className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-white/10">
          <Ionicons name={icon as any} size={14} color="#cbd5e1" />
        </View>
        <Text className="text-xs font-semibold uppercase tracking-[2.5px] text-slate-300">{title}</Text>
      </View>
      <LinearGradient
        colors={accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ marginTop: 8, height: 2, width: 64, borderRadius: 999 }}
      />
    </View>
  );
}

function SettingsRow({
  icon,
  activeIcon,
  iconGradient,
  label,
  description,
  onPress,
  rightElement,
  destructive = false,
  highlighted = false,
  quickActionLabel,
  quickActionColor = '#7c3aed',
  onQuickAction,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const iconScale = useSharedValue(1);
  const [isPressed, setIsPressed] = useState(false);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const content = (
    <Pressable
      onPress={() => {
        if (disabled) return;
        if (!onPress) return;
        hapticSelection();
        onPress();
      }}
      onPressIn={() => {
        setIsPressed(true);
        iconScale.value = withSpring(1.08, { damping: 14, stiffness: 220 });
      }}
      onPressOut={() => {
        setIsPressed(false);
        iconScale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      disabled={disabled || (!onPress && !rightElement)}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : 1,
        backgroundColor: highlighted
          ? 'rgba(124,58,237,0.16)'
          : pressed
          ? 'rgba(148,163,184,0.10)'
          : 'transparent',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 11,
      })}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint || description}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center pr-3">
          <LinearGradient
            colors={iconGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="h-10 w-10 items-center justify-center rounded-xl"
          >
            <Animated.View style={iconAnimatedStyle}>
              <Ionicons
                name={(isPressed && activeIcon ? activeIcon : icon) as any}
                size={17}
                color={destructive ? '#fecaca' : '#eef2ff'}
              />
            </Animated.View>
          </LinearGradient>

          <View className="ml-3 flex-1">
            <Text className={`text-[15px] font-semibold ${destructive ? 'text-red-300' : 'text-white'}`}>
              {label}
            </Text>
            <Text className="mt-0.5 text-xs leading-4 text-slate-400">{description}</Text>
          </View>
        </View>

        <View className="flex-row items-center">
          {rightElement || <Ionicons name="chevron-forward" size={17} color="#64748b" />}
        </View>
      </View>
    </Pressable>
  );

  if (!quickActionLabel || !onQuickAction) {
    return content;
  }

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={hapticLight}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            hapticMedium();
            onQuickAction();
          }}
          className="ml-2 items-center justify-center rounded-2xl px-4"
          style={{ backgroundColor: quickActionColor }}
        >
          <Text className="text-xs font-bold uppercase tracking-[1px] text-white">{quickActionLabel}</Text>
        </Pressable>
      )}
    >
      {content}
    </Swipeable>
  );
}

function ThemeOption({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: ThemeMode;
  selected: boolean;
  onPress: (value: ThemeMode) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(value)}
      className={`mr-2 flex-1 overflow-hidden rounded-2xl border px-3 py-3 ${
        selected ? 'border-violet-300/40 bg-violet-500/20' : 'border-white/10 bg-white/5'
      }`}
    >
      <Text className={`text-xs font-semibold uppercase tracking-[1.5px] ${selected ? 'text-violet-200' : 'text-slate-300'}`}>
        {label}
      </Text>
      <View className="mt-2 h-8 rounded-lg border border-white/10 bg-[#0d1533]" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { setMode: setAppThemeMode, setTrueBlackEnabled: setAppTrueBlackEnabled, reloadTheme } = useTheme();
  const { isSubscribed, offerings, checkSubscription, refreshOfferings, handleRestore } = useSubscription();
  const { isAuthenticated, isGuest, user, logout, deleteAccount, guestDaysRemaining } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [trueBlackEnabled, setTrueBlackEnabled] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [rememberMe, setRememberMe] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);
  const [apiTarget, setApiTarget] = useState<'prod' | 'test' | 'dev'>('prod');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  const [summary, setSummary] = useState<AuraSummary>({
    totalScans: 0,
    avgEnergy: 0,
    avgMood: 0,
    streak: 0,
    uniqueColors: 0,
  });
  const [cacheSizeMb, setCacheSizeMb] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedbackBurst, setShowFeedbackBurst] = useState(false);

  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signOutEverywhere, setSignOutEverywhere] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>(1);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const [highlightBiometric, setHighlightBiometric] = useState(false);
  const [highlightTrueBlack, setHighlightTrueBlack] = useState(false);

  const avatarPulse = useSharedValue(1);
  const premiumTilt = useSharedValue(0);
  const premiumShimmer = useSharedValue(-140);
  const guestButtonPulse = useSharedValue(1);
  const syncRotation = useSharedValue(0);
  const deleteShake = useSharedValue(0);

  const avatarPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarPulse.value }],
    opacity: 0.35,
  }));

  const premiumTiltStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${premiumTilt.value}deg` }],
  }));

  const premiumShimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: premiumShimmer.value }],
  }));

  const guestButtonPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: guestButtonPulse.value }],
  }));

  const syncIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));

  const deleteShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: deleteShake.value }],
  }));

  useEffect(() => {
    avatarPulse.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    premiumTilt.value = withRepeat(
      withSequence(
        withTiming(-1.4, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.4, { duration: 2600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    premiumShimmer.value = withRepeat(
      withTiming(320, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );

    guestButtonPulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1,
      true
    );
  }, [avatarPulse, guestButtonPulse, premiumShimmer, premiumTilt]);

  useEffect(() => {
    if (forceSyncing) {
      syncRotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
      return;
    }
    syncRotation.value = withTiming(0, { duration: 220 });
  }, [forceSyncing, syncRotation]);

  const displayName = useMemo(() => {
    if (isGuest) return 'Guest Explorer';
    const raw = user?.email?.split('@')[0] || 'Aura User';
    const prettified = raw.replace(/[._-]+/g, ' ').trim();
    if (!prettified) return 'Aura User';
    return prettified
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [isGuest, user?.email]);

  const accountSubtitle = useMemo(() => {
    if (isGuest) return 'Guest Preview Mode';
    return user?.email || 'Signed in account';
  }, [isGuest, user?.email]);

  const accountInitial = useMemo(() => {
    return (displayName.charAt(0) || 'A').toUpperCase();
  }, [displayName]);

  const tierLabel = useMemo(() => {
    if (isSubscribed && isAuthenticated) return 'Premium';
    if (isGuest) return 'Guest';
    return 'Free';
  }, [isAuthenticated, isGuest, isSubscribed]);

  const guestDays = guestDaysRemaining ?? GUEST_RETENTION_DAYS;
  const guestProgressPct = Math.max(0, Math.min(100, (guestDays / GUEST_RETENTION_DAYS) * 100));

  const level = useMemo(() => Math.max(1, Math.floor(summary.totalScans / 8) + 1), [summary.totalScans]);
  const xpCurrent = summary.totalScans % 8;
  const xpRemaining = Math.max(1, 8 - xpCurrent);

  const summaryChips = useMemo(
    () => [
      { id: 'scans', label: `${summary.totalScans} scans` },
      { id: 'streak', label: `🔥 ${summary.streak} streak` },
      { id: 'colors', label: `${summary.uniqueColors} auras` },
    ],
    [summary.streak, summary.totalScans, summary.uniqueColors]
  );

  const achievements = useMemo(
    () => [
      { id: 'first', label: 'First Scan', unlocked: summary.totalScans >= 1 },
      { id: 'ten', label: '10 Scans', unlocked: summary.totalScans >= 10 },
      { id: 'week', label: 'Week Warrior', unlocked: summary.streak >= 7 },
      { id: 'palette', label: 'Aura Collector', unlocked: summary.uniqueColors >= 5 },
    ],
    [summary.streak, summary.totalScans, summary.uniqueColors]
  );

  const completedProfileTasks = useMemo(() => {
    let completed = 0;
    if (profilePhotoUrl) completed += 1;
    if (!isGuest && isAuthenticated) completed += 1;
    if (summary.totalScans >= 5) completed += 1;
    return completed;
  }, [isAuthenticated, isGuest, profilePhotoUrl, summary.totalScans]);

  const loadPreferences = useCallback(async () => {
    const entries = await AsyncStorage.multiGet([
      STORAGE_KEYS.BIOMETRIC,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.TRUE_BLACK,
      STORAGE_KEYS.REMEMBER_ME,
      STORAGE_KEYS.DEV_MODE,
      STORAGE_KEYS.PROFILE_PHOTO,
      STORAGE_KEYS.API_TARGET,
    ]);

    const map = new Map(entries);

    setBiometricEnabled(map.get(STORAGE_KEYS.BIOMETRIC) === 'true');
    const theme = map.get(STORAGE_KEYS.THEME) as ThemeMode | null;
    if (theme === 'dark' || theme === 'light' || theme === 'system') {
      setThemeMode(theme);
    }
    setTrueBlackEnabled(map.get(STORAGE_KEYS.TRUE_BLACK) === 'true');
    setRememberMe(map.get(STORAGE_KEYS.REMEMBER_ME) !== 'false');
    setDeveloperMode(map.get(STORAGE_KEYS.DEV_MODE) === 'true');
    setProfilePhotoUrl(map.get(STORAGE_KEYS.PROFILE_PHOTO) || '');

    const api = map.get(STORAGE_KEYS.API_TARGET);
    if (api === 'dev' || api === 'test' || api === 'prod') {
      setApiTarget(api);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (isGuest) {
      const guestRows = await loadGuestAuraHistory();
      const guestSummary = computeSummaryFromGuest(guestRows);
      setSummary(guestSummary);
      setCacheSizeMb(Number((Math.max(4, guestRows.length * 0.12)).toFixed(1)));
      return;
    }

    if (!isAuthenticated) {
      setSummary({ totalScans: 0, avgEnergy: 0, avgMood: 0, streak: 0, uniqueColors: 0 });
      setCacheSizeMb(0);
      return;
    }

    const [statsResp, streakResp] = await Promise.allSettled([api.get('/aura/stats'), api.get('/streak')]);

    let totalScans = 0;
    let avgEnergy = 0;
    let avgMood = 0;
    let uniqueColors = 0;
    let streak = 0;

    if (statsResp.status === 'fulfilled') {
      const payload = statsResp.value.data?.data || statsResp.value.data || {};
      totalScans = Number(payload.total_readings || 0);
      avgEnergy = Number(payload.average_energy || 0);
      avgMood = Number(payload.average_mood || 0);
      const distribution = payload.color_distribution || {};
      uniqueColors = Object.keys(distribution).filter((key) => Number(distribution[key]) > 0).length;
    }

    if (streakResp.status === 'fulfilled') {
      const payload = streakResp.value.data?.data || streakResp.value.data || {};
      streak = Number(payload.current_streak || payload.streak || 0);
    }

    setSummary({
      totalScans,
      avgEnergy,
      avgMood,
      streak,
      uniqueColors,
    });
    setCacheSizeMb(Number((Math.max(8, totalScans * 0.08)).toFixed(1)));
  }, [isAuthenticated, isGuest]);

  const runSync = useCallback(
    async (fromPull = false) => {
      if (fromPull) setRefreshing(true);
      setForceSyncing(true);
      try {
        await Promise.all([loadSummary(), checkSubscription(), refreshOfferings()]);
        setLastSyncedAt(new Date());
        hapticSuccess();
      } catch {
        hapticError();
        Alert.alert('Sync Failed', 'Could not refresh your settings data right now.');
      } finally {
        setForceSyncing(false);
        setRefreshing(false);
      }
    },
    [checkSubscription, loadSummary, refreshOfferings]
  );

  useEffect(() => {
    loadPreferences();
    reloadTheme().catch(() => undefined);
  }, [loadPreferences, reloadTheme]);

  useEffect(() => {
    runSync();
  }, [runSync]);

  const persistBoolean = async (key: string, value: boolean) => {
    await AsyncStorage.setItem(key, String(value));
  };

  const handleToggleBiometric = async (next: boolean) => {
    setBiometricEnabled(next);
    setHighlightBiometric(true);
    await persistBoolean(STORAGE_KEYS.BIOMETRIC, next);
    setTimeout(() => setHighlightBiometric(false), 420);
  };

  const handleToggleTrueBlack = async (next: boolean) => {
    if (!isSubscribed) {
      router.push('/(protected)/paywall');
      return;
    }
    setTrueBlackEnabled(next);
    setHighlightTrueBlack(true);
    await setAppTrueBlackEnabled(next);
    setTimeout(() => setHighlightTrueBlack(false), 420);
  };

  const handleThemeChange = async (next: ThemeMode) => {
    if (!isSubscribed) {
      router.push('/(protected)/paywall');
      return;
    }
    setThemeMode(next);
    await setAppThemeMode(next);
  };

  const handleShareApp = async () => {
    await Share.share({
      message: 'Discover your aura energy with AI! Download AuraSnap: https://apps.apple.com/app/aurasnap',
    });
  };

  const safeOpen = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Unavailable', 'Could not open this link right now.');
      return;
    }
    await Linking.openURL(url);
  };

  const handleRestorePurchases = async () => {
    const restored = await handleRestore();
    if (restored) {
      hapticSuccess();
      Alert.alert('Success', 'Your purchases were restored.');
      return;
    }
    Alert.alert('No Purchases Found', 'We could not find any previous purchases.');
  };

  const handleClearCache = async () => {
    hapticWarning();
    await AsyncStorage.multiRemove(['guest_aura_history_v1']);
    setCacheSizeMb(0);
    if (isGuest) {
      await loadSummary();
    }
    Alert.alert('Cache Cleared', 'Local cache has been cleared successfully.');
  };

  const handleExportData = async () => {
    try {
      let dataPayload: unknown = {};

      if (isGuest) {
        const guestRows = await loadGuestAuraHistory();
        dataPayload = {
          mode: 'guest',
          exported_at: new Date().toISOString(),
          readings: guestRows,
        };
      } else if (isAuthenticated) {
        const res = await api.get('/aura?page=1&page_size=200');
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        dataPayload = {
          mode: 'account',
          exported_at: new Date().toISOString(),
          readings: rows,
        };
      }

      const serialized = JSON.stringify(dataPayload, null, 2);
      await Share.share({
        message: `AuraSnap Data Export\n\n${serialized.slice(0, 7000)}`,
      });
    } catch {
      Alert.alert('Export Failed', 'Could not export data right now.');
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) {
      Alert.alert('Feedback is empty', 'Please write a short note first.');
      return;
    }

    try {
      const subject = encodeURIComponent('AuraSnap iOS Feedback');
      const body = encodeURIComponent(feedbackText.trim());
      const mailto = `mailto:support@aurasnap.app?subject=${subject}&body=${body}`;
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
      } else {
        await Share.share({ message: `AuraSnap Feedback\n\n${feedbackText.trim()}` });
      }
      setShowFeedbackBurst(true);
      setTimeout(() => setShowFeedbackBurst(false), 1400);
      setFeedbackText('');
      setShowFeedbackModal(false);
      hapticSuccess();
    } catch {
      Alert.alert('Failed', 'Could not submit feedback right now.');
    }
  };

  const handleLogoutConfirm = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME, String(rememberMe));
    if (signOutEverywhere) {
      Alert.alert('Heads up', 'Sign-out on all devices will be enabled when backend session list is ready.');
    }

    await logout();
    hapticSuccess();
    setShowLogoutModal(false);
    router.replace('/(auth)/login');
  };

  const openDeleteFlow = () => {
    setDeleteStep(1);
    setDeleteFeedback('');
    setDeletePassword('');
    setShowDeleteModal(true);
  };

  const handleDeleteNow = async () => {
    try {
      await deleteAccount(deletePassword);
      setShowDeleteModal(false);
      hapticSuccess();
      router.replace('/(auth)/login');
    } catch {
      hapticError();
      deleteShake.value = withSequence(
        withTiming(-10, { duration: 55 }),
        withTiming(10, { duration: 55 }),
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(0, { duration: 45 })
      );
    }
  };

  const revealDeveloperMode = async () => {
    const nextCount = versionTapCount + 1;
    if (nextCount < 5) {
      setVersionTapCount(nextCount);
      return;
    }

    if (!developerMode) {
      setDeveloperMode(true);
      await AsyncStorage.setItem(STORAGE_KEYS.DEV_MODE, 'true');
      hapticSuccess();
      Alert.alert('Developer Mode Enabled', 'Advanced settings are now visible.');
    }
    setVersionTapCount(0);
  };

  const cycleApiTarget = async () => {
    const next = apiTarget === 'prod' ? 'test' : apiTarget === 'test' ? 'dev' : 'prod';
    setApiTarget(next);
    await AsyncStorage.setItem(STORAGE_KEYS.API_TARGET, next);
  };

  const onRefresh = () => {
    runSync(true);
  };

  const themePreviewTitle = themeMode === 'system' ? `System (${colorScheme || 'dark'})` : themeMode;

  const isLightTheme = themeMode === 'light';
  const bgTop = trueBlackEnabled ? '#000000' : isLightTheme ? '#e8edff' : '#040816';
  const bgMid = trueBlackEnabled ? '#000000' : isLightTheme ? '#d9e3ff' : '#0b1230';
  const bgBottom = trueBlackEnabled ? '#030303' : isLightTheme ? '#cfdcff' : '#101a42';

  const textPrimary = isLightTheme ? '#0f172a' : '#f8fafc';
  const textSecondary = isLightTheme ? '#334155' : '#cbd5e1';

  const packageLabel = useMemo(() => {
    if (!isSubscribed) return 'Free Plan';
    const pkgs = offerings?.availablePackages || [];
    const annual = pkgs.find((p: any) => p.packageType === 'ANNUAL');
    const monthly = pkgs.find((p: any) => p.packageType === 'MONTHLY');
    const chosen = annual || monthly || pkgs[0];
    if (!chosen) return 'Premium';
    return chosen.product?.title || 'Premium Plan';
  }, [isSubscribed, offerings]);

  return (
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: bgTop }}>
      <LinearGradient colors={[bgTop, bgMid, bgBottom]} style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 14) + 92,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
          showsVerticalScrollIndicator={false}
        >
          {showFeedbackBurst && (
            <View className="pointer-events-none absolute left-0 right-0 top-14 z-30 items-center">
              <View className="rounded-full bg-violet-500/20 px-4 py-2">
                <Text className="text-sm font-semibold text-violet-100">✨ Thanks for the feedback</Text>
              </View>
            </View>
          )}

          <Animated.View entering={FadeInDown.duration(380)} className="mb-5 overflow-hidden rounded-3xl border border-white/10">
            <LinearGradient colors={['#0f1a44', '#211a56', '#301f66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="p-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-row flex-1 pr-3">
                  <View className="relative">
                    <Animated.View style={avatarPulseStyle} className="absolute inset-[-6px] rounded-2xl bg-violet-400" />
                    <View className="h-16 w-16 overflow-hidden rounded-2xl border border-violet-200/30 bg-violet-500/20 items-center justify-center">
                      {profilePhotoUrl ? (
                        <Image source={{ uri: profilePhotoUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <LinearGradient colors={['#7c3aed', '#ec4899']} className="h-full w-full items-center justify-center">
                          <Text className="text-xl font-bold text-white">{accountInitial}</Text>
                        </LinearGradient>
                      )}
                    </View>
                  </View>

                  <View className="ml-3 flex-1">
                    <Text style={{ color: textPrimary }} className="text-2xl font-bold" numberOfLines={1}>
                      {displayName}
                    </Text>
                    <Text style={{ color: textSecondary }} className="text-sm" numberOfLines={1}>
                      Settings
                    </Text>
                    <Text className="mt-1 text-xs text-slate-300" numberOfLines={1}>
                      {accountSubtitle}
                    </Text>
                  </View>
                </View>

                <View className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-violet-100">{tierLabel}</Text>
                </View>
              </View>

              <View className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-slate-300">Account Status</Text>
                  <View className="flex-row items-center">
                    <Animated.View style={syncIconStyle}>
                      <Ionicons
                        name={forceSyncing ? 'sync' : 'checkmark-circle'}
                        size={15}
                        color={forceSyncing ? '#c4b5fd' : '#86efac'}
                      />
                    </Animated.View>
                    <Text className="ml-1 text-xs text-slate-200">
                      {forceSyncing ? 'Syncing...' : `Last synced ${formatRelativeSync(lastSyncedAt)}`}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row flex-wrap">
                  {summaryChips.map((chip) => (
                    <View key={chip.id} className="mr-2 mb-2 rounded-full border border-white/10 bg-white/10 px-3 py-1">
                      <Text className="text-[11px] font-medium text-slate-200">{chip.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="mt-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-slate-200">Level {level} Aura Explorer</Text>
                  <Text className="text-xs text-slate-300">{xpRemaining} XP to next level</Text>
                </View>
                <View className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <LinearGradient
                    colors={['#7c3aed', '#ec4899']}
                    style={{ height: '100%', width: `${Math.max(8, (xpCurrent / 8) * 100)}%` }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {isGuest && (
            <Animated.View entering={FadeInDown.delay(80).duration(360)} className="mb-5 overflow-hidden rounded-3xl border border-violet-300/25 bg-[#101a45]">
              <LinearGradient colors={['rgba(99,102,241,0.25)', 'rgba(168,85,247,0.18)']} style={{ position: 'absolute', inset: 0 }} />
              <View className="px-4 pb-4 pt-4">
                <Text className="text-lg font-bold text-white">Create Free Account</Text>
                <Text className="mt-1 text-sm text-violet-100/90">Claim your guest data before retention ends.</Text>

                <View className="mt-3">
                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Text className="text-xs text-violet-200">Retention Progress</Text>
                    <Text className="text-xs font-semibold text-violet-100">{guestDays} days left</Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-violet-950/70">
                    <LinearGradient
                      colors={guestDays <= 7 ? ['#f59e0b', '#ef4444'] : ['#7c3aed', '#a855f7']}
                      style={{ height: '100%', width: `${Math.max(2, guestProgressPct)}%` }}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    />
                  </View>
                </View>

                <Text className="mt-2 text-xs text-violet-200">{guestDays}d 0h remaining before auto-clean.</Text>

                <Animated.View style={guestButtonPulseStyle} className="mt-3">
                  <Pressable
                    onPress={() => router.push('/(auth)/register')}
                    className="items-center rounded-xl bg-violet-600 py-3"
                  >
                    <Text className="text-sm font-bold text-white">✨ Create Account</Text>
                  </Pressable>
                </Animated.View>
              </View>
            </Animated.View>
          )}

          {!isGuest && !isSubscribed && (
            <Animated.View entering={FadeInDown.delay(80).duration(360)} style={premiumTiltStyle} className="mb-5 overflow-hidden rounded-3xl border border-violet-300/25">
              <Pressable onPress={() => router.push('/(protected)/paywall')}>
                <LinearGradient colors={['#4c1d95', '#6d28d9', '#db2777']} className="p-5">
                  <View className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
                  <View className="absolute -left-8 -bottom-10 h-24 w-24 rounded-full bg-white/10" />

                  <Text className="text-lg font-bold text-white">✨ Go Premium</Text>
                  <Text className="mt-1 text-sm text-violet-100/90">Unlimited scans, themes, full history, and no ads.</Text>

                  <View className="mt-3 rounded-xl bg-black/20 px-3 py-2">
                    <Text className="text-xs text-violet-100">Unlock all locked settings and analytics.</Text>
                  </View>

                  <Animated.View
                    style={[premiumShimmerStyle, { position: 'absolute', top: 0, bottom: 0, width: 120 }]}
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(255,255,255,0.30)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}

          {isSubscribed && isAuthenticated && (
            <Animated.View entering={FadeInDown.delay(80).duration(360)} className="mb-5 overflow-hidden rounded-3xl border border-emerald-300/20 bg-[#0f1d42] p-4">
              <Text className="text-sm font-semibold uppercase tracking-[2px] text-emerald-200">Subscription</Text>
              <Text className="mt-1 text-lg font-bold text-white">{packageLabel}</Text>
              <Text className="mt-1 text-sm text-slate-300">Next billing: {new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString()}</Text>
              <Text className="mt-1 text-sm text-slate-300">Price: Managed by App Store</Text>
              <Pressable onPress={() => safeOpen('https://apps.apple.com/account/subscriptions')} className="mt-3 rounded-xl bg-emerald-500/20 py-2.5 items-center">
                <Text className="text-sm font-semibold text-emerald-100">Manage Subscription</Text>
              </Pressable>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(120).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="person-circle-outline" title="Account" accent={['#7c3aed', '#ec4899']} />

            {isAuthenticated && (
              <>
                <SettingsRow
                  icon="finger-print-outline"
                  activeIcon="finger-print"
                  iconGradient={['#5b21b6', '#9333ea']}
                  label="Biometric Login"
                  description="Use Face ID to sign in quickly"
                  highlighted={highlightBiometric}
                  rightElement={
                    <Switch
                      trackColor={{ false: '#334155', true: '#7c3aed' }}
                      thumbColor="#ffffff"
                      value={biometricEnabled}
                      onValueChange={handleToggleBiometric}
                    />
                  }
                  accessibilityLabel="Biometric Login"
                  accessibilityHint="Toggle Face ID sign in"
                />

                <View className="mx-2 h-px bg-white/10" />

                <SettingsRow
                  icon="mail-outline"
                  activeIcon="mail"
                  iconGradient={['#1d4ed8', '#2563eb']}
                  label="Email"
                  description={user?.email || 'No email linked'}
                  onPress={() => Alert.alert('Email', user?.email || 'No email available')}
                  quickActionLabel="Copy"
                  quickActionColor="#1d4ed8"
                  onQuickAction={() => {
                    hapticSelection();
                    Alert.alert('Copied', 'Email copied to clipboard actions will be added next.');
                  }}
                />

                <View className="mx-2 h-px bg-white/10" />

                <SettingsRow
                  icon="phone-portrait-outline"
                  activeIcon="phone-portrait"
                  iconGradient={['#0f766e', '#14b8a6']}
                  label="Active Sessions"
                  description="This iPhone is active now"
                  onPress={() => Alert.alert('Sessions', 'Session list API will show all devices once available.')}
                  quickActionLabel="Revoke"
                  quickActionColor="#0f766e"
                  onQuickAction={() => Alert.alert('Coming Soon', 'Revoke other sessions will be enabled with session API.')}
                />
              </>
            )}

            {isGuest && (
              <>
                <SettingsRow
                  icon="log-in-outline"
                  activeIcon="log-in"
                  iconGradient={['#5b21b6', '#7c3aed']}
                  label="Sign In"
                  description="Use your existing account"
                  onPress={() => router.push('/(auth)/login')}
                />
                <View className="mx-2 h-px bg-white/10" />
                <SettingsRow
                  icon="person-add-outline"
                  activeIcon="person-add"
                  iconGradient={['#166534', '#22c55e']}
                  label="Create Account"
                  description="Claim your guest data and keep it forever"
                  onPress={() => router.push('/(auth)/register')}
                />
              </>
            )}

            <View className="mx-1 mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 px-3 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-violet-200">Profile Tasks</Text>
              <Text className="mt-1 text-xs text-violet-100/80">{completedProfileTasks}/3 completed</Text>
              <View className="mt-2 h-2 overflow-hidden rounded-full bg-violet-950/80">
                <LinearGradient
                  colors={['#7c3aed', '#a855f7']}
                  style={{ height: '100%', width: `${Math.max(6, (completedProfileTasks / 3) * 100)}%` }}
                />
              </View>
              <Text className="mt-2 text-xs text-violet-100/80">Add avatar • Verify account • Reach 5 scans</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="color-palette-outline" title="App & Experience" accent={['#2563eb', '#0ea5e9']} />

            <SettingsRow
              icon="contrast-outline"
              activeIcon="contrast"
              iconGradient={['#1e3a8a', '#2563eb']}
              label="Theme"
              description={`Current: ${themePreviewTitle}`}
              rightElement={<Text className="text-xs text-slate-300">{themeMode.toUpperCase()}</Text>}
              onPress={() => {}}
            />

            <View className="px-2 pb-2 pt-1">
              <View className="flex-row">
                <ThemeOption label="Dark" value="dark" selected={themeMode === 'dark'} onPress={handleThemeChange} />
                <ThemeOption label="Light" value="light" selected={themeMode === 'light'} onPress={handleThemeChange} />
                <ThemeOption label="System" value="system" selected={themeMode === 'system'} onPress={handleThemeChange} />
              </View>
              {!isSubscribed && (
                <Pressable
                  onPress={() => router.push('/(protected)/paywall')}
                  className="mt-2 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2"
                >
                  <Text className="text-xs font-semibold text-amber-100">Theme selector is a Premium feature</Text>
                </Pressable>
              )}
            </View>

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="moon-outline"
              activeIcon="moon"
              iconGradient={['#312e81', '#4338ca']}
              label="True Black OLED"
              description="Pure black background for OLED battery savings"
              highlighted={highlightTrueBlack}
              rightElement={
                <Switch
                  trackColor={{ false: '#334155', true: '#4f46e5' }}
                  thumbColor="#ffffff"
                  value={trueBlackEnabled}
                  onValueChange={handleToggleTrueBlack}
                />
              }
              onPress={() => {}}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="notifications-outline"
              activeIcon="notifications"
              iconGradient={['#92400e', '#f59e0b']}
              label="Notifications"
              description="Reminder cadence and push preferences"
              onPress={() => Alert.alert('Notifications', 'Notification preferences panel is next in roadmap.')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="cloud-done-outline"
              activeIcon="cloud-done"
              iconGradient={['#0f766e', '#14b8a6']}
              label="Force Cloud Sync"
              description="Refresh stats, purchases and account status"
              onPress={() => runSync(false)}
              quickActionLabel="Sync"
              quickActionColor="#0f766e"
              onQuickAction={() => runSync(false)}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="trophy-outline" title="Achievements" accent={['#f59e0b', '#ef4444']} />
            <View className="px-2 pb-2">
              <View className="flex-row flex-wrap">
                {achievements.slice(0, 3).map((badge) => (
                  <View
                    key={badge.id}
                    className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${
                      badge.unlocked ? 'bg-violet-500/20 border border-violet-300/30' : 'bg-slate-700/30 border border-slate-500/20'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${badge.unlocked ? 'text-violet-100' : 'text-slate-400'}`}>
                      {badge.unlocked ? '🏆' : '🔒'} {badge.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={() => router.push('/(protected)/history')} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                <Text className="text-xs font-semibold text-slate-200">See all achievements →</Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="diamond-outline" title="Subscription" accent={['#22c55e', '#06b6d4']} />

            <SettingsRow
              icon="refresh-outline"
              activeIcon="refresh"
              iconGradient={['#047857', '#10b981']}
              label="Restore Purchases"
              description="Re-activate your paid plan on this device"
              onPress={handleRestorePurchases}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="card-outline"
              activeIcon="card"
              iconGradient={['#065f46', '#22c55e']}
              label="Manage Plan"
              description="Open App Store subscription settings"
              onPress={() => safeOpen('https://apps.apple.com/account/subscriptions')}
            />

            {!isSubscribed && (
              <View className="mx-1 mt-3 overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-[2px] text-violet-200">Locked Benefits</Text>
                <View className="mt-2 rounded-xl border border-white/10 bg-white/10 p-2.5">
                  <Text className="text-xs text-violet-100/80">• Unlimited history • Theme controls • Priority analysis</Text>
                </View>
                <Pressable onPress={() => router.push('/(protected)/paywall')} className="mt-3 rounded-xl bg-violet-600 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-white">Unlock with Premium</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(360).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="server-outline" title="Data & Storage" accent={['#14b8a6', '#0ea5e9']} />

            <SettingsRow
              icon="albums-outline"
              activeIcon="albums"
              iconGradient={['#155e75', '#0891b2']}
              label="Cache Size"
              description="Estimated local cache footprint"
              rightElement={<Text className="text-xs font-semibold text-slate-200">{cacheSizeMb.toFixed(1)} MB</Text>}
              onPress={() => {}}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="trash-bin-outline"
              activeIcon="trash-bin"
              iconGradient={['#991b1b', '#ef4444']}
              label="Clear Cache"
              description="Remove local cached scans and temporary data"
              onPress={handleClearCache}
              quickActionLabel="Clear"
              quickActionColor="#b91c1c"
              onQuickAction={handleClearCache}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="download-outline"
              activeIcon="download"
              iconGradient={['#1e3a8a', '#2563eb']}
              label="Export My Data"
              description="GDPR-friendly JSON export of your readings"
              onPress={handleExportData}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="share-outline"
              activeIcon="share"
              iconGradient={['#7c2d12', '#ea580c']}
              label="Download History"
              description="Generate a portable backup snapshot"
              onPress={handleExportData}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(420).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="help-circle-outline" title="Support" accent={['#3b82f6', '#22d3ee']} />

            <SettingsRow
              icon="help-outline"
              activeIcon="help"
              iconGradient={['#1d4ed8', '#3b82f6']}
              label="FAQ"
              description="Quick answers about scans and plans"
              onPress={() => safeOpen('https://aurasnap.app/faq')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="mail-open-outline"
              activeIcon="mail-open"
              iconGradient={['#0284c7', '#38bdf8']}
              label="Contact Us"
              description="Reach support directly"
              onPress={() => safeOpen('mailto:support@aurasnap.app')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="bug-outline"
              activeIcon="bug"
              iconGradient={['#b45309', '#f59e0b']}
              label="Report a Bug"
              description="Share issue details with logs"
              onPress={() => setShowFeedbackModal(true)}
              quickActionLabel="Send"
              quickActionColor="#b45309"
              onQuickAction={() => setShowFeedbackModal(true)}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="chatbubble-ellipses-outline"
              activeIcon="chatbubble-ellipses"
              iconGradient={['#9333ea', '#ec4899']}
              label="Send Feedback"
              description="Suggest ideas and UX improvements"
              onPress={() => setShowFeedbackModal(true)}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(480).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="people-outline" title="Community" accent={['#8b5cf6', '#22d3ee']} />

            <SettingsRow
              icon="logo-discord"
              iconGradient={['#312e81', '#4f46e5']}
              label="Discord Community"
              description="Join other aura explorers"
              onPress={() => safeOpen('https://discord.gg/aurasnap')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="logo-instagram"
              iconGradient={['#9d174d', '#ec4899']}
              label="Social Channels"
              description="Follow product updates"
              onPress={() => safeOpen('https://instagram.com/aurasnap')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="gift-outline"
              activeIcon="gift"
              iconGradient={['#14532d', '#22c55e']}
              label="Refer a Friend"
              description="Share invite code and earn perks"
              onPress={() => Share.share({ message: 'Join me on AuraSnap! Invite code: AURA-FRIEND' })}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(540).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] px-3 pb-3 pt-2">
            <SectionHeading icon="document-text-outline" title="Legal" accent={['#64748b', '#94a3b8']} />

            <SettingsRow
              icon="shield-outline"
              activeIcon="shield"
              iconGradient={['#334155', '#64748b']}
              label="Privacy Policy"
              description="How your data is used"
              onPress={() => safeOpen('https://aurasnap.app/privacy')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="document-outline"
              activeIcon="document"
              iconGradient={['#334155', '#64748b']}
              label="Terms of Service"
              description="Rules for using AuraSnap"
              onPress={() => safeOpen('https://aurasnap.app/terms')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="code-slash-outline"
              activeIcon="code-slash"
              iconGradient={['#334155', '#64748b']}
              label="Licenses"
              description="Open-source acknowledgements"
              onPress={() => Alert.alert('Licenses', 'License viewer screen will be added in next update.')}
            />

            <View className="mx-2 h-px bg-white/10" />

            <SettingsRow
              icon="newspaper-outline"
              activeIcon="newspaper"
              iconGradient={['#334155', '#64748b']}
              label="Cookie Policy"
              description="Consent and tracking policy"
              onPress={() => safeOpen('https://aurasnap.app/cookies')}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(600).duration(360)} className="mb-5 rounded-3xl border border-red-300/20 bg-red-500/5 px-3 pb-3 pt-2">
            <SectionHeading icon="warning-outline" title="Danger Zone" accent={['#ef4444', '#f97316']} />

            <View className="mx-1 mb-3 rounded-2xl border border-red-300/20 bg-red-500/10 px-3 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-red-100">Deletion Policy</Text>
              <Text className="mt-1 text-xs leading-5 text-red-100/80">
                Account deletion is currently immediate. 30-day undo countdown UI is prepared and will activate with backend support.
              </Text>
            </View>

            {isAuthenticated && (
              <>
                <SettingsRow
                  icon="log-out-outline"
                  activeIcon="log-out"
                  iconGradient={['#92400e', '#f59e0b']}
                  label="Sign Out"
                  description="Log out from this device"
                  onPress={() => setShowLogoutModal(true)}
                />

                <View className="mx-2 h-px bg-white/10" />

                <SettingsRow
                  icon="trash-outline"
                  activeIcon="trash"
                  iconGradient={['#991b1b', '#ef4444']}
                  label="Delete Account"
                  description="Permanent destructive action"
                  destructive
                  onPress={openDeleteFlow}
                />
              </>
            )}
          </Animated.View>

          {developerMode && (
            <Animated.View entering={FadeInDown.delay(650).duration(360)} className="mb-5 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 px-3 pb-3 pt-2">
              <SectionHeading icon="construct-outline" title="Advanced" accent={['#06b6d4', '#22d3ee']} />

              <SettingsRow
                icon="terminal-outline"
                activeIcon="terminal"
                iconGradient={['#0e7490', '#06b6d4']}
                label="Developer Mode"
                description="Internal diagnostics are enabled"
                rightElement={<Text className="text-xs text-cyan-200">ON</Text>}
                onPress={() => {}}
              />

              <View className="mx-2 h-px bg-white/10" />

              <SettingsRow
                icon="git-network-outline"
                activeIcon="git-network"
                iconGradient={['#155e75', '#0891b2']}
                label="API Endpoint"
                description="Select runtime target: prod/test/dev"
                rightElement={<Text className="text-xs font-semibold text-cyan-100">{apiTarget.toUpperCase()}</Text>}
                onPress={cycleApiTarget}
              />

              <View className="mx-2 h-px bg-white/10" />

              <SettingsRow
                icon="information-circle-outline"
                activeIcon="information-circle"
                iconGradient={['#0e7490', '#0891b2']}
                label="Debug Info"
                description={`Platform: ${Platform.OS} · Build: ${APP_VERSION}`}
                onPress={() => Alert.alert('Debug Info', `Platform: ${Platform.OS}\nVersion: ${APP_VERSION}\nTheme: ${themeMode}`)}
              />
            </Animated.View>
          )}

          <Pressable onPress={() => setShowWhatsNewModal(true)} onLongPress={revealDeveloperMode} className="mb-6 items-center">
            <View className="flex-row items-center">
              <Text className="text-xs text-slate-500">AuraSnap v{APP_VERSION} · What's New</Text>
              <View className="ml-2 h-2 w-2 rounded-full bg-rose-400" />
            </View>
            {!!versionTapCount && <Text className="mt-1 text-[10px] text-slate-600">{5 - versionTapCount} taps to dev mode</Text>}
          </Pressable>
        </ScrollView>
      </LinearGradient>

      <Modal visible={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="Send Feedback">
        <Text className="mb-3 text-sm text-gray-300">Tell us what felt good and what needs work.</Text>
        <TextInput
          value={feedbackText}
          onChangeText={setFeedbackText}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder="Write feedback..."
          placeholderTextColor="#94a3b8"
          className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
          style={{ minHeight: 110 }}
        />
        <View className="mt-4 flex-row gap-3">
          <Pressable onPress={() => setShowFeedbackModal(false)} className="flex-1 items-center rounded-xl bg-gray-800 py-3">
            <Text className="font-medium text-white">Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSendFeedback} className="flex-1 items-center rounded-xl bg-violet-600 py-3">
            <Text className="font-bold text-white">Send</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={showWhatsNewModal} onClose={() => setShowWhatsNewModal(false)} title="What's New">
        <View className="space-y-2">
          <Text className="text-sm text-slate-200">• New history UX with bento stats and swipe actions</Text>
          <Text className="text-sm text-slate-200">• Guest retention + claim flow improvements</Text>
          <Text className="text-sm text-slate-200">• Settings redesign with premium controls and data tools</Text>
        </View>
        <Pressable onPress={() => setShowWhatsNewModal(false)} className="mt-4 items-center rounded-xl bg-violet-600 py-3">
          <Text className="font-semibold text-white">Got it</Text>
        </Pressable>
      </Modal>

      <Modal visible={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Sign Out">
        <Text className="mb-3 text-sm text-gray-300">Choose sign-out options for this device.</Text>

        <View className="rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-2.5">
          <View className="flex-row items-center justify-between py-1.5">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-white">Remember me</Text>
              <Text className="text-xs text-slate-400">Keep login preference next time</Text>
            </View>
            <Switch value={rememberMe} onValueChange={setRememberMe} trackColor={{ false: '#334155', true: '#7c3aed' }} />
          </View>

          <View className="my-1 h-px bg-gray-700" />

          <View className="flex-row items-center justify-between py-1.5">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-white">Sign out everywhere</Text>
              <Text className="text-xs text-slate-400">Revoke all other sessions (beta)</Text>
            </View>
            <Switch value={signOutEverywhere} onValueChange={setSignOutEverywhere} trackColor={{ false: '#334155', true: '#7c3aed' }} />
          </View>
        </View>

        <View className="mt-4 flex-row gap-3">
          <Pressable onPress={() => setShowLogoutModal(false)} className="flex-1 items-center rounded-xl bg-gray-800 py-3">
            <Text className="font-medium text-white">Cancel</Text>
          </Pressable>
          <Pressable onPress={handleLogoutConfirm} className="flex-1 items-center rounded-xl bg-amber-600 py-3">
            <Text className="font-bold text-white">Sign Out</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Account">
        <Animated.View style={deleteShakeStyle}>
          {deleteStep === 1 && (
            <>
              <Text className="mb-2 text-sm font-semibold text-red-300">Are you absolutely sure?</Text>
              <Text className="mb-4 text-sm leading-5 text-gray-300">
                Your history, streaks, and account preferences will be permanently removed from this device.
              </Text>
              <View className="flex-row gap-3">
                <Pressable onPress={() => setShowDeleteModal(false)} className="flex-1 items-center rounded-xl bg-gray-800 py-3">
                  <Text className="font-medium text-white">Cancel</Text>
                </Pressable>
                <Pressable onPress={() => setDeleteStep(2)} className="flex-1 items-center rounded-xl bg-red-600 py-3">
                  <Text className="font-bold text-white">Continue</Text>
                </Pressable>
              </View>
            </>
          )}

          {deleteStep === 2 && (
            <>
              <Text className="mb-2 text-sm font-semibold text-white">Before you go</Text>
              <Text className="mb-3 text-sm text-gray-300">Optional: what should we improve?</Text>
              <TextInput
                value={deleteFeedback}
                onChangeText={setDeleteFeedback}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Your feedback (optional)"
                placeholderTextColor="#94a3b8"
                className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
                style={{ minHeight: 96 }}
              />
              <View className="mt-4 flex-row gap-3">
                <Pressable onPress={() => setDeleteStep(1)} className="flex-1 items-center rounded-xl bg-gray-800 py-3">
                  <Text className="font-medium text-white">Back</Text>
                </Pressable>
                <Pressable onPress={() => setDeleteStep(3)} className="flex-1 items-center rounded-xl bg-red-600 py-3">
                  <Text className="font-bold text-white">Next</Text>
                </Pressable>
              </View>
            </>
          )}

          {deleteStep === 3 && (
            <>
              <Text className="mb-3 text-sm text-gray-300">Confirm with your password to proceed.</Text>
              <Input
                label="Password"
                placeholder="Enter your password"
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
              />
              <View className="mt-2 flex-row gap-3">
                <Pressable onPress={() => setDeleteStep(2)} className="flex-1 items-center rounded-xl bg-gray-800 py-3">
                  <Text className="font-medium text-white">Back</Text>
                </Pressable>
                <Pressable onPress={handleDeleteNow} className="flex-1 items-center rounded-xl bg-red-600 py-3">
                  <Text className="font-bold text-white">Delete Now</Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

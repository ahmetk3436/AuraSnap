import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../lib/api';
import { hapticSuccess, hapticError, hapticSelection } from '../../lib/haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { evaluateImageQuality } from '../../lib/imageQualityGate';
import {
  loadGuestAuraHistory,
  normalizeGuestAuraReading,
  saveGuestAuraReading,
  saveGuestAuraReadings,
  type GuestAuraReading,
} from '../../lib/guestAuraHistory';

const AURA_COLORS: Record<string, { gradient: [string, string]; emoji: string }> = {
  'Red': { gradient: ['#dc2626', '#991b1b'], emoji: '\u{1F525}' },
  'Orange': { gradient: ['#ea580c', '#c2410c'], emoji: '\u{1F31E}' },
  'Yellow': { gradient: ['#eab308', '#a16207'], emoji: '\u{2728}' },
  'Green': { gradient: ['#16a34a', '#15803d'], emoji: '\u{1F33F}' },
  'Blue': { gradient: ['#2563eb', '#1d4ed8'], emoji: '\u{1F30A}' },
  'Indigo': { gradient: ['#4f46e5', '#4338ca'], emoji: '\u{1F31A}' },
  'Violet': { gradient: ['#7c3aed', '#6d28d9'], emoji: '\u{1F52E}' },
  'Pink': { gradient: ['#ec4899', '#db2777'], emoji: '\u{1F495}' },
  'Turquoise': { gradient: ['#06b6d4', '#0891b2'], emoji: '\u{1F30C}' },
  'Gold': { gradient: ['#f59e0b', '#d97706'], emoji: '\u{1F451}' },
};

function getAuraGradient(title: string): [string, string] {
  for (const [key, val] of Object.entries(AURA_COLORS)) {
    if (title?.toLowerCase().includes(key.toLowerCase())) return val.gradient;
  }
  return ['#7c3aed', '#4f46e5'];
}

function titleCase(value: string): string {
  if (!value) return 'Unknown';
  return value
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}

function auraEmoji(title: string): string {
  const normalized = titleCase(title);
  return AURA_COLORS[normalized]?.emoji || '\u{2728}';
}

function formatDate(dateLike?: string): string {
  const date = dateLike ? new Date(dateLike) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toDisplayResult(reading: GuestAuraReading) {
  return {
    ...reading,
    date: formatDate(reading.created_at),
    title: titleCase(reading.aura_color),
    description: reading.personality,
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isGuest, isAuthenticated, guestUsageCount, canUseFeature, incrementGuestUsage } = useAuth();
  const { isSubscribed } = useSubscription();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;
  const [result, setResult] = useState<ReturnType<typeof toDisplayResult> | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [history, setHistory] = useState<ReturnType<typeof toDisplayResult>[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [todayScanCount, setTodayScanCount] = useState(0);

  // Animations
  const orbPulse = useSharedValue(1);
  const orbGlow = useSharedValue(0.3);
  const resultScale = useSharedValue(0);
  const loadingPulse = useSharedValue(0.4);
  const loadingSpin = useSharedValue(0);
  const shimmerTranslate = useSharedValue(-300);
  const scanPressScale = useSharedValue(1);
  const scanRippleScale = useSharedValue(0.85);
  const scanRippleOpacity = useSharedValue(0);

  useEffect(() => {
    // Breathing pulse animation for scan button
    orbPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    orbGlow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000 }),
        withTiming(0.3, { duration: 2000 })
      ),
      -1,
      true
    );
    loadingPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0.4, { duration: 1500 })
      ),
      -1,
      true
    );
    loadingSpin.value = withRepeat(
      withTiming(360, { duration: 2100, easing: Easing.linear }),
      -1,
      false
    );
    shimmerTranslate.value = withRepeat(
      withTiming(320, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbPulse.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: orbGlow.value,
  }));

  const resultAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: resultScale.value }],
    opacity: resultScale.value,
  }));

  const loadingCardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: loadingPulse.value,
  }));

  const loadingSpinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingSpin.value}deg` }],
  }));

  const shimmerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerTranslate.value }],
  }));

  const scanPressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanPressScale.value }],
  }));

  const scanRippleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanRippleScale.value }],
    opacity: scanRippleOpacity.value,
  }));

  const loadInitialReadings = async () => {
    try {
      if (isGuest) {
        let source = await loadGuestAuraHistory();

        if (source.length === 0) {
          try {
            const remoteRes = await api.get('/aura?page=1&page_size=10');
            const rows = Array.isArray(remoteRes.data?.data) ? remoteRes.data.data : [];
            if (rows.length > 0) {
              const normalizedRows = rows.map((row: any) => normalizeGuestAuraReading(row));
              await saveGuestAuraReadings(normalizedRows);
              source = normalizedRows;
            }
          } catch {
            // Guest may not have backend token on first run.
          }
        }

        const mapped = source.map(toDisplayResult);
        setHistory(mapped.slice(0, 10));
        if (mapped.length > 0) {
          setResult(mapped[0]);
          resultScale.value = 1;
        } else {
          setResult(null);
          resultScale.value = 0;
        }
        return;
      }

      if (isAuthenticated) {
        const [listRes, checkRes] = await Promise.allSettled([
          api.get('/aura?page=1&page_size=10'),
          api.get('/aura/scan/check'),
        ]);

        if (checkRes.status === 'fulfilled') {
          setTodayScanCount(2 - (checkRes.value.data?.remaining || 0));
        }

        if (listRes.status === 'fulfilled') {
          const rows = Array.isArray(listRes.value.data?.data) ? listRes.value.data.data : [];
          const mapped = rows.map((row: any) => toDisplayResult(normalizeGuestAuraReading(row)));
          setHistory(mapped);
          if (mapped.length > 0) {
            setResult(mapped[0]);
            resultScale.value = 1;
          } else {
            setResult(null);
            resultScale.value = 0;
          }
        }
      }
    } catch {
      // keep best-effort UX
    }
  };

  useEffect(() => {
    loadInitialReadings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, isAuthenticated]);

  const runScanRipple = () => {
    scanRippleScale.value = 0.85;
    scanRippleOpacity.value = 0.55;
    scanRippleScale.value = withTiming(1.45, { duration: 750, easing: Easing.out(Easing.cubic) });
    scanRippleOpacity.value = withTiming(0, { duration: 750, easing: Easing.out(Easing.quad) });
  };

  const handleScanPressIn = () => {
    scanPressScale.value = withSpring(0.96, { damping: 18, stiffness: 220 });
  };

  const handleScanPressOut = () => {
    scanPressScale.value = withSpring(1, { damping: 18, stiffness: 220 });
  };

  const handleScan = async () => {
    runScanRipple();
    hapticSelection();

    // Check guest limits
    if (isGuest && !canUseFeature()) {
      hapticError();
      Alert.alert(
        'Free Scans Used',
        'You\'ve used all 3 free scans. Create an account to unlock unlimited scans!',
        [
          { text: 'Sign Up', onPress: () => router.push('/(auth)/register') },
          { text: 'Later', style: 'cancel' },
        ]
      );
      return;
    }

    // Check authenticated user daily limit
    if (isAuthenticated && !isSubscribed && todayScanCount >= 2) {
      hapticError();
      Alert.alert(
        'Daily Limit Reached',
        'Free users get 2 scans per day. Upgrade to Premium for unlimited scans!',
        [
          { text: 'Upgrade', onPress: () => router.push('/(protected)/paywall') },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      hapticError();
      Alert.alert('Permission Needed', 'We need access to your photos to scan your aura.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (pickerResult.canceled) return;

    const pickedAsset = pickerResult.assets[0];
    const quality = await evaluateImageQuality(pickedAsset.uri, pickedAsset.width, pickedAsset.height);
    if (!quality.ok) {
      hapticError();
      Alert.alert('Photo Quality Check', quality.message);
      return;
    }

    setIsScanning(true);
    setResult(null);
    resultScale.value = 0;

    try {
      const base64 =
        pickedAsset.base64 ||
        (await FileSystem.readAsStringAsync(pickedAsset.uri, {
          encoding: 'base64' as any,
        }));

      const response = await api.post('/aura/scan', {
        image_data: base64,
        quality_score: quality.score,
        quality_metrics: quality.metrics,
      });

      const normalized = normalizeGuestAuraReading({
        ...response.data,
        created_at: response.data?.created_at || new Date().toISOString(),
        analyzed_at: response.data?.analyzed_at || new Date().toISOString(),
      });
      const scanResult = toDisplayResult(normalized);

      setResult(scanResult);
      setHistory((prev) => [scanResult, ...prev.filter((item) => item.id !== scanResult.id)].slice(0, 10));
      setTodayScanCount((prev) => prev + 1);

      // Animate result card in
      resultScale.value = withSpring(1, { damping: 12, stiffness: 100 });

      // Track guest usage
      if (isGuest) {
        await Promise.allSettled([
          incrementGuestUsage(),
          saveGuestAuraReading(normalized),
        ]);
      }

      hapticSuccess();
    } catch (err) {
      hapticError();
      Alert.alert('Scan Failed', 'Could not analyze your aura. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    hapticSelection();
    try {
      await Share.share({
        message: `My aura is ${result.title}! Discover yours with AuraSnap.`,
      });
    } catch {
      // ignore
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialReadings();
    setRefreshing(false);
  };

  const remainingScans = isGuest ? Math.max(0, 3 - guestUsageCount) : null;
  const greeting = useMemo(() => {
    const local = (user?.email?.split('@')[0] || '').trim();
    if (!local || local.startsWith('guest_')) return 'Explorer';
    return local;
  }, [user?.email]);

  const averageEnergy = useMemo(() => {
    if (!history.length) return 0;
    return Math.round(history.reduce((sum, item) => sum + (item.energy_level || 0), 0) / history.length);
  }, [history]);

  const averageMood = useMemo(() => {
    if (!history.length) return 0;
    const avg = history.reduce((sum, item) => sum + (item.mood_score || 0), 0) / history.length;
    return Number(avg.toFixed(1));
  }, [history]);

  const streakDays = useMemo(() => {
    if (!history.length) return 0;
    const days = new Set<number>();
    history.forEach((item) => {
      const date = new Date(item.created_at);
      if (!Number.isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        days.add(date.getTime());
      }
    });

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (days.has(cursor.getTime())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [history]);

  return (
    <SafeAreaView className="flex-1 bg-[#050816]" edges={['top']}>
      <LinearGradient colors={['#050816', '#0b1230', '#11183d']} style={{ flex: 1 }}>
        <View className="absolute left-[-95] top-[-80] h-60 w-60 rounded-full bg-violet-500/12" />
        <View className="absolute right-[-100] top-52 h-64 w-64 rounded-full bg-fuchsia-500/10" />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
        >
          {/* Header */}
          <View
            className="pb-2 pt-4 flex-row items-center justify-between"
            style={{ paddingHorizontal: horizontalPadding }}
          >
            <View>
              <Text className="text-3xl font-bold text-white">AuraSnap</Text>
              <Text className="mt-0.5 text-sm text-slate-300">
                {isGuest ? 'Guest Preview Mode' : `${getGreeting()}, ${greeting}`}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                hapticSelection();
                router.push('/(protected)/settings');
              }}
              className="h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              accessibilityHint="Opens profile and settings options"
            >
              <Ionicons name="person-outline" size={20} color="#cbd5e1" />
            </Pressable>
          </View>

          {/* Guest Usage Banner */}
          {isGuest && (
            <View
              className="mt-2 rounded-2xl border border-violet-300/20 bg-violet-500/15 p-4 flex-row items-center justify-between"
              style={{ marginHorizontal: horizontalPadding }}
            >
              <View className="flex-row items-center flex-1">
                <Ionicons name="sparkles" size={18} color="#c4b5fd" />
                <Text className="ml-2 flex-1 text-sm text-violet-100">
                  {remainingScans! > 0
                    ? `${remainingScans} free scan${remainingScans === 1 ? '' : 's'} remaining`
                    : 'No free scans left'}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/(auth)/register')}
                className="rounded-full bg-violet-600 px-3 py-1.5"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Create free account"
                accessibilityHint="Create account to unlock full aura history"
              >
                <Text className="text-xs font-semibold text-white">Sign Up</Text>
              </Pressable>
            </View>
          )}

        {/* Scan Area */}
        <View className="items-center py-10">
          <Animated.View style={glowAnimatedStyle} className="absolute h-56 w-56 rounded-full bg-violet-500/15" />
          <View className="absolute h-56 w-56 rounded-full border border-violet-400/25" />
          <View className="absolute h-64 w-64 rounded-full border border-violet-400/15" />
          <View className="absolute h-72 w-72 rounded-full border border-violet-400/10" />
          <Animated.View style={scanRippleAnimatedStyle} className="absolute h-56 w-56 rounded-full bg-violet-400/20" />

          <Animated.View style={orbAnimatedStyle}>
            <Animated.View style={scanPressAnimatedStyle}>
              <Pressable
                onPress={handleScan}
                onPressIn={handleScanPressIn}
                onPressOut={handleScanPressOut}
                disabled={isScanning}
                className="items-center"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Scan your aura"
                accessibilityHint="Opens the photo picker and analyzes your aura from a selfie"
              >
                <View className="h-44 w-44 items-center justify-center rounded-full bg-white/[0.03]">
                  <LinearGradient
                    colors={isScanning ? ['#374151', '#1f2937'] : ['#7c3aed', '#ec4899']}
                    style={{ height: 128, width: 128, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {isScanning ? (
                      <View className="items-center justify-center">
                        <Animated.View
                          style={[loadingSpinAnimatedStyle, {
                            position: 'absolute',
                            width: 86,
                            height: 86,
                            borderRadius: 999,
                            borderWidth: 3,
                            borderColor: 'rgba(196,181,253,0.85)',
                            borderRightColor: 'transparent',
                          }]}
                        />
                        <Ionicons name="sparkles" size={34} color="#ddd6fe" />
                      </View>
                    ) : (
                      <Ionicons name="camera" size={42} color="#ffffff" />
                    )}
                  </LinearGradient>
                </View>

                <View className="mt-4 rounded-full bg-violet-500/16 px-4 py-1.5">
                  <Text className="text-xs font-semibold tracking-wide text-violet-100">
                    {isScanning ? 'SCANNING...' : 'TAP TO SCAN'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </Animated.View>

          <Text className="mt-5 text-sm text-gray-400">
            {isScanning ? 'Reading your energy and aura signature...' : 'Upload a photo to discover your aura'}
          </Text>
        </View>

        {isScanning && (
          <Animated.View
            style={[loadingCardAnimatedStyle, { marginHorizontal: horizontalPadding }]}
            className="mb-7 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <Text className="text-xs font-semibold uppercase tracking-[2px] text-violet-200/90">Analyzing...</Text>
            <View className="mt-3 h-7 w-2/3 rounded-lg bg-white/10" />
            <View className="mt-3 h-4 w-full rounded-lg bg-white/10" />
            <View className="mt-2 h-4 w-4/5 rounded-lg bg-white/10" />
            <View className="mt-4 h-12 rounded-2xl bg-white/10" />
            <Animated.View style={[shimmerAnimatedStyle, { position: 'absolute', top: 0, bottom: 0, width: 160 }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.16)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </Animated.View>
        )}

        {/* Empty State (when no result and not scanning) */}
        {!result && !isScanning && (
          <View className="mt-2 items-center mb-8" style={{ marginHorizontal: horizontalPadding }}>
            <Text className="text-xl font-semibold tracking-tight text-white">Your Daily Aura Awaits</Text>
            <Text className="text-sm text-gray-400 text-center mt-2 mx-4">
              Take a selfie and our AI will analyze your energy, mood, and personality.
            </Text>
            <View className="mt-6 w-full flex-row items-center justify-center px-2">
              <View className="items-center">
                <View className="h-11 w-11 rounded-full bg-violet-500/20 items-center justify-center border border-violet-400/25">
                  <Ionicons name="camera" size={18} color="#c4b5fd" />
                </View>
                <Text className="text-xs text-violet-200 mt-1">Selfie</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color="#64748b" style={{ marginHorizontal: 12, marginTop: -8 }} />
              <View className="items-center">
                <View className="h-11 w-11 rounded-full bg-indigo-500/20 items-center justify-center border border-indigo-400/25">
                  <Ionicons name="sparkles" size={18} color="#bfdbfe" />
                </View>
                <Text className="text-xs text-indigo-200 mt-1">AI</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color="#64748b" style={{ marginHorizontal: 12, marginTop: -8 }} />
              <View className="items-center">
                <View className="h-11 w-11 rounded-full bg-pink-500/20 items-center justify-center border border-pink-400/25">
                  <Ionicons name="share-social-outline" size={18} color="#fbcfe8" />
                </View>
                <Text className="text-xs text-pink-200 mt-1">Share</Text>
              </View>
            </View>
          </View>
        )}

        {/* Result Card */}
        {result && (
          <Animated.View
            style={[resultAnimatedStyle, { marginHorizontal: horizontalPadding }]}
            className="mb-6"
          >
            <Pressable
              onPress={() => {
                hapticSelection();
                if (isUuid(result.id)) {
                  router.push(`/(protected)/aura/${result.id}`);
                } else {
                  Alert.alert('Guest Preview', 'Detailed page is available after your account is created.');
                }
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Open latest aura result details"
              accessibilityHint="Shows complete aura analysis for this scan"
            >
              <LinearGradient
                colors={getAuraGradient(result.title)}
                className="overflow-hidden rounded-3xl p-5 shadow-lg"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View className="absolute right-[-32] top-[-20] h-28 w-28 rounded-full bg-white/15" />
                <View className="absolute left-[-18] bottom-[-26] h-24 w-24 rounded-full bg-black/10" />

                <View className="mb-3 flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/75">
                      Latest Scan
                    </Text>
                    <Text className="mt-1 text-2xl font-bold text-white">
                      {auraEmoji(result.title)} {result.title} Aura
                    </Text>
                  </View>
                  <Text className="text-xs text-white/70">{result.date}</Text>
                </View>

                <Text className="mb-4 text-base leading-6 text-white/90" numberOfLines={3}>
                  {result.description}
                </Text>

                {/* Stats */}
                <View className="mb-4 flex-row">
                  {result.energy_level && (
                    <View className="mr-2 flex-row items-center rounded-full bg-white/22 px-3 py-1">
                      <Ionicons name="flash" size={12} color="white" />
                      <Text className="text-white text-xs ml-1">{result.energy_level}%</Text>
                    </View>
                  )}
                  {result.mood_score && (
                    <View className="flex-row items-center rounded-full bg-white/22 px-3 py-1">
                      <Ionicons name="heart" size={12} color="white" />
                      <Text className="text-white text-xs ml-1">{result.mood_score}/10</Text>
                    </View>
                  )}
                </View>

                <View className="flex-row gap-3">
                  <Pressable
                    onPress={handleShare}
                    className="flex-1 flex-row items-center justify-center rounded-xl bg-white/20 py-3"
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Share aura result"
                  >
                    <Ionicons name="share-outline" size={18} color="white" />
                    <Text className="text-white font-semibold ml-2">Share</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleScan}
                    className="flex-1 flex-row items-center justify-center rounded-xl border border-white/20 bg-white/10 py-3"
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Scan aura again"
                  >
                    <Ionicons name="refresh" size={18} color="white" />
                    <Text className="text-white font-semibold ml-2">Rescan</Text>
                  </Pressable>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {history.length > 0 && (
          <View className="mb-6" style={{ paddingHorizontal: horizontalPadding }}>
            <Text className="mb-3 text-lg font-bold tracking-tight text-white">Aura Stats</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-2xl font-bold text-white">{history.length}</Text>
                <Text className="mt-1 text-xs uppercase tracking-[1.5px] text-slate-400">Total Scans</Text>
              </View>
              <View className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-2xl font-bold text-white">{averageMood || '0.0'}</Text>
                <Text className="mt-1 text-xs uppercase tracking-[1.5px] text-slate-400">Avg Mood</Text>
              </View>
              <View className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className="text-2xl font-bold text-white">{streakDays}</Text>
                <Text className="mt-1 text-xs uppercase tracking-[1.5px] text-slate-400">Streak</Text>
              </View>
            </View>
            <View className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 px-4 py-3">
              <Text className="text-xs uppercase tracking-[1.5px] text-emerald-200/90">Energy Snapshot</Text>
              <Text className="mt-1 text-sm text-emerald-100/95">
                Average energy across your scans: {averageEnergy}%.
              </Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        {!isGuest && isAuthenticated && (
          <View className="mb-6" style={{ paddingHorizontal: horizontalPadding }}>
            <Text className="text-lg font-bold text-white mb-3">Quick Actions</Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  hapticSelection();
                  router.push('/(protected)/history');
                }}
                className="flex-1 bg-gray-800/60 p-4 rounded-2xl border border-gray-700/50"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Open aura history"
              >
                <Ionicons name="time-outline" size={24} color="#8b5cf6" />
                <Text className="text-white font-medium mt-2">History</Text>
                <Text className="text-gray-400 text-xs mt-0.5">Past readings</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  router.push('/(protected)/match');
                }}
                className="flex-1 bg-gray-800/60 p-4 rounded-2xl border border-gray-700/50"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Open aura match"
              >
                <Ionicons name="people-outline" size={24} color="#ec4899" />
                <Text className="text-white font-medium mt-2">Match</Text>
                <Text className="text-gray-400 text-xs mt-0.5">Compare auras</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* History Section */}
        {history.length > 0 && (
          <View className="mb-8" style={{ paddingHorizontal: horizontalPadding }}>
            <Text className="text-lg font-bold text-white mb-3">Recent Scans</Text>
            {history.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  hapticSelection();
                  if (isUuid(item.id)) {
                    router.push(`/(protected)/aura/${item.id}`);
                  } else {
                    Alert.alert('Guest Preview', 'Detailed page is available after your account is created.');
                  }
                }}
                className="bg-gray-800/60 p-4 rounded-2xl mb-2 flex-row items-center border border-gray-700/50"
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title} aura scan`}
              >
                <LinearGradient
                  colors={getAuraGradient(item.title)}
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                >
                  <Ionicons name="sparkles" size={16} color="white" />
                </LinearGradient>
                <View className="flex-1">
                  <Text className="font-semibold text-white">{item.title}</Text>
                  <Text className="text-xs text-gray-400">{item.date}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6b7280" />
              </Pressable>
            ))}
          </View>
        )}

        {/* Upgrade CTA for guests */}
        {isGuest && (
          <View className="mb-8" style={{ marginHorizontal: horizontalPadding }}>
            <Pressable
              onPress={() => router.push('/(auth)/register')}
              className="overflow-hidden rounded-3xl border border-violet-300/20 bg-[#101a43]"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Unlock full access by creating an account"
            >
              <LinearGradient
                colors={['#182858', '#1a2152']}
                className="px-5 py-4"
                style={{ minHeight: 92, justifyContent: 'center' }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-400/12" />
                <View className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-indigo-400/10" />

                <View className="pr-14">
                  <Text className="text-white text-lg font-bold">Unlock Full Access</Text>
                  <Text className="mt-1 text-sm text-slate-200/85" style={{ lineHeight: 18 }}>
                    Unlimited scans, history & aura matching
                  </Text>
                </View>
                <View
                  className="h-10 w-10 items-center justify-center rounded-full border border-violet-300/25 bg-violet-500/25"
                  style={{ position: 'absolute', right: 16, top: '50%', marginTop: -20 }}
                >
                  <Ionicons name="arrow-forward" size={17} color="#ffffff" />
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        )}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

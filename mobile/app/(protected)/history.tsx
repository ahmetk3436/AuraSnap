import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import api from '../../lib/api';
import { hapticLight, hapticMedium, hapticSelection, hapticWarning } from '../../lib/haptics';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  deleteGuestAuraReading,
  loadGuestAuraHistory,
  normalizeGuestAuraReading,
  saveGuestAuraReadings,
} from '../../lib/guestAuraHistory';

interface AuraReading {
  id: string;
  aura_color: string;
  energy_level: number;
  mood_score: number;
  created_at: string;
  personality?: string;
}

interface Stats {
  color_distribution: Record<string, number>;
  total_readings: number;
  average_energy: number;
  average_mood: number;
}

interface HistorySection {
  title: 'Today' | 'Yesterday' | 'This Week' | 'Earlier';
  data: AuraReading[];
}

const FREE_READING_LIMIT = 5;
const PAGE_SIZE = 20;

const AURA_STYLE: Record<string, { color: string; emoji: string }> = {
  red: { color: '#ef4444', emoji: '\u{1F525}' },
  orange: { color: '#f97316', emoji: '\u{1F31E}' },
  yellow: { color: '#eab308', emoji: '\u{2728}' },
  green: { color: '#22c55e', emoji: '\u{1F33F}' },
  blue: { color: '#3b82f6', emoji: '\u{1F30A}' },
  indigo: { color: '#6366f1', emoji: '\u{1F31A}' },
  violet: { color: '#8b5cf6', emoji: '\u{1F52E}' },
  pink: { color: '#ec4899', emoji: '\u{1F495}' },
  turquoise: { color: '#06b6d4', emoji: '\u{1F30C}' },
  gold: { color: '#f59e0b', emoji: '\u{1F451}' },
};

const MILESTONES = [10, 25, 50, 100];

function normalizeReading(raw: any): AuraReading {
  const normalized = normalizeGuestAuraReading(raw);
  return {
    id: normalized.id,
    aura_color: normalized.aura_color,
    energy_level: normalized.energy_level,
    mood_score: normalized.mood_score,
    created_at: normalized.created_at,
    personality: normalized.personality,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDateForLabel(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAuraMeta(colorName: string): { color: string; emoji: string; label: string } {
  const key = (colorName || 'violet').toLowerCase();
  const base = AURA_STYLE[key] || AURA_STYLE.violet;
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return { ...base, label };
}

function getBucketTitle(dateString: string): HistorySection['title'] {
  const readingDate = new Date(dateString);
  const now = new Date();

  if (Number.isNaN(readingDate.getTime())) {
    return 'Earlier';
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  const normalized = new Date(readingDate);
  normalized.setHours(0, 0, 0, 0);

  if (normalized.getTime() === today.getTime()) return 'Today';
  if (normalized.getTime() === yesterday.getTime()) return 'Yesterday';
  if (normalized >= weekStart) return 'This Week';
  return 'Earlier';
}

function buildSections(readings: AuraReading[]): HistorySection[] {
  const grouped: Record<HistorySection['title'], AuraReading[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  readings.forEach((reading) => {
    grouped[getBucketTitle(reading.created_at)].push(reading);
  });

  return (['Today', 'Yesterday', 'This Week', 'Earlier'] as const)
    .map((title) => ({ title, data: grouped[title] }))
    .filter((section) => section.data.length > 0);
}

function computeStatsFromReadings(readings: AuraReading[]): Stats {
  const distribution: Record<string, number> = {};
  let totalEnergy = 0;
  let totalMood = 0;

  readings.forEach((reading) => {
    const key = (reading.aura_color || 'violet').toLowerCase();
    distribution[key] = (distribution[key] || 0) + 1;
    totalEnergy += Number(reading.energy_level) || 0;
    totalMood += Number(reading.mood_score) || 0;
  });

  const count = readings.length;
  return {
    color_distribution: distribution,
    total_readings: count,
    average_energy: count > 0 ? totalEnergy / count : 0,
    average_mood: count > 0 ? totalMood / count : 0,
  };
}

function computeStreakDays(readings: AuraReading[]): number {
  if (readings.length === 0) return 0;

  const daySet = new Set<number>();
  readings.forEach((reading) => {
    const d = new Date(reading.created_at);
    if (Number.isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    daySet.add(d.getTime());
  });

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  let streak = 0;
  while (daySet.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function useCountUp(target: number, decimals = 0, durationMs = 700): string {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let mounted = true;
    let frame: ReturnType<typeof setTimeout> | null = null;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = target * eased;
      if (mounted) setValue(next);
      if (progress < 1) {
        frame = setTimeout(tick, 16);
      }
    };

    setValue(0);
    tick();

    return () => {
      mounted = false;
      if (frame) clearTimeout(frame);
    };
  }, [target, durationMs]);

  return value.toFixed(decimals);
}

function HistorySkeleton({ horizontalPadding }: { horizontalPadding: number }) {
  const shimmerX = useSharedValue(-220);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(260, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <SafeAreaView className="flex-1 bg-[#02040f]">
      <LinearGradient colors={['#02040f', '#070d24', '#0f1636']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 18 }}>
          <View className="h-9 w-36 rounded-xl bg-white/10" />
          <View className="mt-3 h-4 w-44 rounded-lg bg-white/10" />
        </View>

        <View style={{ paddingHorizontal: horizontalPadding }} className="mt-7">
          <View className="h-[164px] rounded-3xl border border-white/10 bg-white/5" />
          <View className="mt-5 h-36 rounded-3xl border border-white/10 bg-white/5" />
          <View className="mt-5 h-24 rounded-2xl border border-white/10 bg-white/5" />
          <View className="mt-5 h-28 rounded-2xl border border-white/10 bg-white/5" />
        </View>

        <Animated.View style={[shimmerStyle, { position: 'absolute', top: 0, bottom: 0, width: 180 }]}> 
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.13)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function ColorDistributionCard({
  distribution,
  horizontalPadding,
}: {
  distribution: Record<string, number>;
  horizontalPadding: number;
}) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const entries = useMemo(
    () => Object.entries(distribution).sort((a, b) => b[1] - a[1]),
    [distribution]
  );

  const total = useMemo(
    () => entries.reduce((sum, [, count]) => sum + count, 0),
    [entries]
  );

  const dominantColor = entries[0]?.[0] || 'violet';
  const dominantMeta = getAuraMeta(dominantColor);

  if (!entries.length) return null;

  return (
    <View style={{ marginHorizontal: horizontalPadding, marginTop: 18 }} className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-white">Aura Distribution</Text>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Text className="text-xl">{dominantMeta.emoji}</Text>
        </View>
      </View>

      {entries.map(([color, count], index) => {
        const meta = getAuraMeta(color);
        const percent = total > 0 ? (count / total) * 100 : 0;
        return (
          <Animated.View
            key={color}
            entering={FadeInDown.delay(index * 90).springify().damping(18)}
            className="mb-3"
          >
            <Pressable
              onPress={() => {
                hapticSelection();
                setSelectedColor(color);
              }}
              className="rounded-2xl border border-white/8 bg-white/5 p-3"
              accessibilityRole="button"
              accessibilityLabel={`${meta.label} aura appears ${count} times`}
              accessibilityHint="Shows this aura color percentage details"
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-white">{meta.emoji} {meta.label}</Text>
                <Text className="text-xs text-slate-300">{count}x • {percent.toFixed(0)}%</Text>
              </View>
              <View className="h-2.5 overflow-hidden rounded-full bg-slate-800/70">
                <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: meta.color }} />
              </View>
            </Pressable>
          </Animated.View>
        );
      })}

      {selectedColor && (() => {
        const selectedCount = distribution[selectedColor] || 0;
        const selectedPercent = total > 0 ? (selectedCount / total) * 100 : 0;
        const selectedMeta = getAuraMeta(selectedColor);
        return (
          <View className="mt-1 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
            <Text className="text-sm text-violet-100">
              {selectedMeta.emoji} {selectedMeta.label} appeared {selectedCount} times ({selectedPercent.toFixed(1)}%).
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

function HistoryItemCard({
  item,
  index,
  onSelect,
  onShare,
  onDelete,
}: {
  item: AuraReading;
  index: number;
  onSelect: (item: AuraReading) => void;
  onShare: (item: AuraReading) => void;
  onDelete: (item: AuraReading) => void;
}) {
  const meta = getAuraMeta(item.aura_color);
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const renderLeftActions = () => (
    <Pressable
      onPress={() => onShare(item)}
      className="mr-2 items-center justify-center rounded-2xl bg-violet-600 px-5"
      accessibilityRole="button"
      accessibilityLabel="Share reading"
      accessibilityHint="Shares this aura reading"
    >
      <Ionicons name="share-social" size={18} color="#fff" />
      <Text className="mt-1 text-xs font-semibold text-white">Share</Text>
    </Pressable>
  );

  const renderRightActions = () => (
    <Pressable
      onPress={() => onDelete(item)}
      className="ml-2 items-center justify-center rounded-2xl bg-red-600 px-5"
      accessibilityRole="button"
      accessibilityLabel="Delete reading"
      accessibilityHint="Deletes this aura reading"
    >
      <Ionicons name="trash" size={18} color="#fff" />
      <Text className="mt-1 text-xs font-semibold text-white">Delete</Text>
    </Pressable>
  );

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify().damping(18)}>
      <Swipeable
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={hapticLight}
      >
        <Animated.View style={pressStyle}>
          <Pressable
            onPress={() => {
              hapticMedium();
              onSelect(item);
            }}
            onPressIn={() => {
              scale.value = withSpring(1.02, { damping: 16, stiffness: 190 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 16, stiffness: 190 });
            }}
            className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            style={{
              shadowColor: meta.color,
              shadowOpacity: 0.14,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
            }}
            accessibilityRole="button"
            accessibilityLabel={`${meta.label} aura, ${formatDateForLabel(item.created_at)}, Energy ${item.energy_level} percent, Mood ${item.mood_score} out of 10`}
            accessibilityHint="Opens aura reading details"
          >
            <View style={{ backgroundColor: meta.color, width: 3, position: 'absolute', left: 0, top: 0, bottom: 0 }} />
            <View className="flex-row items-center px-4 py-4">
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `${meta.color}22` }}>
                <Text className="text-lg">{meta.emoji}</Text>
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-white">{meta.label} Aura</Text>
                <Text className="mt-0.5 text-xs text-slate-300">{formatDateForLabel(item.created_at)}</Text>
              </View>

              <View className="items-end">
                <View className="rounded-full bg-emerald-500/15 px-2.5 py-1">
                  <Text className="text-xs font-semibold text-emerald-300">⚡ {item.energy_level}%</Text>
                </View>
                <Text className="mt-1 text-xs text-pink-200">💗 {item.mood_score}/10</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Swipeable>
    </Animated.View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { isSubscribed } = useSubscription();
  const { isGuest, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;

  const [readings, setReadings] = useState<AuraReading[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showStickyUpgrade, setShowStickyUpgrade] = useState(false);
  const scrollEdgeRef = useRef<'top' | 'bottom' | null>(null);

  const refreshSpin = useSharedValue(0);
  const guestFloatY = useSharedValue(0);
  const guestButtonShimmerX = useSharedValue(-120);
  const emptyPulse = useSharedValue(1);

  useEffect(() => {
    refreshSpin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false);
    guestFloatY.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(2, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    guestButtonShimmerX.value = withRepeat(withTiming(220, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, false);
    emptyPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1200 }),
        withTiming(1, { duration: 1200 })
      ),
      -1,
      true
    );
  }, [emptyPulse, guestButtonShimmerX, guestFloatY, refreshSpin]);

  const refreshOrbStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshSpin.value}deg` }],
  }));

  const guestFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: guestFloatY.value }],
  }));

  const guestButtonShimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: guestButtonShimmerX.value }],
  }));

  const emptyPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emptyPulse.value }],
  }));

  const fetchGuestData = useCallback(async () => {
    try {
      let source = await loadGuestAuraHistory();

      if (source.length === 0) {
        try {
          const remoteRes = await api.get('/aura?page=1&page_size=30');
          const remoteRows = Array.isArray(remoteRes.data?.data) ? remoteRes.data.data : [];
          if (remoteRows.length > 0) {
            const normalizedRows = remoteRows.map((item: any) => normalizeGuestAuraReading(item));
            await saveGuestAuraReadings(normalizedRows);
            source = normalizedRows;
          }
        } catch {
          // Guest can be fully local-only.
        }
      }

      const parsed = source.map((item) => normalizeReading(item));
      setReadings(parsed);
      const localStats = computeStatsFromReadings(parsed);
      setStats(localStats);
      setStreakDays(computeStreakDays(parsed));
      setTotalCount(parsed.length);
      setHasMore(false);
      setPage(1);
      setLoadError(null);
    } catch {
      setReadings([]);
      setStats(null);
      setStreakDays(0);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      setIsLoadingMore(false);
    }
  }, []);

  const fetchAuthPage = useCallback(async (pageNum: number, append: boolean) => {
    if (!isAuthenticated) return;

    try {
      if (pageNum === 1 && !append) {
        setLoadError(null);
      }

      const listPromise = api.get(`/aura?page=${pageNum}&page_size=${PAGE_SIZE}`);
      const statsPromise = pageNum === 1 ? api.get('/aura/stats') : null;
      const streakPromise = pageNum === 1 ? api.get('/streak') : null;

      const [listRes, statsRes, streakRes] = await Promise.all([
        listPromise,
        statsPromise,
        streakPromise,
      ]);

      const rows = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
      const mappedRows: AuraReading[] = rows.map((item: any) => normalizeReading(item));

      setReadings((prev) => {
        if (!append || pageNum === 1) return mappedRows;
        const seen = new Set(prev.map((entry) => entry.id));
        const merged = [...prev];
        mappedRows.forEach((entry) => {
          if (!seen.has(entry.id)) merged.push(entry);
        });
        return merged;
      });

      const total = Number(listRes.data?.total_count || 0);
      setTotalCount(total);
      setHasMore(pageNum * PAGE_SIZE < total);
      setPage(pageNum);

      if (statsRes) {
        const statsPayload = (statsRes.data?.data || statsRes.data) ?? null;
        if (statsPayload) {
          setStats({
            color_distribution: statsPayload.color_distribution || {},
            total_readings: Number(statsPayload.total_readings || 0),
            average_energy: Number(statsPayload.average_energy || 0),
            average_mood: Number(statsPayload.average_mood || 0),
          });
        }
      }

      if (streakRes) {
        const streakPayload = streakRes.data?.data || streakRes.data || {};
        const currentStreak = Number(streakPayload.current_streak || streakPayload.streak || 0);
        setStreakDays(Number.isFinite(currentStreak) ? currentStreak : 0);
      }

      setLoadError(null);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        setLoadError('Session expired. Please sign in again.');
      } else {
        setLoadError('Could not load history right now.');
      }
      if (!append) {
        setReadings([]);
        setStats(null);
        setStreakDays(0);
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [isAuthenticated]);

  const fetchInitial = useCallback(async () => {
    if (isAuthLoading) return;

    if (isGuest) {
      await fetchGuestData();
      return;
    }

    if (!isAuthenticated) {
      setReadings([]);
      setStats(null);
      setStreakDays(0);
      setTotalCount(0);
      setHasMore(false);
      setLoadError(null);
      setIsLoading(false);
      setRefreshing(false);
      setIsLoadingMore(false);
      return;
    }

    await fetchAuthPage(1, false);
  }, [fetchAuthPage, fetchGuestData, isAuthLoading, isAuthenticated, isGuest]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const onRefresh = () => {
    if (isAuthLoading) return;
    setRefreshing(true);
    fetchInitial();
  };

  const handleLoadMore = () => {
    if (isGuest || !isAuthenticated || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    fetchAuthPage(page + 1, true);
  };

  const handleSelectReading = (reading: AuraReading) => {
    if (isUuid(reading.id)) {
      router.push(`/(protected)/aura/${reading.id}`);
      return;
    }

    Alert.alert('Guest Preview', 'Detailed page is available after your account is created.');
  };

  const handleShareReading = async (reading: AuraReading) => {
    hapticSelection();
    const meta = getAuraMeta(reading.aura_color);
    try {
      await Share.share({
        message: `${meta.emoji} My latest aura is ${meta.label}. Energy ${reading.energy_level}% • Mood ${reading.mood_score}/10`,
      });
    } catch {
      // Ignore system share cancellation.
    }
  };

  const handleDeleteReading = async (reading: AuraReading) => {
    hapticWarning();

    if (isGuest) {
      await deleteGuestAuraReading(reading.id);
      setReadings((prev) => {
        const next = prev.filter((item) => item.id !== reading.id);
        const nextStats = computeStatsFromReadings(next);
        setStats(nextStats);
        setStreakDays(computeStreakDays(next));
        setTotalCount(next.length);
        return next;
      });
      return;
    }

    // Backend delete endpoint is not available yet for aura history.
    setReadings((prev) => prev.filter((item) => item.id !== reading.id));
    setTotalCount((prev) => Math.max(0, prev - 1));
    setStats(null);
    Alert.alert('Hidden', 'Reading removed from this view. It may return after refresh.');
  };

  const fallbackStats = useMemo(() => computeStatsFromReadings(readings), [readings]);
  const resolvedStats = stats || fallbackStats;

  const displayedReadings = useMemo(() => {
    if (isGuest || isSubscribed) return readings;
    return readings.slice(0, FREE_READING_LIMIT);
  }, [isGuest, isSubscribed, readings]);

  const lockedCount = useMemo(() => {
    if (isGuest || isSubscribed) return 0;
    return Math.max(0, totalCount - displayedReadings.length);
  }, [displayedReadings.length, isGuest, isSubscribed, totalCount]);

  const sections = useMemo(() => buildSections(displayedReadings), [displayedReadings]);

  const totalScansCountUp = useCountUp(resolvedStats.total_readings, 0);
  const avgEnergyCountUp = useCountUp(resolvedStats.average_energy, 0);
  const avgMoodCountUp = useCountUp(resolvedStats.average_mood, 1);
  const streakCountUp = useCountUp(streakDays, 0);

  const uniqueColors = useMemo(
    () => Object.keys(resolvedStats.color_distribution || {}).filter((key) => (resolvedStats.color_distribution[key] || 0) > 0).length,
    [resolvedStats.color_distribution]
  );

  const badges = useMemo(
    () => [
      { id: 'first_scan', label: 'First Scan', unlocked: resolvedStats.total_readings >= 1 },
      { id: 'ten_scans', label: '10 Scans', unlocked: resolvedStats.total_readings >= 10 },
      { id: 'all_colors', label: 'All Colors', unlocked: uniqueColors >= 7 },
      { id: 'week_warrior', label: 'Week Warrior', unlocked: streakDays >= 7 },
    ],
    [resolvedStats.total_readings, streakDays, uniqueColors]
  );

  const nextMilestone = useMemo(() => {
    return MILESTONES.find((value) => value > resolvedStats.total_readings) || null;
  }, [resolvedStats.total_readings]);

  const milestoneProgress = useMemo(() => {
    if (!nextMilestone) return 1;
    return Math.min(1, resolvedStats.total_readings / nextMilestone);
  }, [nextMilestone, resolvedStats.total_readings]);

  const dominantColorMeta = useMemo(() => {
    const top = Object.entries(resolvedStats.color_distribution || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'violet';
    return getAuraMeta(top);
  }, [resolvedStats.color_distribution]);

  const listHeader = (
    <View>
      <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 14 }}>
        <Text className="text-3xl font-bold tracking-tight text-white">History</Text>
        <Text className="mt-1 text-sm text-slate-300">Track your aura over time</Text>
      </View>

      {refreshing && (
        <View style={{ marginHorizontal: horizontalPadding }} className="mt-4 overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
          <LinearGradient
            colors={['rgba(139,92,246,0.2)', 'rgba(236,72,153,0.12)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View className="flex-row items-center">
            <Animated.View style={refreshOrbStyle} className="mr-2 h-7 w-7 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/20">
              <Ionicons name="sparkles" size={14} color="#ddd6fe" />
            </Animated.View>
            <Text className="text-sm text-violet-100">Refreshing your aura timeline...</Text>
          </View>
        </View>
      )}

      {isGuest && (
        <Animated.View style={[guestFloatStyle, { marginHorizontal: horizontalPadding }]} className="mt-5 overflow-hidden rounded-3xl border border-violet-300/20 bg-violet-500/12 p-5">
          <View className="absolute right-[-18] top-[-12] h-24 w-24 rounded-full bg-violet-300/12" />
          <Text className="text-lg font-semibold text-white">Guest Vault Mode</Text>
          <Text className="mt-1 text-sm leading-5 text-violet-100/85">
            Guest history is saved for 30 days. Claim your free account to keep everything forever.
          </Text>
          <View className="mt-3 flex-row items-center rounded-2xl border border-violet-300/20 bg-violet-500/10 px-3 py-2">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-violet-200/20">
              <Ionicons name="gift-outline" size={16} color="#ddd6fe" />
            </View>
            <Text className="ml-2 flex-1 text-xs text-violet-100/90">
              Your aura streak and badges will transfer when you create your account.
            </Text>
          </View>

          <Pressable
            onPress={() => {
              hapticSelection();
              router.push('/(auth)/register');
            }}
            className="mt-4 overflow-hidden rounded-xl bg-violet-600 px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel="Create free account"
            accessibilityHint="Claims your guest history permanently"
          >
            <Text className="text-center text-sm font-bold text-white">Create Free Account</Text>
            <Animated.View style={[guestButtonShimmerStyle, { position: 'absolute', top: 0, bottom: 0, width: 100 }]}> 
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.24)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}

      {loadError && !isGuest && (
        <View style={{ marginHorizontal: horizontalPadding }} className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
          <Text className="text-sm font-semibold text-red-200">{loadError}</Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => {
                hapticSelection();
                fetchInitial();
              }}
              className="flex-1 rounded-lg bg-red-500/20 py-2.5 items-center"
            >
              <Text className="text-sm font-semibold text-red-100">Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              className="flex-1 rounded-lg border border-red-300/20 py-2.5 items-center"
            >
              <Text className="text-sm font-semibold text-red-100">Sign In</Text>
            </Pressable>
          </View>
        </View>
      )}

      {resolvedStats.total_readings > 0 && (
        <View style={{ paddingHorizontal: horizontalPadding }} className="mt-6">
          <Text className="mb-3 text-lg font-semibold text-white">Aura Snapshot</Text>

          <View className="flex-row gap-3">
            <Animated.View entering={FadeInDown.delay(0).springify().damping(17)} className="flex-1 rounded-3xl border border-violet-300/20 bg-white/5 p-4" style={{ minHeight: 145 }}>
              <Text className="text-xs uppercase tracking-[2px] text-slate-400">Total Scans</Text>
              <Text className="mt-2 text-4xl font-bold text-white">{totalScansCountUp}</Text>
              <Text className="mt-2 text-xs text-violet-100">{dominantColorMeta.emoji} Dominant: {dominantColorMeta.label}</Text>
            </Animated.View>

            <View className="flex-1 gap-3">
              <Animated.View entering={FadeInDown.delay(100).springify().damping(17)} className="rounded-3xl border border-emerald-300/20 bg-white/5 p-4">
                <Text className="text-xs uppercase tracking-[2px] text-slate-400">Avg Energy</Text>
                <Text className="mt-2 text-2xl font-bold text-emerald-200">{avgEnergyCountUp}%</Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(200).springify().damping(17)} className="rounded-3xl border border-pink-300/20 bg-white/5 p-4">
                <Text className="text-xs uppercase tracking-[2px] text-slate-400">Avg Mood</Text>
                <Text className="mt-2 text-2xl font-bold text-pink-200">{avgMoodCountUp}</Text>
              </Animated.View>
            </View>
          </View>

          <Animated.View entering={FadeInDown.delay(260).springify().damping(17)} className="mt-3 rounded-2xl border border-orange-300/25 bg-orange-500/10 p-3">
            <Text className="text-sm text-orange-100">🔥 {streakCountUp} day streak {streakDays > 0 ? 'active' : 'ready to start'}</Text>
            {streakDays === 0 && (
              <Text className="mt-1 text-xs text-orange-200/80">Don\'t break the chain: take your aura scan today.</Text>
            )}
          </Animated.View>
        </View>
      )}

      {resolvedStats.total_readings > 0 && (
        <ColorDistributionCard distribution={resolvedStats.color_distribution} horizontalPadding={horizontalPadding} />
      )}

      {resolvedStats.total_readings > 0 && (
        <View style={{ marginHorizontal: horizontalPadding, marginTop: 18 }} className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <Text className="text-sm font-semibold text-white">Achievements</Text>
          <View className="mt-3 flex-row flex-wrap">
            {badges.map((badge) => (
              <View
                key={badge.id}
                className={`mr-2 mb-2 rounded-full px-3 py-1.5 ${badge.unlocked ? 'bg-violet-500/20 border border-violet-300/25' : 'bg-slate-700/35 border border-slate-500/20'}`}
              >
                <Text className={`text-xs font-semibold ${badge.unlocked ? 'text-violet-100' : 'text-slate-400'}`}>
                  {badge.unlocked ? '🏆' : '🔒'} {badge.label}
                </Text>
              </View>
            ))}
          </View>

          {nextMilestone && (
            <View className="mt-2">
              <Text className="text-xs text-slate-300">
                {Math.max(0, nextMilestone - resolvedStats.total_readings)} more scans to unlock {nextMilestone} milestone
              </Text>
              <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <LinearGradient
                  colors={['#7c3aed', '#ec4899']}
                  style={{ height: '100%', width: `${Math.max(4, milestoneProgress * 100)}%` }}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
            </View>
          )}
        </View>
      )}

      {!!sections.length && (
        <View style={{ paddingHorizontal: horizontalPadding, marginTop: 22, marginBottom: 8 }}>
          <Text className="text-lg font-semibold text-white">Recent Readings</Text>
        </View>
      )}
    </View>
  );

  const listEmpty = (
    <View style={{ paddingHorizontal: horizontalPadding }} className="items-center pt-16 pb-24">
      <View className="absolute left-8 top-14 h-16 w-16 rounded-full bg-violet-500/12" />
      <View className="absolute right-10 top-28 h-10 w-10 rounded-full bg-pink-500/12" />
      <View className="h-24 w-24 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/10">
        <Ionicons name="sparkles-outline" size={44} color="#c4b5fd" />
      </View>
      <Text className="mt-5 text-xl font-semibold text-white">No readings yet</Text>
      <Text className="mt-2 text-center text-sm leading-6 text-slate-300">
        Scan your first aura to start your timeline and unlock badges.
      </Text>
      <Animated.View style={emptyPulseStyle} className="mt-6">
        <Pressable
          onPress={() => {
            hapticSelection();
            router.push('/(protected)/home');
          }}
          className="rounded-full bg-violet-600 px-7 py-3"
          accessibilityRole="button"
          accessibilityLabel="Start scanning"
        >
          <Text className="text-sm font-bold text-white">Start Scanning</Text>
        </Pressable>
      </Animated.View>
    </View>
  );

  const listFooter = (
    <View style={{ paddingHorizontal: horizontalPadding }} className="pb-32">
      {isLoadingMore && (
        <View className="items-center py-4">
          <Text className="text-sm text-violet-200">Loading more readings...</Text>
        </View>
      )}

      {lockedCount > 0 && (
        <View className="mt-3 rounded-3xl border border-violet-300/20 bg-violet-500/10 p-4">
          <Text className="text-sm font-semibold text-violet-100">🔒 {lockedCount} more readings</Text>
          <Text className="mt-1 text-xs text-violet-200/80">
            Upgrade to Premium to unlock your full aura archive.
          </Text>

          <View className="mt-3 space-y-2">
            <View className="mb-2 h-14 rounded-2xl border border-white/10 bg-white/8" />
            <View className="h-14 rounded-2xl border border-white/10 bg-white/8" />
          </View>

          <Pressable
            onPress={() => {
              hapticSelection();
              router.push('/(protected)/paywall');
            }}
            className="mt-4 overflow-hidden rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Unlock premium history"
          >
            <LinearGradient
              colors={['#7c3aed', '#ec4899']}
              className="items-center py-3"
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text className="text-sm font-bold text-white">✨ Unlock Premium</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (isLoading) {
    return <HistorySkeleton horizontalPadding={horizontalPadding} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#02040f]">
      <LinearGradient colors={['#02040f', '#070d24', '#0f1636']} style={{ flex: 1 }}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 160 }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          renderItem={({ item, index }) => (
            <View style={{ marginHorizontal: horizontalPadding }}>
              <HistoryItemCard
                item={item}
                index={index}
                onSelect={handleSelectReading}
                onShare={handleShareReading}
                onDelete={handleDeleteReading}
              />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View className="border-t border-white/5 bg-[#0a1029]/95" style={{ paddingHorizontal: horizontalPadding, paddingVertical: 10 }}>
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-400">{section.title}</Text>
            </View>
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y;
            const contentHeight = event.nativeEvent.contentSize.height;
            const viewportHeight = event.nativeEvent.layoutMeasurement.height;
            const atTop = y <= 2;
            const atBottom = y + viewportHeight >= contentHeight - 4;

            if (atTop && scrollEdgeRef.current !== 'top') {
              hapticLight();
              scrollEdgeRef.current = 'top';
            } else if (atBottom && scrollEdgeRef.current !== 'bottom') {
              hapticLight();
              scrollEdgeRef.current = 'bottom';
            } else if (!atTop && !atBottom && scrollEdgeRef.current) {
              scrollEdgeRef.current = null;
            }

            if (!showStickyUpgrade && y > 260) {
              setShowStickyUpgrade(true);
            }
            if (showStickyUpgrade && y <= 210) {
              setShowStickyUpgrade(false);
            }
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
        />

        {lockedCount > 0 && showStickyUpgrade && (
          <Animated.View
            entering={FadeInDown.duration(220).springify().damping(18)}
            style={{
              position: 'absolute',
              left: horizontalPadding,
              right: horizontalPadding,
              bottom: Math.max(insets.bottom, 12) + 74,
            }}
          >
            <Pressable
              onPress={() => {
                hapticSelection();
                router.push('/(protected)/paywall');
              }}
              className="overflow-hidden rounded-2xl border border-violet-300/20"
            >
              <LinearGradient
                colors={['#1f2b66', '#3b1f70']}
                className="flex-row items-center justify-between px-4 py-3"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text className="text-sm font-semibold text-violet-100">💎 Upgrade for full history</Text>
                <Ionicons name="arrow-forward" size={16} color="#ddd6fe" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

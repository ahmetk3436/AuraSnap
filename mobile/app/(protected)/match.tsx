import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal as RNModal,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import {
  hapticError,
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../../lib/haptics';
import api from '../../lib/api';

interface MatchResponse {
  id: string;
  friend_id: string;
  compatibility_score: number;
  synergy: string;
  tension: string;
  advice: string;
  user_aura_color: string;
  friend_aura_color: string;
  created_at: string;
}

interface MatchBreakdown {
  energy: number;
  emotional: number;
  mind: number;
  vibe: number;
}

type InputMode = 'scan' | 'manual';

type MatchErrorType =
  | 'invalid'
  | 'self'
  | 'already'
  | 'network'
  | 'not_found'
  | 'generic'
  | null;

const FREE_DAILY_MATCHES = 1;
const FREE_USAGE_KEY = 'aurasnap_free_match_usage_v1';

const AURA_GRADIENTS: Record<string, [string, string]> = {
  red: ['#b91c1c', '#ef4444'],
  orange: ['#c2410c', '#fb923c'],
  yellow: ['#a16207', '#eab308'],
  green: ['#166534', '#22c55e'],
  blue: ['#1d4ed8', '#3b82f6'],
  indigo: ['#312e81', '#6366f1'],
  violet: ['#7c3aed', '#a855f7'],
  pink: ['#be185d', '#ec4899'],
  turquoise: ['#0f766e', '#14b8a6'],
  gold: ['#b45309', '#f59e0b'],
};

const LOADING_STEPS = [
  'Analyzing your aura...',
  "Scanning friend's energy...",
  'Calculating compatibility...',
];

function getAuraGradient(colorName?: string): [string, string] {
  const key = (colorName || 'violet').toLowerCase();
  return AURA_GRADIENTS[key] || AURA_GRADIENTS.violet;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function extractFriendId(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  if (isUuid(input)) return input;

  const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (match?.[0]) return match[0];

  if (input.startsWith('aurasnap://')) {
    const qs = input.split('?')[1] || '';
    const query = new URLSearchParams(qs);
    const id = query.get('id');
    if (id && isUuid(id)) return id;
  }

  return null;
}

function buildBreakdown(score: number): MatchBreakdown {
  const s = Math.max(0, Math.min(100, score));
  return {
    energy: Math.max(30, Math.min(100, s + 5)),
    emotional: Math.max(20, Math.min(100, s - 2)),
    mind: Math.max(25, Math.min(100, s + 1)),
    vibe: Math.max(20, Math.min(100, s - 4)),
  };
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function secondsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function matchErrorDetails(type: MatchErrorType): { title: string; description: string } {
  switch (type) {
    case 'invalid':
      return {
        title: 'Invalid ID format',
        description: "This ID format does not look valid. Ask your friend to copy from AuraSnap directly.",
      };
    case 'self':
      return {
        title: 'Self match blocked',
        description: 'You cannot match with your own ID. Pick a different friend.',
      };
    case 'already':
      return {
        title: 'Already matched',
        description: 'You already have a recent match with this friend. Open history to review it.',
      };
    case 'network':
      return {
        title: 'Connection issue',
        description: 'Network request failed. Check your internet and try again.',
      };
    case 'not_found':
      return {
        title: 'Friend not found',
        description: "That ID does not exist yet. Confirm your friend's share code.",
      };
    case 'generic':
      return {
        title: 'Could not complete match',
        description: 'Please try again in a moment.',
      };
    default:
      return {
        title: '',
        description: '',
      };
  }
}

function generatePseudoQr(seed: string, size = 25): boolean[][] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const matrix: boolean[][] = [];
  let localHash = hash || 123456789;
  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) {
      const inFinder =
        (x < 7 && y < 7) ||
        (x > size - 8 && y < 7) ||
        (x < 7 && y > size - 8);

      if (inFinder) {
        const border = x % (size - 1) === 0 || y % (size - 1) === 0;
        row.push(border || (x % 6 > 0 && y % 6 > 0));
        continue;
      }

      localHash = (localHash * 1664525 + 1013904223) >>> 0;
      row.push((localHash & 1) === 1);
    }
    matrix.push(row);
  }
  return matrix;
}

function CompatibilityRing({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let mounted = true;
    const start = Date.now();
    const duration = 780;

    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(score * eased);
      if (mounted) setDisplayScore(value);
      if (progress < 1) {
        setTimeout(tick, 16);
      }
    };

    setDisplayScore(0);
    tick();

    return () => {
      mounted = false;
    };
  }, [score]);

  const gradient: [string, string] =
    score >= 80 ? ['#14b8a6', '#22c55e'] : score >= 60 ? ['#7c3aed', '#a855f7'] : ['#f59e0b', '#ef4444'];

  return (
    <View className="items-center justify-center">
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="h-40 w-40 items-center justify-center rounded-full"
      >
        <View className="h-32 w-32 items-center justify-center rounded-full bg-[#0a1130]">
          <Text className="text-4xl font-bold text-white">{displayScore}%</Text>
          <Text className="mt-1 text-xs uppercase tracking-[2px] text-slate-300">Match</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function ShareChannel({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="mb-2 flex-row items-center rounded-xl border border-white/10 bg-white/10 px-3 py-3">
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
        <Ionicons name={icon as any} size={16} color="#ddd6fe" />
      </View>
      <Text className="text-sm font-semibold text-slate-100">{label}</Text>
    </Pressable>
  );
}

function HistoryItem({
  item,
  onOpen,
  onDelete,
}: {
  item: MatchResponse;
  onOpen: (match: MatchResponse) => void;
  onDelete: (id: string) => void;
}) {
  const friendShort = `${item.friend_id.slice(0, 6)}...${item.friend_id.slice(-4)}`;

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            hapticWarning();
            onDelete(item.id);
          }}
          className="ml-2 items-center justify-center rounded-2xl bg-red-600 px-4"
        >
          <Ionicons name="trash" size={16} color="#fff" />
          <Text className="mt-1 text-xs font-semibold text-white">Delete</Text>
        </Pressable>
      )}
      onSwipeableWillOpen={hapticLight}
    >
      <Pressable
        onPress={() => {
          hapticSelection();
          onOpen(item);
        }}
        className="mb-3 rounded-2xl border border-white/10 bg-white/10 p-3.5"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <LinearGradient
              colors={getAuraGradient(item.friend_aura_color)}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <Text className="text-xs font-bold text-white">{friendShort.slice(0, 1).toUpperCase()}</Text>
            </LinearGradient>
            <View className="ml-3">
              <Text className="text-sm font-semibold text-white">Friend {friendShort}</Text>
              <Text className="text-xs text-slate-400">{formatDateLabel(item.created_at)}</Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-lg font-bold text-violet-200">{item.compatibility_score}%</Text>
            <Text className="text-[11px] text-slate-400">Compatibility</Text>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id: deepLinkId } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();

  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;
  const inputRef = useRef<TextInput>(null);

  const [selfAuraColor, setSelfAuraColor] = useState('violet');
  const [friendId, setFriendId] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('scan');

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  const [errorType, setErrorType] = useState<MatchErrorType>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [showQrModal, setShowQrModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState<MatchResponse | null>(null);
  const [matches, setMatches] = useState<MatchResponse[]>([]);

  const [clipboardSuggestion, setClipboardSuggestion] = useState<string | null>(null);
  const [scannerFlashEnabled, setScannerFlashEnabled] = useState(false);

  const [freeUsedToday, setFreeUsedToday] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  const ownId = user?.id || '';
  const ownShortId = ownId ? `${ownId.slice(0, 8)}...${ownId.slice(-4)}` : 'Not ready';
  const deepLink = ownId ? `aurasnap://match?id=${ownId}` : '';

  const canSubmitUuid = isUuid(friendId);

  const orbLeftPulse = useSharedValue(1);
  const orbRightPulse = useSharedValue(1);
  const matchButtonPulse = useSharedValue(1);
  const copyIconScale = useSharedValue(1);
  const scrollY = useSharedValue(0);

  useEffect(() => {
    orbLeftPulse.value = withRepeat(
      withSequence(withTiming(1.07, { duration: 1500 }), withTiming(1, { duration: 1500 })),
      -1,
      true
    );

    orbRightPulse.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 1700 }), withTiming(1, { duration: 1700 })),
      -1,
      true
    );

    matchButtonPulse.value = withRepeat(
      withSequence(withTiming(1.02, { duration: 850 }), withTiming(1, { duration: 850 })),
      -1,
      true
    );
  }, [matchButtonPulse, orbLeftPulse, orbRightPulse]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => {
      setLoadingStepIndex((prev) => {
        const next = (prev + 1) % LOADING_STEPS.length;
        hapticLight();
        return next;
      });
    }, 1050);
    return () => clearInterval(timer);
  }, [isLoading]);

  const leftOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbLeftPulse.value }],
  }));

  const rightOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbRightPulse.value }],
  }));

  const matchButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: matchButtonPulse.value }],
  }));

  const copyIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: copyIconScale.value }],
  }));

  const heroParallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value * 0.16 }],
  }));

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const ownGradient = useMemo(() => getAuraGradient(selfAuraColor), [selfAuraColor]);

  const averageCompatibility = useMemo(() => {
    if (!matches.length) return 0;
    const total = matches.reduce((acc, item) => acc + Number(item.compatibility_score || 0), 0);
    return Math.round(total / matches.length);
  }, [matches]);

  const bestMatch = useMemo(() => {
    if (!matches.length) return null;
    return [...matches].sort((a, b) => b.compatibility_score - a.compatibility_score)[0];
  }, [matches]);

  const mostActiveDay = useMemo(() => {
    if (!matches.length) return 'N/A';
    const byDay = new Map<string, number>();
    for (const item of matches) {
      const d = new Date(item.created_at);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    let maxDay = 'N/A';
    let maxCount = 0;
    byDay.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        maxDay = key;
      }
    });
    return maxDay;
  }, [matches]);

  const recentFriends = useMemo(() => {
    const ids = new Set<string>();
    const result: string[] = [];
    for (const item of matches) {
      if (!ids.has(item.friend_id)) {
        ids.add(item.friend_id);
        result.push(item.friend_id);
      }
      if (result.length >= 4) break;
    }
    return result;
  }, [matches]);

  const topLeaderboard = useMemo(() => {
    return [...matches]
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
      .slice(0, 3)
      .map((entry, index) => ({
        rank: index + 1,
        alias: `User-${entry.friend_id.slice(0, 4)}`,
        score: entry.compatibility_score,
      }));
  }, [matches]);

  const matchStreak = useMemo(() => {
    if (!matches.length) return 0;
    const set = new Set<number>();
    matches.forEach((item) => {
      const d = new Date(item.created_at);
      d.setHours(0, 0, 0, 0);
      set.add(d.getTime());
    });
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (set.has(cursor.getTime())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [matches]);

  const freeRemaining = Math.max(0, FREE_DAILY_MATCHES - freeUsedToday);
  const freeResetSeconds = useMemo(() => {
    void nowTick;
    return secondsUntilTomorrow();
  }, [nowTick]);

  const syncFreeUsage = useCallback(async () => {
    const raw = await AsyncStorage.getItem(FREE_USAGE_KEY);
    const today = dayKey();
    if (!raw) {
      await AsyncStorage.setItem(FREE_USAGE_KEY, JSON.stringify({ day: today, count: 0 }));
      setFreeUsedToday(0);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.day !== today) {
        await AsyncStorage.setItem(FREE_USAGE_KEY, JSON.stringify({ day: today, count: 0 }));
        setFreeUsedToday(0);
      } else {
        setFreeUsedToday(Math.max(0, Number(parsed.count) || 0));
      }
    } catch {
      await AsyncStorage.setItem(FREE_USAGE_KEY, JSON.stringify({ day: today, count: 0 }));
      setFreeUsedToday(0);
    }
  }, []);

  const incrementFreeUsage = useCallback(async () => {
    const today = dayKey();
    const next = freeUsedToday + 1;
    await AsyncStorage.setItem(FREE_USAGE_KEY, JSON.stringify({ day: today, count: next }));
    setFreeUsedToday(next);
  }, [freeUsedToday]);

  const fetchSelfAura = useCallback(async () => {
    try {
      const res = await api.get('/aura?page=1&page_size=1');
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const latestColor = rows[0]?.aura_color;
      if (typeof latestColor === 'string' && latestColor.length > 0) {
        setSelfAuraColor(latestColor.toLowerCase());
      }
    } catch {
      setSelfAuraColor('violet');
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const res = await api.get('/match');
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const sorted: MatchResponse[] = rows
        .map((row: any) => ({
          id: String(row.id),
          friend_id: String(row.friend_id),
          compatibility_score: Number(row.compatibility_score || 0),
          synergy: String(row.synergy || ''),
          tension: String(row.tension || ''),
          advice: String(row.advice || ''),
          user_aura_color: String(row.user_aura_color || 'violet'),
          friend_aura_color: String(row.friend_aura_color || 'violet'),
          created_at: String(row.created_at || new Date().toISOString()),
        }))
        .sort((a: MatchResponse, b: MatchResponse) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setMatches(sorted);
    } catch {
      setMatches([]);
    }
  }, []);

  const fetchClipboardSuggestion = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const id = extractFriendId(text);
      if (id && id !== ownId) {
        setClipboardSuggestion(id);
      } else {
        setClipboardSuggestion(null);
      }
    } catch {
      setClipboardSuggestion(null);
    }
  }, [ownId]);

  useEffect(() => {
    fetchSelfAura();
    fetchMatches();
    syncFreeUsage();
    fetchClipboardSuggestion();
  }, [fetchClipboardSuggestion, fetchMatches, fetchSelfAura, syncFreeUsage]);

  useEffect(() => {
    if (!deepLinkId || typeof deepLinkId !== 'string') return;
    const extracted = extractFriendId(deepLinkId);
    if (extracted) {
      setFriendId(extracted);
      setInputMode('manual');
    }
  }, [deepLinkId]);

  const onCopyId = async () => {
    if (!ownId) return;
    await Clipboard.setStringAsync(ownId);
    setCopiedId(true);
    hapticSuccess();
    copyIconScale.value = withSequence(withSpring(1.25), withSpring(1));
    setTimeout(() => setCopiedId(false), 1600);
  };

  const onCopyLink = async () => {
    if (!deepLink) return;
    await Clipboard.setStringAsync(deepLink);
    setCopiedLink(true);
    hapticSuccess();
    setTimeout(() => setCopiedLink(false), 1700);
  };

  const onShareDefault = async () => {
    if (!ownId) return;
    hapticSelection();
    await Share.share({
      message: `Match with me on AuraSnap\nID: ${ownId}\nLink: ${deepLink}`,
    });
  };

  const onShareChannel = async (channel: 'whatsapp' | 'instagram' | 'twitter') => {
    if (!ownId) return;

    const msg = encodeURIComponent(`Match with me on AuraSnap: ${deepLink}`);
    if (channel === 'whatsapp') {
      const url = `https://wa.me/?text=${msg}`;
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        await onShareDefault();
      }
      return;
    }

    if (channel === 'twitter') {
      const url = `https://twitter.com/intent/tweet?text=${msg}`;
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        await onShareDefault();
      }
      return;
    }

    Alert.alert('Instagram', 'Story share is not available in Expo preview. Using system share.');
    await onShareDefault();
  };

  const onPaste = async () => {
    hapticSelection();
    const text = await Clipboard.getStringAsync();
    const extracted = extractFriendId(text);
    if (!extracted) {
      setErrorType('invalid');
      return;
    }
    setFriendId(extracted);
    setErrorType(null);
  };

  const onOpenScanner = async () => {
    hapticSelection();
    Alert.alert(
      'Scanner Mode',
      'Camera QR scanner is staged for native build. You can use Paste QR payload right now.',
      [{ text: 'OK' }]
    );
  };

  const onSelectRecentFriend = (id: string) => {
    hapticSelection();
    setFriendId(id);
    setInputMode('manual');
    setErrorType(null);
    setTimeout(() => inputRef.current?.focus(), 140);
  };

  const onDeleteMatchLocal = (id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  };

  const openResultFromHistory = (match: MatchResponse) => {
    setSelectedMatch(match);
    setShowResultModal(true);
  };

  const mapApiError = (err: any): MatchErrorType => {
    const status = err?.response?.status;
    const message = String(err?.response?.data?.message || err?.response?.data?.error || '').toLowerCase();

    if (status === 404) return 'not_found';
    if (message.includes('yourself')) return 'self';
    if (message.includes('already')) return 'already';
    if (message.includes('uuid') || message.includes('invalid')) return 'invalid';
    if (!err?.response) return 'network';
    return 'generic';
  };

  const onMatch = async () => {
    setErrorType(null);

    const normalizedId = extractFriendId(friendId);
    if (!normalizedId) {
      hapticError();
      setErrorType('invalid');
      return;
    }

    if (normalizedId === ownId) {
      hapticError();
      setErrorType('self');
      return;
    }

    if (!isSubscribed && freeRemaining <= 0) {
      hapticError();
      Alert.alert(
        'Daily limit reached',
        `You used ${FREE_DAILY_MATCHES} free match today. Next free slot in ${formatCountdown(freeResetSeconds)}.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/(protected)/paywall') },
          { text: 'Not now', style: 'cancel' },
        ]
      );
      return;
    }

    setIsLoading(true);
    setLoadingStepIndex(0);

    try {
      const res = await api.post('/match', { friend_id: normalizedId });
      const match: MatchResponse = {
        id: String(res.data?.id || `${Date.now()}`),
        friend_id: String(res.data?.friend_id || normalizedId),
        compatibility_score: Number(res.data?.compatibility_score || 0),
        synergy: String(res.data?.synergy || ''),
        tension: String(res.data?.tension || ''),
        advice: String(res.data?.advice || ''),
        user_aura_color: String(res.data?.user_aura_color || selfAuraColor),
        friend_aura_color: String(res.data?.friend_aura_color || 'violet'),
        created_at: String(res.data?.created_at || new Date().toISOString()),
      };

      if (!isSubscribed) {
        await incrementFreeUsage();
      }

      setSelectedMatch(match);
      setShowResultModal(true);
      setFriendId('');
      await fetchMatches();
      hapticSuccess();
    } catch (err: any) {
      const mapped = mapApiError(err);
      setErrorType(mapped);
      hapticError();
    } finally {
      setIsLoading(false);
    }
  };

  const onShareResult = async () => {
    if (!selectedMatch) return;
    const shortFriend = `${selectedMatch.friend_id.slice(0, 6)}...${selectedMatch.friend_id.slice(-4)}`;
    await Share.share({
      message: `Aura Match result\nYou vs ${shortFriend}\nCompatibility: ${selectedMatch.compatibility_score}%\n${selectedMatch.advice}`,
    });
  };

  const breakdown = useMemo(
    () => buildBreakdown(selectedMatch?.compatibility_score || 0),
    [selectedMatch?.compatibility_score]
  );

  const qrMatrix = useMemo(() => generatePseudoQr(deepLink || ownId || 'aurasnap'), [deepLink, ownId]);

  const errorDetails = matchErrorDetails(errorType);

  return (
    <SafeAreaView className="flex-1 bg-[#02040f]" edges={['top']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LinearGradient colors={['#02040f', '#080f2a', '#11183d']} style={{ flex: 1 }}>
          <Animated.ScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingHorizontal: horizontalPadding,
              paddingBottom: Math.max(insets.bottom, 12) + 88,
              paddingTop: 12,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeInDown.duration(360)} className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-3xl font-bold text-white">Aura Match</Text>
                <Text className="mt-1 text-sm text-slate-300">Compare energies and discover compatibility</Text>
              </View>
              <Pressable
                onPress={() => setShowShareModal(true)}
                className="h-10 w-10 items-center justify-center rounded-full border border-violet-300/25 bg-violet-500/15"
              >
                <Ionicons name="share-social" size={16} color="#ddd6fe" />
              </Pressable>
            </Animated.View>

            <Animated.View style={heroParallaxStyle} className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0d1538] p-5">
              <View className="absolute -left-10 -top-12 h-32 w-32 rounded-full bg-violet-500/10" />
              <View className="absolute -right-12 top-8 h-36 w-36 rounded-full bg-pink-500/10" />

              <View className="items-center">
                <View className="flex-row items-center justify-center">
                  <Pressable
                    onPress={() => Alert.alert('Your Aura', `Latest aura color: ${selfAuraColor}`)}
                    className="items-center"
                  >
                    <Animated.View style={leftOrbStyle}>
                      <LinearGradient
                        colors={ownGradient}
                        className="h-28 w-28 items-center justify-center rounded-full border border-white/20"
                      >
                        <Text className="text-sm font-semibold text-white">You</Text>
                      </LinearGradient>
                    </Animated.View>
                    <Text className="mt-2 text-xs uppercase tracking-[1.5px] text-slate-300">{selfAuraColor}</Text>
                  </Pressable>

                  <View className="mx-5 h-0.5 w-12 bg-violet-300/35" />

                  <Pressable
                    onPress={() => {
                      setInputMode('manual');
                      setTimeout(() => inputRef.current?.focus(), 120);
                    }}
                    className="items-center"
                  >
                    <Animated.View style={rightOrbStyle}>
                      <LinearGradient
                        colors={['#334155', '#64748b']}
                        className="h-28 w-28 items-center justify-center rounded-full border border-white/20"
                      >
                        <Ionicons name="help" size={30} color="#e2e8f0" />
                      </LinearGradient>
                    </Animated.View>
                    <Text className="mt-2 text-xs uppercase tracking-[1.5px] text-slate-300">Friend</Text>
                  </Pressable>
                </View>

                <View className="mt-5 rounded-full border border-violet-300/25 bg-violet-500/15 px-3 py-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-violet-100">
                    {matchStreak > 0 ? `${matchStreak}-day match streak` : 'Your next connection awaits'}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {!isSubscribed && (
              <Animated.View entering={FadeInDown.delay(70).duration(360)} className="mb-5 overflow-hidden rounded-3xl border border-violet-300/20 bg-violet-500/10 p-4">
                <Text className="text-sm font-semibold text-violet-100">Free daily matches</Text>
                <Text className="mt-1 text-xs text-violet-100/80">
                  {freeRemaining > 0
                    ? `${freeRemaining}/${FREE_DAILY_MATCHES} free match available today`
                    : `No free matches left. Reset in ${formatCountdown(freeResetSeconds)}`}
                </Text>

                <View className="mt-3 h-2 overflow-hidden rounded-full bg-violet-950/70">
                  <LinearGradient
                    colors={['#7c3aed', '#a855f7']}
                    style={{ height: '100%', width: `${Math.max(4, (freeRemaining / FREE_DAILY_MATCHES) * 100)}%` }}
                  />
                </View>

                <View className="mt-3 flex-row gap-2">
                  <Pressable onPress={() => router.push('/(protected)/paywall')} className="flex-1 rounded-xl bg-violet-600 py-2.5 items-center">
                    <Text className="text-sm font-semibold text-white">Upgrade</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert('Ad slot', 'Rewarded ad option will unlock extra free matches in production build.')}
                    className="flex-1 rounded-xl border border-violet-300/20 bg-violet-500/10 py-2.5 items-center"
                  >
                    <Text className="text-sm font-semibold text-violet-100">Watch Ad</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {!isSubscribed && freeRemaining <= 0 && (
              <Animated.View entering={FadeInDown.delay(80).duration(360)} className="mb-5 overflow-hidden rounded-3xl border border-violet-300/20 bg-[#0e1432] p-4">
                <View className="absolute inset-0 bg-violet-500/10" />
                <Text className="text-base font-bold text-white">Unlock to Connect</Text>
                <Text className="mt-1 text-sm text-slate-300">Preview of premium result view:</Text>

                <View className="mt-3 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <Text className="text-sm font-semibold text-violet-100">Compatibility preview</Text>
                  <Text className="mt-1 text-2xl font-bold text-white">87%</Text>
                  <Text className="mt-1 text-xs text-slate-300">Energy synergy, emotional match, and advice breakdown.</Text>
                </View>

                <Pressable onPress={() => router.push('/(protected)/paywall')} className="mt-3 rounded-xl bg-violet-600 py-2.5 items-center">
                  <Text className="text-sm font-bold text-white">Unlock Premium</Text>
                </Pressable>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(120).duration(360)} className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0d1538] p-4">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Your Match ID</Text>
              <View className="mt-2 rounded-2xl border border-violet-300/25 bg-violet-500/10 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-white" style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    {ownShortId}
                  </Text>
                  <Pressable onPress={onCopyId} className="rounded-full p-1.5">
                    <Animated.View style={copyIconStyle}>
                      <Ionicons name={copiedId ? 'checkmark-circle' : 'copy-outline'} size={20} color={copiedId ? '#22c55e' : '#cbd5e1'} />
                    </Animated.View>
                  </Pressable>
                </View>
              </View>

              <View className="mt-3 flex-row gap-2">
                <Pressable onPress={() => setShowQrModal(true)} className="flex-1 rounded-xl border border-violet-300/20 bg-violet-500/10 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-violet-100">Show QR</Text>
                </Pressable>
                <Pressable onPress={onShareDefault} className="flex-1 rounded-xl border border-violet-300/20 bg-violet-500/10 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-violet-100">Share ID</Text>
                </Pressable>
                <Pressable onPress={onCopyLink} className="flex-1 rounded-xl border border-violet-300/20 bg-violet-500/10 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-violet-100">{copiedLink ? 'Copied' : 'Copy Link'}</Text>
                </Pressable>
              </View>
            </Animated.View>

            {!!recentFriends.length && (
              <Animated.View entering={FadeInDown.delay(180).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] p-4">
                <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Recent Friends</Text>
                <View className="mt-3 flex-row flex-wrap">
                  {recentFriends.map((id) => (
                    <Pressable
                      key={id}
                      onPress={() => onSelectRecentFriend(id)}
                      className="mb-2 mr-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-slate-200">{id.slice(0, 6)}...{id.slice(-4)}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(220).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] p-4">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Friend ID</Text>

              <View className="mt-3 flex-row rounded-xl border border-white/10 bg-white/10 p-1">
                <Pressable
                  onPress={() => setInputMode('scan')}
                  className={`flex-1 rounded-lg py-2 items-center ${inputMode === 'scan' ? 'bg-violet-500/20' : ''}`}
                >
                  <Text className={`text-xs font-semibold uppercase tracking-[1.5px] ${inputMode === 'scan' ? 'text-violet-100' : 'text-slate-400'}`}>Scan QR</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setInputMode('manual');
                    setTimeout(() => inputRef.current?.focus(), 80);
                  }}
                  className={`flex-1 rounded-lg py-2 items-center ${inputMode === 'manual' ? 'bg-violet-500/20' : ''}`}
                >
                  <Text className={`text-xs font-semibold uppercase tracking-[1.5px] ${inputMode === 'manual' ? 'text-violet-100' : 'text-slate-400'}`}>Enter ID</Text>
                </Pressable>
              </View>

              {inputMode === 'scan' ? (
                <View className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <Text className="text-sm font-semibold text-white">QR Scanner</Text>
                  <Text className="mt-1 text-xs text-slate-300">Use camera scanner or paste QR payload from clipboard.</Text>

                  <View className="mt-3 flex-row gap-2">
                    <Pressable onPress={onOpenScanner} className="flex-1 rounded-xl bg-violet-600 py-2.5 items-center">
                      <Text className="text-sm font-semibold text-white">Open Camera</Text>
                    </Pressable>
                    <Pressable onPress={onPaste} className="flex-1 rounded-xl border border-violet-300/25 bg-violet-500/10 py-2.5 items-center">
                      <Text className="text-sm font-semibold text-violet-100">Paste QR Payload</Text>
                    </Pressable>
                  </View>

                  <View className="mt-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2.5">
                    <Text className="text-xs text-slate-300">Flashlight</Text>
                    <Pressable
                      onPress={() => {
                        setScannerFlashEnabled((prev) => !prev);
                        hapticSelection();
                      }}
                      className={`rounded-full px-3 py-1 ${scannerFlashEnabled ? 'bg-violet-500/30' : 'bg-white/10'}`}
                    >
                      <Text className={`text-xs font-semibold ${scannerFlashEnabled ? 'text-violet-100' : 'text-slate-300'}`}>
                        {scannerFlashEnabled ? 'On' : 'Off'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="mt-4">
                  {clipboardSuggestion && !friendId && (
                    <Pressable
                      onPress={() => {
                        setFriendId(clipboardSuggestion);
                        setErrorType(null);
                        hapticSelection();
                      }}
                      className="mb-2 rounded-xl border border-violet-300/20 bg-violet-500/10 p-2.5"
                    >
                      <Text className="text-xs text-violet-100">Clipboard ID detected. Tap to paste.</Text>
                    </Pressable>
                  )}

                  <View className={`rounded-2xl border px-3 py-2.5 ${errorType === 'invalid' ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/10'}`}>
                    <TextInput
                      ref={inputRef}
                      value={friendId}
                      onChangeText={(text) => {
                        setFriendId(text.trim());
                        if (errorType) setErrorType(null);
                      }}
                      placeholder="Paste friend's UUID"
                      placeholderTextColor="#64748b"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="text-sm text-white"
                    />
                    <View className="mt-2 flex-row items-center justify-between">
                      <Text className="text-[11px] text-slate-400">{friendId.length}/36</Text>
                      <View className="flex-row items-center">
                        {canSubmitUuid ? (
                          <Ionicons name="checkmark-circle" size={15} color="#22c55e" />
                        ) : (
                          <Ionicons name="alert-circle-outline" size={15} color="#64748b" />
                        )}
                        <Pressable onPress={onPaste} className="ml-2 rounded-full p-1">
                          <Ionicons name="clipboard-outline" size={15} color="#cbd5e1" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <Animated.View style={matchButtonStyle} className="mt-4">
                <Pressable
                  onPress={onMatch}
                  disabled={isLoading || !friendId.trim()}
                  className={`rounded-2xl py-3.5 items-center ${isLoading || !friendId.trim() ? 'bg-slate-700/60' : 'bg-violet-600'}`}
                >
                  <Text className={`text-base font-bold ${isLoading || !friendId.trim() ? 'text-slate-400' : 'text-white'}`}>
                    Match Now
                  </Text>
                </Pressable>
              </Animated.View>
            </Animated.View>

            {errorType && (
              <Animated.View entering={FadeInUp.duration(300)} className="mb-5 rounded-2xl border border-red-300/25 bg-red-500/10 p-4">
                <Text className="text-sm font-semibold text-red-200">{errorDetails.title}</Text>
                <Text className="mt-1 text-xs leading-5 text-red-100/80">{errorDetails.description}</Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => setErrorType(null)}
                    className="flex-1 rounded-lg bg-red-500/20 py-2.5 items-center"
                  >
                    <Text className="text-xs font-semibold text-red-100">Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowFeedbackModal(true)}
                    className="flex-1 rounded-lg border border-red-300/20 py-2.5 items-center"
                  >
                    <Text className="text-xs font-semibold text-red-100">Get Help</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(300).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] p-4">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Match Analytics</Text>
              <View className="mt-3 flex-row gap-2">
                <View className="flex-1 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <Text className="text-[11px] uppercase tracking-[1.5px] text-slate-400">Average</Text>
                  <Text className="mt-1 text-xl font-bold text-white">{averageCompatibility}%</Text>
                </View>
                <View className="flex-1 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <Text className="text-[11px] uppercase tracking-[1.5px] text-slate-400">Best</Text>
                  <Text className="mt-1 text-xl font-bold text-white">{bestMatch ? `${bestMatch.compatibility_score}%` : '--'}</Text>
                </View>
                <View className="flex-1 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <Text className="text-[11px] uppercase tracking-[1.5px] text-slate-400">Active Day</Text>
                  <Text className="mt-1 text-sm font-bold text-white">{mostActiveDay}</Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(340).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] p-4">
              <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Past Matches</Text>
              {matches.length === 0 ? (
                <View className="mt-3 rounded-2xl border border-white/10 bg-white/10 p-4 items-center">
                  <Ionicons name="sparkles-outline" size={24} color="#a78bfa" />
                  <Text className="mt-2 text-sm font-semibold text-white">No matches yet</Text>
                  <Text className="mt-1 text-xs text-slate-400">Your next cosmic connection awaits.</Text>
                </View>
              ) : (
                <View className="mt-3">
                  {matches.slice(0, 6).map((item) => (
                    <HistoryItem key={item.id} item={item} onOpen={openResultFromHistory} onDelete={onDeleteMatchLocal} />
                  ))}
                </View>
              )}
            </Animated.View>

            {!!topLeaderboard.length && (
              <Animated.View entering={FadeInDown.delay(380).duration(360)} className="mb-5 rounded-3xl border border-white/10 bg-[#0d1538] p-4">
                <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-300">Top Matches This Week</Text>
                <View className="mt-3">
                  {topLeaderboard.map((entry) => (
                    <View key={`${entry.alias}-${entry.rank}`} className="mb-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-200">#{entry.rank} {entry.alias}</Text>
                      <Text className="text-sm font-semibold text-violet-100">{entry.score}%</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}
          </Animated.ScrollView>
        </LinearGradient>

        {isLoading && (
          <View className="absolute inset-0 bg-black/80 items-center justify-center px-8">
            <View className="mb-5 flex-row items-center">
              <LinearGradient colors={ownGradient} className="h-14 w-14 rounded-full" />
              <View className="mx-3 h-0.5 w-10 bg-violet-300/50" />
              <LinearGradient colors={['#334155', '#64748b']} className="h-14 w-14 rounded-full" />
            </View>
            <ActivityIndicator size="large" color="#a78bfa" />
            <Text className="mt-4 text-base font-semibold text-white">{LOADING_STEPS[loadingStepIndex]}</Text>
            <Text className="mt-2 text-xs text-slate-300">This may take a few seconds</Text>
          </View>
        )}

        <RNModal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
          <Pressable className="flex-1 items-center justify-center bg-black/70 px-6" onPress={() => setShowQrModal(false)}>
            <Pressable className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d1538] p-5" onPress={() => {}}>
              <Text className="text-xl font-bold text-white">Your Match QR</Text>
              <Text className="mt-1 text-xs text-slate-300">Scan in AuraSnap or open with deep link.</Text>

              <View className="mt-4 self-center rounded-2xl bg-white p-3">
                {qrMatrix.map((row, y) => (
                  <View key={`row-${y}`} style={{ flexDirection: 'row' }}>
                    {row.map((filled, x) => (
                      <View key={`cell-${y}-${x}`} style={{ width: 6, height: 6, backgroundColor: filled ? '#111827' : '#ffffff' }} />
                    ))}
                  </View>
                ))}
              </View>

              <Text className="mt-3 text-center text-xs text-slate-300" style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                {ownShortId}
              </Text>

              <Pressable onPress={onCopyLink} className="mt-4 rounded-xl bg-violet-600 py-2.5 items-center">
                <Text className="text-sm font-semibold text-white">Copy Deep Link</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </RNModal>

        <RNModal visible={showShareModal} transparent animationType="slide" onRequestClose={() => setShowShareModal(false)}>
          <Pressable className="flex-1 justify-end bg-black/60" onPress={() => setShowShareModal(false)}>
            <Pressable className="rounded-t-3xl border border-white/10 bg-[#0d1538] px-5 pb-8 pt-4" onPress={() => {}}>
              <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-white/20" />
              <Text className="mb-3 text-lg font-bold text-white">Share Your ID</Text>

              <ShareChannel icon="qr-code-outline" label="Show QR Code" onPress={() => { setShowShareModal(false); setShowQrModal(true); }} />
              <ShareChannel icon="logo-whatsapp" label="WhatsApp" onPress={() => onShareChannel('whatsapp')} />
              <ShareChannel icon="logo-instagram" label="Instagram Story" onPress={() => onShareChannel('instagram')} />
              <ShareChannel icon="logo-twitter" label="Twitter" onPress={() => onShareChannel('twitter')} />
              <ShareChannel icon="link-outline" label="Copy Link" onPress={onCopyLink} />
            </Pressable>
          </Pressable>
        </RNModal>

        <RNModal visible={showResultModal} transparent animationType="fade" onRequestClose={() => setShowResultModal(false)}>
          <View className="flex-1 bg-black/80 px-5 py-10">
            <LinearGradient colors={['#1b1f4b', '#311f62', '#451d66']} className="flex-1 rounded-3xl border border-white/10 p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold text-white">Compatibility Result</Text>
                <Pressable onPress={() => setShowResultModal(false)} className="rounded-full bg-white/10 p-2">
                  <Ionicons name="close" size={16} color="#e2e8f0" />
                </Pressable>
              </View>

              {selectedMatch && (
                <>
                  <View className="mt-4 flex-row items-center justify-center">
                    <View className="items-center">
                      <LinearGradient colors={getAuraGradient(selectedMatch.user_aura_color)} className="h-12 w-12 rounded-full" />
                      <Text className="mt-1 text-[11px] text-slate-300">You</Text>
                    </View>
                    <View className="mx-4 h-0.5 w-10 bg-white/20" />
                    <View className="items-center">
                      <LinearGradient colors={getAuraGradient(selectedMatch.friend_aura_color)} className="h-12 w-12 rounded-full" />
                      <Text className="mt-1 text-[11px] text-slate-300">Friend</Text>
                    </View>
                  </View>

                  <View className="mt-5 items-center">
                    <CompatibilityRing score={selectedMatch.compatibility_score} />
                  </View>

                  <View className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-3.5">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs text-slate-300">Energy Synergy</Text>
                      <Text className="text-xs font-semibold text-white">{breakdown.energy}%</Text>
                    </View>
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs text-slate-300">Emotional Match</Text>
                      <Text className="text-xs font-semibold text-white">{breakdown.emotional}%</Text>
                    </View>
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs text-slate-300">Mind Connection</Text>
                      <Text className="text-xs font-semibold text-white">{breakdown.mind}%</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-slate-300">Vibe Alignment</Text>
                      <Text className="text-xs font-semibold text-white">{breakdown.vibe}%</Text>
                    </View>
                  </View>

                  <View className="mt-4 rounded-2xl border border-violet-300/25 bg-violet-500/10 p-3.5">
                    <Text className="text-sm text-violet-100">{selectedMatch.synergy}</Text>
                    {!!selectedMatch.advice && <Text className="mt-2 text-xs text-violet-100/80">{selectedMatch.advice}</Text>}
                  </View>

                  {selectedMatch.compatibility_score >= 80 && (
                    <View className="mt-3 flex-row items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-500/10 py-2.5">
                      <Ionicons name="sparkles" size={14} color="#86efac" />
                      <Text className="ml-2 text-xs font-semibold text-emerald-100">High compatibility detected</Text>
                    </View>
                  )}

                  <View className="mt-auto flex-row gap-2 pt-4">
                    <Pressable onPress={onShareResult} className="flex-1 rounded-xl bg-violet-600 py-3 items-center">
                      <Text className="text-sm font-bold text-white">Share Result</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setShowResultModal(false);
                        fetchMatches();
                      }}
                      className="flex-1 rounded-xl border border-white/20 bg-white/10 py-3 items-center"
                    >
                      <Text className="text-sm font-semibold text-slate-100">Save</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </RNModal>

        <RNModal visible={showFeedbackModal} transparent animationType="fade" onRequestClose={() => setShowFeedbackModal(false)}>
          <Pressable className="flex-1 items-center justify-center bg-black/65 px-6" onPress={() => setShowFeedbackModal(false)}>
            <Pressable className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1538] p-5" onPress={() => {}}>
              <Text className="text-lg font-bold text-white">Need Help?</Text>
              <Text className="mt-2 text-sm text-slate-300">If matching keeps failing, send your ID and your friend's ID to support@aurasnap.app.</Text>
              <Pressable
                onPress={() => {
                  setShowFeedbackModal(false);
                  Linking.openURL('mailto:support@aurasnap.app');
                }}
                className="mt-4 rounded-xl bg-violet-600 py-2.5 items-center"
              >
                <Text className="text-sm font-semibold text-white">Contact Support</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </RNModal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

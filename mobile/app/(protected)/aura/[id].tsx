import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import api from '../../../lib/api';
import { hapticMedium, hapticSelection } from '../../../lib/haptics';
import { colorMap } from '../../../utils/constants';

interface AuraData {
  id: string;
  aura_color: string;
  secondary_color?: string;
  energy_level: number;
  mood_score: number;
  personality: string;
  strengths: string[];
  challenges: string[];
  daily_advice: string;
  analyzed_at: string;
  created_at: string;
}

type ColorTheme = {
  primary: string;
  secondary: string;
  glow: string;
  emoji: string;
};

const AURA_THEME: Record<string, ColorTheme> = {
  red: { primary: '#f43f5e', secondary: '#dc2626', glow: 'rgba(244,63,94,0.42)', emoji: '\u{1F525}' },
  orange: { primary: '#fb923c', secondary: '#ea580c', glow: 'rgba(251,146,60,0.4)', emoji: '\u{1F31E}' },
  yellow: { primary: '#facc15', secondary: '#ca8a04', glow: 'rgba(250,204,21,0.38)', emoji: '\u{2728}' },
  green: { primary: '#22c55e', secondary: '#15803d', glow: 'rgba(34,197,94,0.4)', emoji: '\u{1F33F}' },
  blue: { primary: '#3b82f6', secondary: '#1d4ed8', glow: 'rgba(59,130,246,0.4)', emoji: '\u{1F30A}' },
  indigo: { primary: '#6366f1', secondary: '#4338ca', glow: 'rgba(99,102,241,0.42)', emoji: '\u{1F31A}' },
  violet: { primary: '#8b5cf6', secondary: '#6d28d9', glow: 'rgba(139,92,246,0.42)', emoji: '\u{1F52E}' },
  pink: { primary: '#ec4899', secondary: '#be185d', glow: 'rgba(236,72,153,0.42)', emoji: '\u{1F495}' },
  turquoise: { primary: '#06b6d4', secondary: '#0891b2', glow: 'rgba(6,182,212,0.42)', emoji: '\u{1F30C}' },
  gold: { primary: '#f59e0b', secondary: '#b45309', glow: 'rgba(245,158,11,0.42)', emoji: '\u{1F451}' },
};

function normalizeLabel(value: string): string {
  if (!value) return 'Unknown';
  return value
    .split(' ')
    .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1).toLowerCase() : chunk))
    .join(' ');
}

function resolveTheme(colorName: string): ColorTheme {
  const raw = (colorName || '').trim().toLowerCase();
  const byMap = AURA_THEME[raw];
  if (byMap) return byMap;

  const fallback = colorMap[colorName as keyof typeof colorMap] || '#8b5cf6';
  return {
    primary: fallback,
    secondary: '#4338ca',
    glow: 'rgba(139,92,246,0.42)',
    emoji: '\u{2728}',
  };
}

function formatDate(dateLike: string): string {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function compact(text: string, max = 150): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function AuraResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;

  const [auraData, setAuraData] = useState<AuraData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const heroScale = useSharedValue(0.92);
  const heroOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: (1 - contentOpacity.value) * 22 }],
  }));

  useEffect(() => {
    let cancelled = false;

    const fetchAura = async () => {
      try {
        const { data } = await api.get(`/aura/${id}`);
        if (cancelled) return;
        setAuraData(data);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError('Could not load aura reading.');
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    };

    if (id) {
      fetchAura();
    } else {
      setError('Missing aura id.');
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!auraData) return;
    hapticMedium();
    heroOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    heroScale.value = withSpring(1, { damping: 15, stiffness: 130 });
    contentOpacity.value = withDelay(110, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
  }, [auraData, heroOpacity, heroScale, contentOpacity]);

  const theme = useMemo(() => resolveTheme(auraData?.aura_color || 'violet'), [auraData?.aura_color]);
  const auraTitle = normalizeLabel(auraData?.aura_color || 'Aura');

  const handleShare = async () => {
    if (!auraData) return;
    hapticSelection();
    try {
      await Share.share({
        message: `${theme.emoji} ${auraTitle} Aura\nEnergy: ${auraData.energy_level}%\nMood: ${auraData.mood_score}/10\n\n${compact(auraData.personality, 120)}\n\nMade with AuraSnap`,
      });
    } catch {
      // ignore share cancellation and system errors
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-[#050816] items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text className="mt-4 text-slate-300">Loading your aura…</Text>
      </SafeAreaView>
    );
  }

  if (error || !auraData) {
    return (
      <SafeAreaView className="flex-1 bg-[#050816] items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={46} color="#f87171" />
        <Text className="mt-4 text-center text-lg font-semibold text-white">
          {error || 'Something went wrong'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-full border border-white/20 bg-white/10 px-6 py-3"
        >
          <Text className="font-semibold text-white">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#050816]">
      <LinearGradient colors={['#050816', '#091132', '#11183d']} style={{ flex: 1 }}>
        <View className="absolute left-[-90] top-[-40] h-56 w-56 rounded-full bg-violet-500/14" />
        <View className="absolute right-[-80] top-40 h-64 w-64 rounded-full" style={{ backgroundColor: theme.glow }} />

        <View
          className="z-40 flex-row items-center justify-between pt-2"
          style={{ paddingHorizontal: horizontalPadding }}
        >
          <Pressable
            onPress={() => {
              hapticSelection();
              router.back();
            }}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10"
          >
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </Pressable>

          <Text className="text-base font-semibold text-white">Aura Analysis</Text>

          <Pressable
            onPress={handleShare}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10"
          >
            <Ionicons name="share-outline" size={20} color="#ffffff" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 140, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[heroAnimatedStyle, { marginHorizontal: horizontalPadding }]}>
            <LinearGradient
              colors={[theme.primary, theme.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="overflow-hidden rounded-3xl border border-white/20 p-5"
              style={{ shadowColor: theme.primary, shadowOpacity: 0.32, shadowRadius: 24, elevation: 7 }}
            >
              <View className="absolute right-[-30] top-[-24] h-28 w-28 rounded-full bg-white/15" />
              <View className="absolute left-[-26] bottom-[-20] h-24 w-24 rounded-full bg-black/10" />

              <View className="flex-row items-start justify-between">
                <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/80">
                  Share Snapshot
                </Text>
                <Text className="text-xs text-white/80">{formatDate(auraData.created_at || auraData.analyzed_at)}</Text>
              </View>

              <Text className="mt-2 text-[32px] font-extrabold text-white">
                {theme.emoji} {auraTitle}
              </Text>
              <Text className="-mt-1 text-white/90">Aura</Text>

              <Text className="mt-4 text-base leading-6 text-white/95" numberOfLines={3}>
                {auraData.personality}
              </Text>

              <View className="mt-5 flex-row">
                <View className="mr-2 rounded-full border border-white/20 bg-white/22 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-white">⚡ {auraData.energy_level}% Energy</Text>
                </View>
                <View className="rounded-full border border-white/20 bg-white/22 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-white">💗 {auraData.mood_score}/10 Mood</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[contentAnimatedStyle, { marginHorizontal: horizontalPadding }]}>
            <View className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View className="flex-row items-center">
                <Ionicons name="sparkles" size={18} color="#c4b5fd" />
                <Text className="ml-2 text-sm font-semibold text-violet-200">Personality Insight</Text>
              </View>
              <Text className="mt-3 text-sm leading-6 text-slate-200">{auraData.personality}</Text>
            </View>

            {auraData.strengths?.length > 0 && (
              <View className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <Text className="text-sm font-semibold text-emerald-200">Strengths</Text>
                <View className="mt-3 flex-row flex-wrap">
                  {auraData.strengths.map((item, index) => (
                    <View
                      key={`${item}-${index}`}
                      className="mb-2 mr-2 rounded-full border border-emerald-200/25 bg-emerald-500/15 px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-emerald-100">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {auraData.challenges?.length > 0 && (
              <View className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
                <Text className="text-sm font-semibold text-amber-200">Growth Areas</Text>
                <View className="mt-3 flex-row flex-wrap">
                  {auraData.challenges.map((item, index) => (
                    <View
                      key={`${item}-${index}`}
                      className="mb-2 mr-2 rounded-full border border-amber-200/25 bg-amber-500/15 px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-amber-100">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {auraData.daily_advice ? (
              <LinearGradient
                colors={['rgba(124,58,237,0.24)', 'rgba(99,102,241,0.2)']}
                className="mt-4 rounded-2xl border border-violet-300/20 p-4"
              >
                <View className="flex-row items-center">
                  <Ionicons name="bulb-outline" size={18} color="#ddd6fe" />
                  <Text className="ml-2 text-sm font-semibold text-violet-100">Daily Guidance</Text>
                </View>
                <Text className="mt-2 text-sm leading-6 text-slate-100/95">{auraData.daily_advice}</Text>
              </LinearGradient>
            ) : null}

            <View className="mt-6 gap-3">
              <Pressable onPress={handleShare}>
                <LinearGradient
                  colors={[theme.primary, theme.secondary]}
                  className="items-center rounded-2xl py-4"
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View className="flex-row items-center justify-center">
                    <Ionicons name="share-social-outline" size={20} color="#fff" />
                    <Text className="ml-2 text-base font-bold text-white">Share Result</Text>
                  </View>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => {
                  hapticSelection();
                  router.replace('/(protected)/home');
                }}
                className="items-center rounded-2xl border border-white/15 bg-white/10 py-4"
              >
                <Text className="text-base font-semibold text-white">Scan Again</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

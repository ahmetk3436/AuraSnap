import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  FadeInUp,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';

type Variant = 'A' | 'B' | 'C';

type SlidePoint = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
};

type Slide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  points: SlidePoint[];
  colors: [string, string, string];
  teaser?: string;
};

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const ONBOARDING_INDEX_KEY = 'onboarding_position';
const ONBOARDING_NAME_KEY = 'onboarding_display_name';
const ONBOARDING_REASON_KEY = 'onboarding_reason';
const ONBOARDING_VARIANT_KEY = 'onboarding_variant';

const WHY_OPTIONS = ['Find my vibe', 'Track mood patterns', 'Match with friends'];

function makeSlides(variant: Variant): Slide[] {
  const base: Slide[] = [
    {
      id: 'welcome',
      icon: 'sparkles',
      title: 'Your Aura Awaits',
      subtitle:
        variant === 'B'
          ? 'Feel your energy in one tap with a cinematic iOS-first experience.'
          : 'See what your energy reveals in one tap.',
      points: [
        {
          id: 'w1',
          icon: 'camera-outline',
          title: '1-tap scan',
          detail: 'Take a single photo and get instant aura analysis.',
        },
        {
          id: 'w2',
          icon: 'sparkles-outline',
          title: 'Instant AI read',
          detail: 'Energy and mood are generated in seconds.',
        },
        {
          id: 'w3',
          icon: 'share-social-outline',
          title: 'Share-ready cards',
          detail: 'Post beautiful result cards straight to social channels.',
        },
      ],
      colors: ['#4f46e5', '#7c3aed', '#ec4899'],
      teaser: 'Join 500,000+ aura explorers',
    },
    {
      id: 'scan',
      icon: 'camera',
      title: 'Scan Demo',
      subtitle: 'Try the camera effect now. We ask permission only when you are ready.',
      points: [
        {
          id: 's1',
          icon: 'flash-outline',
          title: 'Real-time glow',
          detail: 'Preview the scan glow before first capture.',
        },
        {
          id: 's2',
          icon: 'shield-checkmark-outline',
          title: 'Permission transparency',
          detail: 'Camera access is only used for your own aura photos.',
        },
        {
          id: 's3',
          icon: 'checkmark-done-outline',
          title: 'Fast output',
          detail: 'No setup friction; scan and continue instantly.',
        },
      ],
      colors: ['#4338ca', '#6366f1', '#a855f7'],
      teaser: '3,247 users scanning right now',
    },
    {
      id: 'history',
      icon: 'analytics',
      title: 'Track Your Pattern',
      subtitle: 'See your timeline, streaks, color distribution and weekly trends.',
      points: [
        {
          id: 'h1',
          icon: 'time-outline',
          title: 'Timeline history',
          detail: 'All readings are organized by day and week.',
        },
        {
          id: 'h2',
          icon: 'bar-chart-outline',
          title: 'Energy stats',
          detail: 'Follow average energy and mood shifts over time.',
        },
        {
          id: 'h3',
          icon: 'flame-outline',
          title: 'Streaks & badges',
          detail: 'Keep momentum with daily scan streaks and achievements.',
        },
      ],
      colors: ['#5b21b6', '#7c3aed', '#ec4899'],
    },
    {
      id: 'match',
      icon: 'people',
      title: 'Match With Friends',
      subtitle: 'Share your code, compare vibes, and unlock compatibility insights.',
      points: [
        {
          id: 'm1',
          icon: 'qr-code-outline',
          title: 'QR + ID share',
          detail: 'Send your aura ID instantly via link or QR.',
        },
        {
          id: 'm2',
          icon: 'git-compare-outline',
          title: 'Compatibility ring',
          detail: 'See energy, emotional, and vibe alignment scores.',
        },
        {
          id: 'm3',
          icon: 'trophy-outline',
          title: 'Match leaderboard',
          detail: 'Track your best matches and weekly highlights.',
        },
      ],
      colors: ['#0f766e', '#14b8a6', '#6366f1'],
    },
    {
      id: 'premium',
      icon: 'diamond',
      title: 'Free First. Upgrade Later.',
      subtitle:
        variant === 'C'
          ? 'Start fast with guest mode, then unlock premium controls when ready.'
          : 'Guest mode is instant. Premium unlocks unlimited scans and deep insights.',
      points: [
        {
          id: 'p1',
          icon: 'person-outline',
          title: 'Guest mode',
          detail: 'Start without account and keep momentum right away.',
        },
        {
          id: 'p2',
          icon: 'infinite-outline',
          title: 'Unlimited scans',
          detail: 'Premium removes daily limits and unlocks full history.',
        },
        {
          id: 'p3',
          icon: 'contrast-outline',
          title: 'Advanced themes',
          detail: 'Enable premium visual modes and OLED true black.',
        },
      ],
      colors: ['#312e81', '#4f46e5', '#7c3aed'],
    },
    {
      id: 'final',
      icon: 'rocket',
      title: 'You Are All Set',
      subtitle: 'Pick your intent and we will shape your first session.',
      points: [
        {
          id: 'f1',
          icon: 'sparkles-outline',
          title: 'Personalized start',
          detail: 'Your first scan tips adapt to what you want most.',
        },
        {
          id: 'f2',
          icon: 'medal-outline',
          title: 'Badge preview',
          detail: 'Unlock progress badges as you scan daily.',
        },
        {
          id: 'f3',
          icon: 'arrow-forward-circle-outline',
          title: 'Quick launch',
          detail: 'Go straight to scan in one tap.',
        },
      ],
      colors: ['#7c3aed', '#a855f7', '#ec4899'],
    },
  ];

  if (variant === 'C') {
    return [
      ...base.slice(0, 4),
      {
        id: 'community',
        icon: 'people-circle',
        title: 'Community Energy',
        subtitle: 'Discover trends, streaks, and shared aura moments.',
        points: [
          {
            id: 'c1',
            icon: 'trending-up-outline',
            title: 'Live trends',
            detail: 'See what colors are rising this week.',
          },
          {
            id: 'c2',
            icon: 'chatbubble-ellipses-outline',
            title: 'Social-friendly',
            detail: 'Share results optimized for stories and chats.',
          },
          {
            id: 'c3',
            icon: 'gift-outline',
            title: 'Invite perks',
            detail: 'Invite friends and unlock additional boosts.',
          },
        ],
        colors: ['#1d4ed8', '#3b82f6', '#22d3ee'],
      },
      ...base.slice(4),
    ];
  }

  return base;
}

function ProgressDot({
  idx,
  width,
  scrollX,
}: {
  idx: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  const dotStyle = useAnimatedStyle(() => {
    const inputRange = [(idx - 1) * width, idx * width, (idx + 1) * width];
    const scale = interpolate(scrollX.value, inputRange, [1, 1.35, 1], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.4, 1, 0.4], Extrapolation.CLAMP);
    const dotWidth = interpolate(scrollX.value, inputRange, [8, 30, 8], Extrapolation.CLAMP);

    return {
      width: dotWidth,
      transform: [{ scale }],
      opacity,
    };
  });

  return <Animated.View style={[dotStyle]} className="mx-1 h-2 rounded-full bg-violet-300" />;
}

function OnboardingSlide({
  slide,
  width,
  isActive,
  showSwipeHint,
  liveCounter,
  selectedReason,
  onSelectReason,
  displayName,
  onChangeName,
  onTryDemo,
  onRequestCamera,
  cameraStatus,
  onQuickStart,
  onCustomize,
}: {
  slide: Slide;
  width: number;
  isActive: boolean;
  showSwipeHint: boolean;
  liveCounter: number;
  selectedReason: string;
  onSelectReason: (value: string) => void;
  displayName: string;
  onChangeName: (value: string) => void;
  onTryDemo: () => void;
  onRequestCamera: () => void;
  cameraStatus: 'unknown' | 'granted' | 'denied';
  onQuickStart: () => void;
  onCustomize: () => void;
}) {
  const iconScale = useSharedValue(1);
  const iconGlow = useSharedValue(0.45);
  const cardScale = useSharedValue(1);
  const swipeHintX = useSharedValue(-8);

  const [expandedPointId, setExpandedPointId] = useState<string | null>(null);

  useEffect(() => {
    iconScale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1200 }), withTiming(1, { duration: 1200 })),
      -1,
      true
    );
    iconGlow.value = withRepeat(
      withSequence(withTiming(0.75, { duration: 1100 }), withTiming(0.4, { duration: 1100 })),
      -1,
      true
    );
  }, [iconGlow, iconScale]);

  useEffect(() => {
    if (!showSwipeHint) return;
    swipeHintX.value = withRepeat(
      withSequence(withTiming(10, { duration: 650 }), withTiming(-8, { duration: 650 })),
      -1,
      true
    );
  }, [showSwipeHint, swipeHintX]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconGlow.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const swipeHintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeHintX.value }],
  }));

  const gradientColors: [string, string] = [slide.colors[0], slide.colors[1]];

  return (
    <View style={{ width }} className="px-5 pb-6 pt-3">
      <Animated.View entering={FadeInDown.duration(420)} className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <View className="items-center">
          <View className="relative mb-5">
            <Animated.View style={iconStyle} className="absolute inset-[-12px] rounded-3xl bg-violet-400/20" />
            <LinearGradient
              colors={gradientColors}
              className="h-24 w-24 items-center justify-center rounded-3xl border border-white/20"
            >
              <Ionicons name={slide.icon} size={40} color="#ffffff" />
            </LinearGradient>
          </View>

          <Animated.Text entering={FadeInDown.delay(80).duration(360)} className="text-center text-3xl font-bold text-white">
            {slide.title}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(140).duration(340)} className="mt-3 text-center text-base leading-6 text-slate-300">
            {slide.subtitle}
          </Animated.Text>

          {!!slide.teaser && (
            <Animated.View entering={FadeInDown.delay(180).duration(340)} className="mt-4 rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1.5">
              <Text className="text-xs font-semibold text-violet-100">{slide.teaser}</Text>
            </Animated.View>
          )}

          {slide.id === 'scan' && (
            <Animated.View entering={FadeInDown.delay(220).duration(340)} className="mt-4 w-full rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
              <Pressable
                onPress={onTryDemo}
                className="items-center rounded-xl bg-violet-600 py-2.5"
              >
                <Text className="text-sm font-semibold text-white">Try camera demo</Text>
              </Pressable>

              <View className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-slate-300">Camera Permission</Text>
                <Text className="mt-1 text-xs text-slate-300">
                  {cameraStatus === 'granted'
                    ? 'Camera access enabled.'
                    : cameraStatus === 'denied'
                    ? 'Camera denied. You can enable it in iOS Settings.'
                    : 'We only use camera for your aura scans.'}
                </Text>
                <Pressable onPress={onRequestCamera} className="mt-2 rounded-lg border border-violet-300/20 bg-violet-500/10 py-2 items-center">
                  <Text className="text-xs font-semibold text-violet-100">
                    {cameraStatus === 'granted' ? 'Permission Ready' : 'Enable Camera'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInUp.delay(260).duration(360)}
            style={cardStyle}
            className="mt-5 w-full rounded-2xl border border-white/10 bg-white/10 p-4"
          >
            {slide.points.map((point, idx) => (
              <Animated.View key={point.id} entering={FadeInDown.delay(320 + idx * 90).duration(320)} className="mb-2.5">
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setExpandedPointId((prev) => (prev === point.id ? null : point.id));
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <View className="flex-row items-center">
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-violet-500/20">
                      <Ionicons name={point.icon} size={14} color="#ddd6fe" />
                    </View>
                    <Text className="ml-2.5 flex-1 text-sm font-semibold text-white">{point.title}</Text>
                    <Ionicons
                      name={expandedPointId === point.id ? 'chevron-up' : 'chevron-down'}
                      size={15}
                      color="#94a3b8"
                    />
                  </View>
                  {expandedPointId === point.id && <Text className="mt-2 text-xs leading-5 text-slate-300">{point.detail}</Text>}
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>

          {showSwipeHint && (
            <Animated.View entering={FadeInDown.delay(500).duration(320)} style={swipeHintStyle} className="mt-4 flex-row items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <Ionicons name="hand-left-outline" size={14} color="#cbd5e1" />
              <Text className="ml-2 text-xs font-semibold text-slate-200">Swipe to explore</Text>
            </Animated.View>
          )}

          {slide.id === 'final' && (
            <Animated.View entering={FadeInUp.delay(420).duration(360)} className="mt-5 w-full">
              <View className="mb-3 flex-row items-center justify-center">
                <Text className="text-sm font-semibold text-violet-100">{liveCounter.toLocaleString()} explorers onboarded today</Text>
              </View>

              <View className="rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-violet-200">What should we call you?</Text>
                <TextInput
                  value={displayName}
                  onChangeText={onChangeName}
                  placeholder="Enter your name"
                  placeholderTextColor="#94a3b8"
                  className="mt-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white"
                />

                <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px] text-violet-200">What brings you here?</Text>
                <View className="mt-2 flex-row flex-wrap">
                  {WHY_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => onSelectReason(option)}
                      className={`mr-2 mb-2 rounded-full border px-3 py-1.5 ${
                        selectedReason === option ? 'border-violet-300/35 bg-violet-500/25' : 'border-white/10 bg-white/6'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${selectedReason === option ? 'text-violet-100' : 'text-slate-300'}`}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="mt-3 flex-row gap-2">
                <Pressable onPress={onQuickStart} className="flex-1 rounded-xl bg-violet-600 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-white">Quick Start</Text>
                </Pressable>
                <Pressable onPress={onCustomize} className="flex-1 rounded-xl border border-white/15 bg-white/10 py-2.5 items-center">
                  <Text className="text-sm font-semibold text-slate-200">Customize</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<any>(null);

  const { continueAsGuest, isGuest, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [variant, setVariant] = useState<Variant>('A');
  const slides = useMemo(() => makeSlides(variant), [variant]);
  const [index, setIndex] = useState(0);

  const [displayName, setDisplayName] = useState('');
  const [selectedReason, setSelectedReason] = useState(WHY_OPTIONS[0]);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [liveCounter, setLiveCounter] = useState(3247);

  const scrollX = useSharedValue(0);
  const ctaPulse = useSharedValue(1);
  const ctaShimmer = useSharedValue(-180);

  const isLast = index === slides.length - 1;
  const ctaLabel = useMemo(() => {
    if (!isLast) return 'Continue';
    if (displayName.trim().length > 0) return `Let's Go, ${displayName.trim()}!`;
    return 'Start Your Journey';
  }, [displayName, isLast]);

  const inputRange = useMemo(() => slides.map((_, idx) => idx * width), [slides, width]);
  const topColors = useMemo(() => slides.map((slide) => slide.colors[0]), [slides]);
  const midColors = useMemo(() => slides.map((slide) => slide.colors[1]), [slides]);
  const bottomColors = useMemo(() => slides.map((slide) => slide.colors[2]), [slides]);

  useEffect(() => {
    ctaPulse.value = withRepeat(
      withSequence(withTiming(1.02, { duration: 850 }), withTiming(1, { duration: 850 })),
      -1,
      true
    );
    ctaShimmer.value = withRepeat(withTiming(360, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [ctaPulse, ctaShimmer]);

  useEffect(() => {
    const counterTimer = setInterval(() => {
      setLiveCounter((prev) => prev + Math.floor(Math.random() * 4));
    }, 3200);
    return () => clearInterval(counterTimer);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const existing = await AsyncStorage.getItem(ONBOARDING_VARIANT_KEY);
      let resolved: Variant;
      if (existing === 'A' || existing === 'B' || existing === 'C') {
        resolved = existing;
      } else {
        const variants: Variant[] = ['A', 'B', 'C'];
        resolved = variants[Math.floor(Math.random() * variants.length)];
        await AsyncStorage.setItem(ONBOARDING_VARIANT_KEY, resolved);
      }
      setVariant(resolved);

      const savedName = await AsyncStorage.getItem(ONBOARDING_NAME_KEY);
      if (savedName) setDisplayName(savedName);

      const savedReason = await AsyncStorage.getItem(ONBOARDING_REASON_KEY);
      if (savedReason) setSelectedReason(savedReason);

      const savedIndexRaw = await AsyncStorage.getItem(ONBOARDING_INDEX_KEY);
      const savedIndex = Number(savedIndexRaw || 0);
      if (Number.isFinite(savedIndex) && savedIndex > 0) {
        setIndex(savedIndex);
        setTimeout(() => {
          scrollRef.current?.scrollTo?.({ x: savedIndex * width, animated: false });
        }, 60);
      }

      const permission = await ImagePicker.getCameraPermissionsAsync();
      if (permission.granted) {
        setCameraStatus('granted');
      } else if (permission.canAskAgain === false) {
        setCameraStatus('denied');
      } else {
        setCameraStatus('unknown');
      }
    };

    bootstrap();
  }, [width]);

  useEffect(() => {
    AsyncStorage.setItem(ONBOARDING_INDEX_KEY, String(index));
  }, [index]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (isGuest) {
      router.replace('/(auth)/register');
      return;
    }
    if (isAuthenticated) {
      router.replace('/(protected)/home');
    }
  }, [isAuthLoading, isAuthenticated, isGuest, router]);

  const backgroundTopStyle = useAnimatedStyle(() => {
    if (inputRange.length < 2) {
      return { backgroundColor: topColors[0] || '#050816' };
    }
    return {
      backgroundColor: interpolateColor(scrollX.value, inputRange, topColors as string[]) as string,
    };
  });

  const backgroundMidStyle = useAnimatedStyle(() => {
    if (inputRange.length < 2) {
      return { backgroundColor: midColors[0] || '#0b122f' };
    }
    return {
      backgroundColor: interpolateColor(scrollX.value, inputRange, midColors as string[]) as string,
    };
  });

  const backgroundBottomStyle = useAnimatedStyle(() => {
    if (inputRange.length < 2) {
      return { backgroundColor: bottomColors[0] || '#101a42' };
    }
    return {
      backgroundColor: interpolateColor(scrollX.value, inputRange, bottomColors as string[]) as string,
    };
  });

  const orbLeftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value * 0.08 }, { translateY: -scrollX.value * 0.02 }],
  }));

  const orbRightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scrollX.value * 0.1 }, { translateY: scrollX.value * 0.03 }],
  }));

  const progressStyle = useAnimatedStyle(() => {
    const target = ((index + 1) / Math.max(1, slides.length)) * 100;
    return {
      width: `${Math.max(6, target)}%`,
    };
  }, [index, slides.length]);

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaPulse.value }],
  }));

  const ctaShimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ctaShimmer.value }],
  }));

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.multiSet([
      [ONBOARDING_COMPLETE_KEY, 'true'],
      [ONBOARDING_NAME_KEY, displayName.trim()],
      [ONBOARDING_REASON_KEY, selectedReason],
    ]);
    await AsyncStorage.removeItem(ONBOARDING_INDEX_KEY);
  }, [displayName, selectedReason]);

  const handleGuestStart = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await completeOnboarding();
    await continueAsGuest();
    router.replace('/(protected)/home');
  }, [completeOnboarding, continueAsGuest, router]);

  const handleSignIn = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await completeOnboarding();
    router.replace('/(auth)/login');
  }, [completeOnboarding, router]);

  const handleCustomize = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await completeOnboarding();
    router.replace('/(auth)/register');
  }, [completeOnboarding, router]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isLast) {
      handleGuestStart();
      return;
    }

    scrollRef.current?.scrollTo?.({ x: (index + 1) * width, animated: true });
  }, [handleGuestStart, index, isLast, width]);

  const handleTryDemo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Scan Demo', 'Aura camera demo animation triggered. Ready for real scan on Home.');
  }, []);

  const handleRequestCamera = useCallback(async () => {
    if (cameraStatus === 'granted') {
      Haptics.selectionAsync();
      return;
    }

    Alert.alert('Camera Access', 'We need camera permission to scan your aura photos.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (permission.granted) {
            setCameraStatus('granted');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            setCameraStatus(permission.canAskAgain ? 'unknown' : 'denied');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        },
      },
    ]);
  }, [cameraStatus]);

  const horizontalPadding = width < 380 ? 16 : width > 430 ? 24 : 20;

  return (
    <SafeAreaView className="flex-1 bg-[#050816]">
      <View className="flex-1">
        <Animated.View style={[{ position: 'absolute', inset: 0 }, backgroundTopStyle]} />
        <Animated.View style={[{ position: 'absolute', inset: 0, opacity: 0.65 }, backgroundMidStyle]} />
        <Animated.View style={[{ position: 'absolute', inset: 0, opacity: 0.45 }, backgroundBottomStyle]} />
        <LinearGradient
          colors={['rgba(2,5,18,0.78)', 'rgba(3,7,25,0.86)', 'rgba(4,10,30,0.92)']}
          style={{ position: 'absolute', inset: 0 }}
        />

        <Animated.View style={[orbLeftStyle, { position: 'absolute', left: -90, top: -64 }]} className="h-64 w-64 rounded-full bg-violet-500/20" />
        <Animated.View style={[orbRightStyle, { position: 'absolute', right: -100, top: 180 }]} className="h-72 w-72 rounded-full bg-indigo-500/20" />

        <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 6 }} className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-violet-100">AuraSnap</Text>
            <Text className="text-[11px] text-slate-300">Variant {variant}</Text>
          </View>

          <Pressable onPress={() => setShowSkipModal(true)} className="rounded-full border border-white/15 px-3 py-1.5">
            <Text className="text-xs font-semibold text-white/85">Sign In</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: horizontalPadding }} className="mt-3">
          <View className="h-2 overflow-hidden rounded-full bg-white/10">
            <Animated.View style={[{ height: '100%' }, progressStyle]}>
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={{ flex: 1 }} />
            </Animated.View>
          </View>
          <Text className="mt-1.5 text-right text-[11px] text-slate-300">
            Step {index + 1} of {slides.length}
          </Text>
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width);
            setIndex(next);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 10 }}
        >
          {slides.map((slide, idx) => (
            <OnboardingSlide
              key={slide.id}
              slide={slide}
              width={width}
              isActive={index === idx}
              showSwipeHint={idx === 0 && index === 0}
              liveCounter={liveCounter}
              selectedReason={selectedReason}
              onSelectReason={setSelectedReason}
              displayName={displayName}
              onChangeName={setDisplayName}
              onTryDemo={handleTryDemo}
              onRequestCamera={handleRequestCamera}
              cameraStatus={cameraStatus}
              onQuickStart={handleGuestStart}
              onCustomize={handleCustomize}
            />
          ))}
        </Animated.ScrollView>

        <View style={{ paddingHorizontal: horizontalPadding, paddingBottom: Math.max(insets.bottom, 10) + 12 }}>
          <View className="mb-4 flex-row items-center justify-center">
            {slides.map((slide, idx) => (
              <ProgressDot key={slide.id} idx={idx} width={width} scrollX={scrollX} />
            ))}
          </View>

          <Animated.View style={ctaStyle}>
            <Pressable onPress={handleContinue} className="overflow-hidden rounded-2xl">
              <LinearGradient colors={['#6366f1', '#7c3aed', '#ec4899']} className="items-center py-4" start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text className="text-base font-bold text-white">{ctaLabel}</Text>
              </LinearGradient>

              <Animated.View
                pointerEvents="none"
                style={[ctaShimmerStyle, { position: 'absolute', top: 0, bottom: 0, width: 100 }]}
              >
                <LinearGradient colors={['transparent', 'rgba(255,255,255,0.24)', 'transparent']} style={{ flex: 1 }} />
              </Animated.View>
            </Pressable>
          </Animated.View>

          <Pressable onPress={() => setShowSkipModal(true)} className="mt-3 items-center rounded-2xl border border-white/15 py-3.5">
            <Text className="text-sm font-semibold text-slate-300">Sign In</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={showSkipModal} transparent animationType="fade" onRequestClose={() => setShowSkipModal(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/65 px-6" onPress={() => setShowSkipModal(false)}>
          <Pressable className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1538] p-5" onPress={() => {}}>
            <Text className="text-lg font-bold text-white">Continue later?</Text>
            <Text className="mt-2 text-sm text-slate-300">
              You can finish onboarding anytime. Continue to sign in now or stay here.
            </Text>
            <View className="mt-4 flex-row gap-2">
              <Pressable onPress={() => setShowSkipModal(false)} className="flex-1 rounded-xl border border-white/15 bg-white/10 py-2.5 items-center">
                <Text className="text-sm font-semibold text-slate-200">Stay</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowSkipModal(false);
                  handleSignIn();
                }}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 items-center"
              >
                <Text className="text-sm font-semibold text-white">Continue</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

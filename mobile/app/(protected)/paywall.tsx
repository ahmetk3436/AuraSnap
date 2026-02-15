import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Purchases from 'react-native-purchases';

const TERMS_URL = 'https://aurasnap.app/terms';
const PRIVACY_URL = 'https://aurasnap.app/privacy';

// ============================================================================
// FEATURE DATA
// ============================================================================

const features = [
  {
    title: 'Unlimited Aura Scans',
    description: 'Scan as many times as you want',
    icon: 'sparkles' as const,
    iconColor: '#8b5cf6',
    gradient: ['#8b5cf6', '#a78bfa'],
  },
  {
    title: 'AI Compatibility Match',
    description: 'Deep connection analysis with friends',
    icon: 'people' as const,
    iconColor: '#ec4899',
    gradient: ['#ec4899', '#f472b6'],
  },
  {
    title: 'Complete Scan History',
    description: 'Never lose your aura journey',
    icon: 'time' as const,
    iconColor: '#22c55e',
    gradient: ['#22c55e', '#4ade80'],
  },
  {
    title: 'Exclusive Aura Colors',
    description: 'Unlock rare and unique auras',
    icon: 'color-palette' as const,
    iconColor: '#f59e0b',
    gradient: ['#f59e0b', '#fbbf24'],
  },
  {
    title: 'Ad-Free Experience',
    description: 'Pure, uninterrupted vibes',
    icon: 'eye-off' as const,
    iconColor: '#3b82f6',
    gradient: ['#3b82f6', '#60a5fa'],
  },
  {
    title: 'Priority AI Analysis',
    description: 'Faster results, deeper insights',
    icon: 'flash' as const,
    iconColor: '#f97316',
    gradient: ['#f97316', '#fb923c'],
  },
];

const trustBadges = [
  { icon: 'shield-checkmark' as const, text: 'Secure Payment' },
  { icon: 'refresh' as const, text: 'Cancel Anytime' },
  { icon: 'medal' as const, text: '7-Day Free Trial' },
];

// ============================================================================
// ANIMATED COMPONENTS
// ============================================================================

// Floating Orb Animation
const AnimatedOrb: React.FC = () => {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.3);
  const rotation = useSharedValue(0);

  useEffect(() => {
    // Breathing animation
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Glow pulse
    glow.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500 }),
        withTiming(0.3, { duration: 1500 })
      ),
      -1,
      true
    );

    // Slow rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: scale.value * 1.3 }],
  }));

  return (
    <View className="items-center justify-center">
      {/* Outer glow rings */}
      <Animated.View
        style={glowStyle}
        className="absolute w-40 h-40 rounded-full bg-violet-500/20"
      />
      <Animated.View
        style={glowStyle}
        className="absolute w-32 h-32 rounded-full bg-pink-500/30"
      />

      {/* Main orb */}
      <Animated.View style={orbStyle}>
        <LinearGradient
          colors={['#7c3aed', '#ec4899', '#f472b6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="w-28 h-28 rounded-full items-center justify-center"
          style={{
            shadowColor: '#7c3aed',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
          }}
        >
          <View className="w-20 h-20 rounded-full bg-white/10 items-center justify-center">
            <Ionicons name="infinite" size={36} color="white" />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <Animated.View
          key={i}
          entering={FadeInUp.delay(500 + i * 100).duration(1000)}
          className="absolute"
          style={{
            transform: [
              { translateY: -80 - i * 15 },
              { translateX: (i % 2 === 0 ? -1 : 1) * (20 + i * 8) },
            ],
          }}
        >
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: i % 2 === 0 ? '#8b5cf6' : '#ec4899' }}
          />
        </Animated.View>
      ))}
    </View>
  );
};

// Pulsing Button
const PulsingButton: React.FC<{
  onPress: () => void;
  isLoading: boolean;
  text: string;
}> = ({ onPress, isLoading, text }) => {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glow.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1000 }),
        withTiming(0.4, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <Pressable onPress={onPress} disabled={isLoading} className="relative">
      {/* Glow effect */}
      <Animated.View
        style={glowStyle}
        className="absolute inset-0 rounded-full bg-violet-500/30"
      />

      <Animated.View style={buttonStyle}>
        <LinearGradient
          colors={['#7c3aed', '#a855f7', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-full py-4 px-8 items-center justify-center overflow-hidden"
          style={{
            shadowColor: '#7c3aed',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
          }}
        >
          {/* Shimmer overlay */}
          <View
            className="absolute inset-0"
            style={{
              backgroundColor: 'transparent',
            }}
          />

          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg tracking-wide">
              {text}
            </Text>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
};

// Feature Card
const FeatureCard: React.FC<{
  feature: (typeof features)[0];
  index: number;
}> = ({ feature, index }) => {
  return (
    <Animated.View
      entering={FadeInDown.delay(200 + index * 80)
        .springify()
        .damping(15)}
      className="mx-5 my-1.5"
    >
      <View
        className="flex-row items-center rounded-2xl p-4 border border-white/5"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
        }}
      >
        {/* Icon container */}
        <LinearGradient
          colors={feature.gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="w-12 h-12 rounded-xl items-center justify-center mr-4"
          style={{
            shadowColor: feature.iconColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
          }}
        >
          <Ionicons name={feature.icon} size={22} color="white" />
        </LinearGradient>

        {/* Text content */}
        <View className="flex-1">
          <Text className="text-white font-semibold text-base">{feature.title}</Text>
          <Text className="text-gray-500 text-xs mt-0.5">{feature.description}</Text>
        </View>

        {/* Check mark */}
        <View className="w-6 h-6 rounded-full bg-green-500/20 items-center justify-center">
          <Ionicons name="checkmark" size={14} color="#22c55e" />
        </View>
      </View>
    </Animated.View>
  );
};

// Trust Badge
const TrustBadge: React.FC<{
  badge: (typeof trustBadges)[0];
  index: number;
}> = ({ badge, index }) => {
  return (
    <Animated.View
      entering={FadeInUp.delay(800 + index * 100).duration(400)}
      className="flex-1 items-center"
    >
      <View className="w-10 h-10 rounded-full bg-gray-800/60 items-center justify-center mb-2">
        <Ionicons name={badge.icon} size={18} color="#9ca3af" />
      </View>
      <Text className="text-gray-400 text-[10px] font-medium text-center">
        {badge.text}
      </Text>
    </Animated.View>
  );
};

// Countdown Timer
const CountdownTimer: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState({ hours: 23, minutes: 59, seconds: 59 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatNumber = (num: number) => String(num).padStart(2, '0');

  return (
    <Animated.View
      entering={FadeInDown.delay(400).duration(500)}
      className="mx-5 mt-4 mb-2"
    >
      <View className="flex-row items-center justify-center bg-amber-500/10 rounded-xl py-3 px-4 border border-amber-500/20">
        <Ionicons name="timer" size={16} color="#fbbf24" />
        <Text className="text-amber-300 text-sm font-medium ml-2">
          Limited offer ends in{' '}
        </Text>
        <View className="flex-row">
          <View className="bg-amber-500/20 rounded px-1.5 py-0.5 ml-1">
            <Text className="text-amber-200 font-bold text-sm">
              {formatNumber(timeLeft.hours)}
            </Text>
          </View>
          <Text className="text-amber-300 mx-0.5">:</Text>
          <View className="bg-amber-500/20 rounded px-1.5 py-0.5">
            <Text className="text-amber-200 font-bold text-sm">
              {formatNumber(timeLeft.minutes)}
            </Text>
          </View>
          <Text className="text-amber-300 mx-0.5">:</Text>
          <View className="bg-amber-500/20 rounded px-1.5 py-0.5">
            <Text className="text-amber-200 font-bold text-sm">
              {formatNumber(timeLeft.seconds)}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

// Social Proof
const SocialProof: React.FC = () => {
  const [count, setCount] = useState(12847);

  useEffect(() => {
    // Simulate live updates
    const interval = setInterval(() => {
      setCount((prev) => prev + Math.floor(Math.random() * 3));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Animated.View
      entering={FadeInDown.delay(600).duration(500)}
      className="mx-5 my-3"
    >
      <View className="flex-row items-center justify-center bg-green-500/10 rounded-xl py-2.5 px-4 border border-green-500/20">
        <View className="flex-row -space-x-2 mr-2">
          {['🟣', '🔵', '🟢', '🟡'].map((emoji, i) => (
            <View key={i} className="w-6 h-6 rounded-full bg-gray-700 items-center justify-center border-2 border-gray-900">
              <Text className="text-xs">{emoji}</Text>
            </View>
          ))}
        </View>
        <Text className="text-green-300 text-sm">
          <Text className="font-bold">{count.toLocaleString()}</Text> users upgraded today
        </Text>
        <View className="w-2 h-2 rounded-full bg-green-400 ml-2" />
      </View>
    </Animated.View>
  );
};

// Package Card
const PackageCard: React.FC<{
  pkg: any;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ pkg, isSelected, onSelect }) => {
  const scale = useSharedValue(1);
  const shimmerX = useSharedValue(-180);

  useEffect(() => {
    if (isSelected) {
      shimmerX.value = withRepeat(
        withTiming(260, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        false
      );
      return;
    }
    shimmerX.value = -180;
  }, [isSelected, shimmerX]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withSpring(0.98, { damping: 15 }),
      withSpring(1, { damping: 15 })
    );
    onSelect();
  };

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const isAnnual = pkg.packageType === 'ANNUAL';
  const isMonthly = pkg.packageType === 'MONTHLY';

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPress={handlePress}
        className={`mx-5 my-2 rounded-2xl p-5 relative overflow-hidden ${
          isSelected
            ? 'bg-violet-500/15'
            : 'bg-gray-900/80'
        }`}
        style={{
          borderWidth: 2,
          borderColor: isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
        }}
      >
        {/* Shimmer border for selected */}
        {isSelected && (
          <View
            className="absolute inset-0 rounded-2xl"
            style={{
              borderWidth: 1,
              borderColor: 'rgba(139, 92, 246, 0.5)',
              shadowColor: '#8b5cf6',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[shimmerStyle, { position: 'absolute', top: 0, bottom: 0, width: 90 }]}
            >
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.25)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>
        )}

        {/* Popular badge */}
        {isMonthly && (
          <View className="absolute -top-0.5 -right-0.5 overflow-hidden rounded-bl-xl rounded-tr-2xl">
            <LinearGradient
              colors={['#8b5cf6', '#a855f7']}
              className="px-3 py-1"
            >
              <Text className="text-[10px] font-bold text-white tracking-wide">
                MOST POPULAR
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Best value badge */}
        {isAnnual && (
          <View className="absolute -top-0.5 -right-0.5 overflow-hidden rounded-bl-xl rounded-tr-2xl">
            <LinearGradient
              colors={['#22c55e', '#16a34a']}
              className="px-3 py-1"
            >
              <Text className="text-[10px] font-bold text-white tracking-wide">
                BEST VALUE
              </Text>
            </LinearGradient>
          </View>
        )}

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-white text-lg font-bold">
              {pkg.product.title}
            </Text>
            <Text className="text-gray-400 text-sm mt-0.5">
              {pkg.product.description}
            </Text>
          </View>

          <View className="items-end">
            <Text className="text-white text-2xl font-bold">
              {pkg.product.priceString}
            </Text>
            {isMonthly && (
              <Text className="text-violet-400 text-xs font-medium mt-0.5">
                per month
              </Text>
            )}
            {isAnnual && (
              <View className="flex-row items-center mt-0.5">
                <Ionicons name="arrow-down" size={12} color="#22c55e" />
                <Text className="text-green-400 text-xs font-bold ml-0.5">
                  Save 33%
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Check indicator */}
        {isSelected && (
          <View className="absolute top-4 left-4">
            <View className="w-5 h-5 rounded-full bg-violet-500 items-center justify-center">
              <Ionicons name="checkmark" size={12} color="white" />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

// Comparison Row
const ComparisonRow: React.FC<{
  feature: string;
  freeValue: boolean | string;
  premiumValue: boolean | string;
}> = ({ feature, freeValue, premiumValue }) => {
  return (
    <View className="flex-row items-center py-2.5 border-b border-gray-800/50">
      <Text className="flex-1 text-gray-400 text-sm">{feature}</Text>
      <View className="w-20 items-center">
        {typeof freeValue === 'boolean' ? (
          <Ionicons
            name={freeValue ? 'checkmark' : 'close'}
            size={16}
            color={freeValue ? '#6b7280' : '#ef4444'}
          />
        ) : (
          <Text className="text-gray-500 text-xs">{freeValue}</Text>
        )}
      </View>
      <View className="w-20 items-center">
        {typeof premiumValue === 'boolean' ? (
          <Ionicons name="checkmark" size={16} color="#22c55e" />
        ) : (
          <Text className="text-green-400 text-xs font-medium">{premiumValue}</Text>
        )}
      </View>
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PaywallScreen() {
  const router = useRouter();
  const [offerings, setOfferings] = useState<any>(null);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFetchingOfferings, setIsFetchingOfferings] = useState(true);

  useEffect(() => {
    fetchOfferings();
  }, []);

  const fetchOfferings = async () => {
    try {
      const result = await Purchases.getOfferings();
      if (result.current) {
        setOfferings(result.current);
        // Default to annual if available, then monthly
        const annual = result.current.availablePackages.find(
          (p: any) => p.packageType === 'ANNUAL'
        );
        const monthly = result.current.availablePackages.find(
          (p: any) => p.packageType === 'MONTHLY'
        );
        setSelectedPkg(annual || monthly || result.current.availablePackages[0]);
      }
    } catch (error) {
      console.error('Error fetching offerings:', error);
    } finally {
      setIsFetchingOfferings(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await Purchases.purchasePackage(selectedPkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (!error.userCancelled) {
        Alert.alert(
          'Purchase Failed',
          error.message || 'An unknown error occurred. Please try again.'
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const restored = await Purchases.restorePurchases();
      if (restored) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Your purchases have been restored!');
        router.back();
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Restore Failed', error.message);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const openExternal = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Unavailable', 'Could not open the link right now.');
      return;
    }
    await Linking.openURL(url);
  };

  // Calculate trial text
  const trialText = useMemo(() => {
    if (!selectedPkg) return 'Start Free Trial';
    const intro = selectedPkg.product.introPrice;
    if (intro) {
      return `Start ${intro.priceString} Trial`;
    }
    return 'Start Free Trial';
  }, [selectedPkg]);

  // Sorted packages (Annual first, then Monthly, then others)
  const sortedPackages = useMemo(() => {
    if (!offerings?.availablePackages) return [];
    return [...offerings.availablePackages].sort((a, b) => {
      const order: Record<string, number> = {
        ANNUAL: 0,
        MONTHLY: 1,
        WEEKLY: 2,
        CUSTOM: 3,
      };
      return (order[a.packageType] ?? 3) - (order[b.packageType] ?? 3);
    });
  }, [offerings]);

  return (
    <SafeAreaView className="flex-1 bg-[#050816]" edges={['top']}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#050816', '#0a0f1e', '#0f0f23']}
        style={{ flex: 1 }}
      >
        {/* Decorative orbs */}
        <View className="absolute left-[-60] top-[-40] w-40 h-40 rounded-full bg-violet-500/10" />
        <View className="absolute right-[-80] top-32 w-48 h-48 rounded-full bg-pink-500/8" />
        <View className="absolute left-[-40] bottom-48 w-32 h-32 rounded-full bg-indigo-500/10" />

        {/* Close Button */}
        <Pressable
          onPress={handleClose}
          className="absolute top-3 right-4 z-50 w-10 h-10 rounded-full bg-gray-800/60 items-center justify-center border border-gray-700/50"
        >
          <Ionicons name="close" size={20} color="#9ca3af" />
        </Pressable>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 180 }}
        >
          {/* Hero Section */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="items-center pt-16 pb-6"
          >
            {/* Animated Orb */}
            <AnimatedOrb />

            {/* Title */}
            <Animated.Text
              entering={FadeInDown.delay(200).duration(500)}
              className="text-3xl font-bold text-white text-center mt-6 px-8"
            >
              Unlock Your Full Aura
            </Animated.Text>

            {/* Subtitle */}
            <Animated.Text
              entering={FadeInDown.delay(300).duration(500)}
              className="text-base text-gray-400 text-center mt-2 px-10"
            >
              Discover the complete picture of your energy
            </Animated.Text>
          </Animated.View>

          {/* Countdown Timer */}
          <CountdownTimer />

          {/* Social Proof */}
          <SocialProof />

          {/* Features Section */}
          <View className="mt-4">
            <Animated.Text
              entering={FadeInDown.delay(500).duration(400)}
              className="mx-5 mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500"
            >
              Premium Features
            </Animated.Text>

            {features.map((feature, index) => (
              <FeatureCard key={index} feature={feature} index={index} />
            ))}
          </View>

          {/* Comparison Table */}
          <Animated.View
            entering={FadeInDown.delay(700).duration(500)}
            className="mx-5 mt-6 mb-4"
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Compare Plans
            </Text>
            <View className="bg-gray-900/60 rounded-2xl p-4 border border-gray-800/50">
              {/* Header */}
              <View className="flex-row items-center pb-3 border-b border-gray-700/50">
                <View className="flex-1" />
                <View className="w-20 items-center">
                  <Text className="text-gray-400 text-xs font-semibold">Free</Text>
                </View>
                <View className="w-20 items-center">
                  <LinearGradient
                    colors={['#8b5cf6', '#ec4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    className="rounded px-2 py-0.5"
                  >
                    <Text className="text-white text-xs font-bold">Premium</Text>
                  </LinearGradient>
                </View>
              </View>

              {/* Rows */}
              <ComparisonRow feature="Daily Scans" freeValue="2" premiumValue="∞" />
              <ComparisonRow feature="Match Friends" freeValue={false} premiumValue={true} />
              <ComparisonRow feature="Scan History" freeValue="5" premiumValue="∞" />
              <ComparisonRow feature="Rare Aura Colors" freeValue={false} premiumValue={true} />
              <ComparisonRow feature="Ad-Free" freeValue={false} premiumValue={true} />
              <ComparisonRow feature="Priority Support" freeValue={false} premiumValue={true} />
            </View>
          </Animated.View>

          {/* Package Selection */}
          <View className="mt-4">
            <Animated.Text
              entering={FadeInDown.delay(800).duration(400)}
              className="mx-5 mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500"
            >
              Choose Your Plan
            </Animated.Text>

            {isFetchingOfferings && (
              <View className="mx-5 mt-2 rounded-2xl border border-gray-700/40 bg-gray-900/60 p-4 items-center">
                <ActivityIndicator color="#a78bfa" />
                <Text className="mt-2 text-sm text-gray-400">Loading plans...</Text>
              </View>
            )}

            {!isFetchingOfferings && sortedPackages.length === 0 && (
              <View className="mx-5 mt-2 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                <Text className="text-sm font-semibold text-red-100">Plans unavailable</Text>
                <Text className="mt-1 text-xs text-red-200/80">
                  We could not load subscription options. Check your internet and try again.
                </Text>
                <Pressable onPress={fetchOfferings} className="mt-3 rounded-lg bg-red-500/20 py-2 items-center">
                  <Text className="text-xs font-semibold text-red-100">Retry</Text>
                </Pressable>
              </View>
            )}

            {!isFetchingOfferings &&
              sortedPackages.map((pkg: any) => (
                <PackageCard
                  key={pkg.identifier}
                  pkg={pkg}
                  isSelected={selectedPkg?.identifier === pkg.identifier}
                  onSelect={() => setSelectedPkg(pkg)}
                />
              ))}
          </View>

          {/* Trust Badges */}
          <View className="mx-5 mt-6">
            <View className="flex-row justify-center">
              {trustBadges.map((badge, index) => (
                <TrustBadge key={index} badge={badge} index={index} />
              ))}
            </View>
          </View>

          {/* Terms */}
          <Animated.View
            entering={FadeInDown.delay(1000).duration(400)}
            className="mx-8 mt-4"
          >
            <Text className="text-[10px] text-gray-600 text-center leading-4">
              Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. 
              Manage your subscription in Account Settings.
            </Text>
          </Animated.View>
        </ScrollView>

        {/* Bottom CTA Section */}
        <View
          className="absolute bottom-0 w-full px-5 pt-4 pb-8"
          style={{
            backgroundColor: 'rgba(5, 8, 22, 0.95)',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Main CTA Button */}
          <PulsingButton
            onPress={handlePurchase}
            isLoading={isPurchasing || !selectedPkg}
            text={selectedPkg ? trialText : 'Loading Plans...'}
          />

          {/* Restore Button */}
          <Pressable
            onPress={handleRestore}
            className="mt-3 items-center py-2"
          >
            <Text className="text-violet-400 text-sm font-medium">
              Restore Purchases
            </Text>
          </Pressable>

          {/* Terms Links */}
          <View className="flex-row justify-center mt-2 space-x-3">
            <Pressable onPress={() => openExternal(TERMS_URL)}>
              <Text className="text-gray-500 text-xs underline">Terms</Text>
            </Pressable>
            <Text className="text-gray-600">•</Text>
            <Pressable onPress={() => openExternal(PRIVACY_URL)}>
              <Text className="text-gray-500 text-xs underline">Privacy</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

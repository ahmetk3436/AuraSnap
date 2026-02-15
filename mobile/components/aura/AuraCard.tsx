import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
import { hapticLight, hapticSelection } from '../../lib/haptics';
import Modal from '../ui/Modal';
import { getAuraLabel, getAuraTheme } from './auraTheme';

interface AuraCardProps {
  auraColor: string;
  energyLevel: number;
  moodScore?: number;
  personality: string;
  date?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  isCompact?: boolean;
  showDetails?: boolean;
  entranceDelay?: number;
}

export default function AuraCard({
  auraColor,
  energyLevel,
  moodScore,
  personality,
  date,
  onPress,
  onLongPress,
  isCompact = false,
  showDetails = true,
  entranceDelay = 0,
}: AuraCardProps) {
  const theme = useMemo(() => getAuraTheme(auraColor), [auraColor]);
  const label = useMemo(() => getAuraLabel(auraColor), [auraColor]);
  const clampedEnergy = Math.max(0, Math.min(100, energyLevel));

  const [previewOpen, setPreviewOpen] = useState(false);

  const pressScale = useSharedValue(1);
  const energyProgress = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0.25);

  useEffect(() => {
    energyProgress.value = withTiming(clampedEnergy, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedEnergy, energyProgress]);

  useEffect(() => {
    shimmerOpacity.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.22, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [shimmerOpacity]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const energyAnimatedStyle = useAnimatedStyle(() => ({
    width: `${energyProgress.value}%`,
  }));

  const shimmerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.985, { damping: 16, stiffness: 240 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 16, stiffness: 240 });
  };

  const handlePress = () => {
    hapticLight();
    onPress?.();
  };

  const handleLongPress = () => {
    hapticSelection();
    if (onLongPress) {
      onLongPress();
      return;
    }
    setPreviewOpen(true);
  };

  return (
    <>
      <Animated.View
        entering={FadeInDown.delay(entranceDelay).springify().damping(16).stiffness(170)}
        style={[
          containerAnimatedStyle,
          {
            shadowColor: theme.glow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.32,
            shadowRadius: 22,
            elevation: 12,
          },
        ]}
        className="mx-4 overflow-hidden rounded-3xl"
      >
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={280}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className="overflow-hidden rounded-3xl border border-white/15 bg-[#0e1330]/85"
        >
          <LinearGradient colors={[theme.primary, theme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View className="px-5 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-white/25">
                    <Text className="text-2xl">{theme.emoji}</Text>
                  </View>
                  <View>
                    <Text className="text-lg font-bold text-white">{theme.display}</Text>
                    <Text className="text-sm text-white/85">{label}</Text>
                  </View>
                </View>

                <View className="items-end">
                  <Text className="text-xs font-semibold uppercase tracking-[1.4px] text-white/80">Energy</Text>
                  <Text className="text-xl font-extrabold text-white">{clampedEnergy}%</Text>
                </View>
              </View>

              {date ? (
                <View className="mt-3 self-start rounded-full bg-white/20 px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-white/90">{date}</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          <View className="px-5 py-4">
            <View className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <Animated.View style={[energyAnimatedStyle, { height: '100%', borderRadius: 999, overflow: 'hidden' }]}>
                <LinearGradient
                  colors={[theme.primary, theme.secondary]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            </View>

            <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Text className="text-[11px] font-semibold uppercase tracking-[1.3px] text-slate-400">Your Energy Today</Text>
              <Text className="mt-1 text-[15px] leading-6 text-white" numberOfLines={isCompact ? 2 : 4}>
                {personality}
              </Text>
            </View>

            {showDetails && moodScore !== undefined ? (
              <View className="mt-3 flex-row items-center justify-between">
                <View className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-slate-200">Mood {Math.max(0, Math.min(10, moodScore))}/10</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="sparkles" size={14} color={theme.primary} />
                  <Text style={{ color: theme.text }} className="ml-1 text-xs font-semibold">
                    Long press to preview
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 rounded-3xl border"
            style={[shimmerAnimatedStyle, { borderColor: '#ffffff60' }]}
          />
        </Pressable>
      </Animated.View>

      <Modal visible={previewOpen} onClose={() => setPreviewOpen(false)} title={`${theme.emoji} ${theme.display} Preview`}>
        <View>
          <Text className="text-sm text-slate-300">{label}</Text>
          <Text className="mt-3 text-base leading-7 text-white">{personality}</Text>
          <View className="mt-4 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <Text className="text-sm text-slate-200">Energy</Text>
            <Text className="text-sm font-bold" style={{ color: theme.text }}>
              {clampedEnergy}%
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

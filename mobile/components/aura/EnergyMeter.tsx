import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { hapticLight } from '../../lib/haptics';
import { getAuraTheme } from './auraTheme';

type MeterVariant = 'linear' | 'circular' | 'segments';
type MeterSize = 'sm' | 'md' | 'lg';

interface EnergyMeterProps {
  level: number;
  color: string;
  variant?: MeterVariant;
  showLabel?: boolean;
  previousLevel?: number;
  animated?: boolean;
  size?: MeterSize;
  onAnimationEnd?: () => void;
}

const MILESTONES = [25, 50, 75, 100];
const MILESTONE_EMOJI: Record<number, string> = {
  25: '·',
  50: '⚡',
  75: '🔥',
  100: '✨',
};

const SIZE_CONFIG: Record<MeterSize, { barHeight: number; circle: number; labelSize: string; percentSize: string }> = {
  sm: { barHeight: 8, circle: 86, labelSize: 'text-xs', percentSize: 'text-base' },
  md: { barHeight: 12, circle: 118, labelSize: 'text-sm', percentSize: 'text-lg' },
  lg: { barHeight: 16, circle: 152, labelSize: 'text-base', percentSize: 'text-2xl' },
};

export default function EnergyMeter({
  level,
  color,
  variant = 'linear',
  showLabel = true,
  previousLevel,
  animated = true,
  size = 'md',
  onAnimationEnd,
}: EnergyMeterProps) {
  const theme = useMemo(() => getAuraTheme(color), [color]);
  const clampedLevel = Math.max(0, Math.min(100, level));
  const previous = previousLevel !== undefined ? Math.max(0, Math.min(100, previousLevel)) : undefined;
  const config = SIZE_CONFIG[size];

  const progress = useSharedValue(animated ? 0 : clampedLevel);
  const shimmer = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!animated) {
      progress.value = clampedLevel;
      onAnimationEnd?.();
      return;
    }

    progress.value = withTiming(
      clampedLevel,
      {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (!finished) return;
        if (onAnimationEnd) runOnJS(onAnimationEnd)();
        runOnJS(hapticLight)();
      }
    );
  }, [animated, clampedLevel, onAnimationEnd, progress]);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 1400 })),
      -1,
      true
    );
  }, [shimmer]);

  useEffect(() => {
    if (clampedLevel < 80) {
      pulse.value = 1;
      return;
    }

    pulse.value = withRepeat(
      withSequence(withTiming(1.02, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      true
    );
  }, [clampedLevel, pulse]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
    transform: [{ scaleY: pulse.value }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + shimmer.value * 0.2,
    transform: [{ translateX: -60 + shimmer.value * 200 }],
  }));

  const circularDotOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 3.6}deg` }],
  }));

  const circularGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + (progress.value / 100) * 0.5,
    transform: [{ scale: pulse.value }],
  }));

  const delta = previous !== undefined ? clampedLevel - previous : undefined;
  const activeSegments = Math.round(clampedLevel / 10);

  return (
    <View className="w-full">
      {showLabel ? (
        <View className="mb-2 flex-row items-center justify-between">
          <Text className={`${config.labelSize} font-semibold text-slate-300`}>Energy Level</Text>
          <View className="flex-row items-center">
            <Text className={`${config.percentSize} font-extrabold text-white`}>{clampedLevel}%</Text>
            {delta !== undefined ? (
              <Text className={`ml-2 text-xs font-semibold ${delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {delta >= 0 ? `+${delta}` : delta}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {variant === 'linear' ? (
        <View>
          <View
            className="overflow-hidden rounded-full border border-white/10 bg-slate-900/80"
            style={{ height: config.barHeight }}
          >
            <Animated.View style={[progressBarStyle, { height: '100%', borderRadius: 999, overflow: 'hidden' }]}>
              <LinearGradient
                colors={[theme.primary, theme.secondary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                shimmerStyle,
                {
                  position: 'absolute',
                  top: -8,
                  height: config.barHeight + 16,
                  width: 48,
                  borderRadius: 24,
                  backgroundColor: '#ffffff',
                },
              ]}
            />
          </View>

          <View className="mt-2 flex-row items-center justify-between">
            {MILESTONES.map((value) => (
              <View key={value} className="items-center">
                <Text className="text-[11px] text-slate-400">{MILESTONE_EMOJI[value]}</Text>
                <Text className="text-[10px] text-slate-500">{value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {variant === 'segments' ? (
        <View className="gap-2">
          <View className="flex-row gap-1.5">
            {Array.from({ length: 10 }).map((_, index) => {
              const isActive = index < activeSegments;
              return (
                <View
                  key={`segment-${index}`}
                  className="flex-1 overflow-hidden rounded-full border border-white/10"
                  style={{ height: Math.max(7, config.barHeight - 2), backgroundColor: '#0f172a' }}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[theme.primary, theme.secondary]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          <View className="flex-row justify-between">
            <Text className="text-[11px] text-slate-500">Low</Text>
            <Text className="text-[11px] text-slate-500">Peak</Text>
          </View>
        </View>
      ) : null}

      {variant === 'circular' ? (
        <View className="items-center justify-center py-1">
          <Animated.View
            style={[
              circularGlowStyle,
              {
                position: 'absolute',
                width: config.circle + 24,
                height: config.circle + 24,
                borderRadius: (config.circle + 24) / 2,
                backgroundColor: `${theme.glow}2B`,
              },
            ]}
          />

          <View
            style={{ width: config.circle, height: config.circle, borderRadius: config.circle / 2 }}
            className="items-center justify-center border border-white/10 bg-slate-900/80"
          >
            <LinearGradient
              colors={['#ffffff08', '#ffffff00']}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                bottom: 8,
                left: 8,
                borderRadius: (config.circle - 16) / 2,
              }}
            />

            <View
              style={{
                position: 'absolute',
                width: config.circle - 8,
                height: config.circle - 8,
                borderRadius: (config.circle - 8) / 2,
                borderWidth: 6,
                borderColor: '#1e293b',
              }}
            />

            <Animated.View
              style={[
                circularDotOrbitStyle,
                {
                  position: 'absolute',
                  width: config.circle - 8,
                  height: config.circle - 8,
                  alignItems: 'center',
                },
              ]}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: -2,
                  backgroundColor: theme.primary,
                  shadowColor: theme.glow,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 10,
                  elevation: 6,
                }}
              />
            </Animated.View>

            <Text className={`${config.percentSize} font-extrabold text-white`}>{clampedLevel}%</Text>
            <Text className="text-[11px] font-medium text-slate-400">Current Energy</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

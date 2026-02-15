import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight, hapticSuccess } from '../../lib/haptics';

type StreakVariant = 'compact' | 'full';

interface StreakBadgeProps {
  streak: number;
  totalScans?: number;
  longestStreak?: number;
  showShare?: boolean;
  variant?: StreakVariant;
  onMilestone?: (days: number) => void;
  hasStreakFreeze?: boolean;
}

const MILESTONES = [7, 14, 30];

function streakPalette(streak: number) {
  if (streak >= 30) {
    return {
      bgStart: '#7c2d12',
      bgEnd: '#b45309',
      accent: '#fbbf24',
      text: '#fef3c7',
    };
  }
  if (streak >= 14) {
    return {
      bgStart: '#581c87',
      bgEnd: '#c026d3',
      accent: '#f472b6',
      text: '#f5d0fe',
    };
  }
  if (streak >= 7) {
    return {
      bgStart: '#7c2d12',
      bgEnd: '#ea580c',
      accent: '#fb923c',
      text: '#ffedd5',
    };
  }
  return {
    bgStart: '#172554',
    bgEnd: '#1e1b4b',
    accent: '#8b5cf6',
    text: '#ddd6fe',
  };
}

export default function StreakBadge({
  streak,
  totalScans,
  longestStreak,
  showShare = false,
  variant = 'full',
  onMilestone,
  hasStreakFreeze = false,
}: StreakBadgeProps) {
  const palette = useMemo(() => streakPalette(streak), [streak]);
  const previousStreak = useRef(streak);

  const flameScale = useSharedValue(1);
  const flameTilt = useSharedValue(0);
  const glowPulse = useSharedValue(0.35);
  const milestoneBurst = useSharedValue(0);

  useEffect(() => {
    if (streak <= 0) return;

    flameScale.value = withRepeat(
      withSequence(
        withTiming(1.16, { duration: 420, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 420, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    flameTilt.value = withRepeat(
      withSequence(withTiming(4, { duration: 240 }), withTiming(-4, { duration: 240 }), withTiming(0, { duration: 240 })),
      -1,
      true
    );

    glowPulse.value = withRepeat(
      withSequence(withTiming(0.85, { duration: 900 }), withTiming(0.35, { duration: 900 })),
      -1,
      true
    );
  }, [flameScale, flameTilt, glowPulse, streak]);

  useEffect(() => {
    const previous = previousStreak.current;
    const reached = MILESTONES.find((value) => previous < value && streak >= value);

    if (reached) {
      milestoneBurst.value = withSequence(withTiming(1, { duration: 250 }), withTiming(0, { duration: 700 }));
      hapticSuccess();
      onMilestone?.(reached);
    }

    previousStreak.current = streak;
  }, [milestoneBurst, onMilestone, streak]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }, { rotate: `${flameTilt.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
    transform: [{ scale: flameScale.value * 1.15 }],
  }));

  const burstStyle = useAnimatedStyle(() => ({
    opacity: milestoneBurst.value,
    transform: [{ scale: 0.7 + milestoneBurst.value * 0.7 }],
  }));

  const progressDays = Math.min(streak, 7);

  const handleShare = async () => {
    hapticLight();
    await Share.share({
      message: `I am on a ${streak}-day AuraSnap streak 🔥`,
    });
  };

  return (
    <View
      className="mx-4 overflow-hidden rounded-3xl border border-white/10"
      style={{
        backgroundColor: palette.bgStart,
        shadowColor: palette.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
        elevation: 10,
      }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: palette.bgEnd,
          opacity: 0.58,
        }}
      />

      <View className={`relative flex-row items-center justify-between px-5 ${variant === 'compact' ? 'py-3.5' : 'py-4'}`}>
        <View className="flex-row items-center">
          <View className="mr-3 items-center justify-center">
            <Animated.View
              pointerEvents="none"
              style={[
                glowStyle,
                {
                  position: 'absolute',
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: `${palette.accent}55`,
                },
              ]}
            />
            <Animated.View style={flameStyle}>
              <Ionicons name="flame" size={30} color={palette.accent} />
            </Animated.View>
          </View>

          <View>
            <Text className="text-2xl font-extrabold text-white">
              {streak} {streak === 1 ? 'Day' : 'Days'}
            </Text>
            <Text className="text-xs font-semibold uppercase tracking-[1.1px]" style={{ color: palette.text }}>
              Current Streak
            </Text>
          </View>
        </View>

        <View className="items-end">
          {totalScans !== undefined ? (
            <Text className="text-lg font-bold" style={{ color: palette.text }}>
              {totalScans}
            </Text>
          ) : null}
          <Text className="text-[11px] text-slate-300">Total Scans</Text>
          {longestStreak !== undefined && variant === 'full' ? (
            <Text className="mt-1 text-[11px] text-slate-300">Best {longestStreak}d</Text>
          ) : null}
        </View>
      </View>

      {variant === 'full' ? (
        <View className="relative border-t border-white/10 px-5 pb-4 pt-3">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-slate-200">Weekly Chain</Text>
            {hasStreakFreeze ? (
              <View className="flex-row items-center rounded-full border border-sky-200/35 bg-sky-400/15 px-2 py-1">
                <Ionicons name="snow" size={12} color="#7dd3fc" />
                <Text className="ml-1 text-[10px] font-semibold text-sky-200">Freeze ready</Text>
              </View>
            ) : null}
          </View>

          <View className="flex-row gap-2">
            {Array.from({ length: 7 }).map((_, index) => {
              const active = index < progressDays;
              return (
                <View
                  key={`day-${index}`}
                  className="h-2 flex-1 rounded-full"
                  style={{ backgroundColor: active ? palette.accent : '#ffffff1f' }}
                />
              );
            })}
          </View>

          {showShare ? (
            <Pressable
              onPress={handleShare}
              className="mt-3 flex-row items-center self-start rounded-full border border-white/15 px-3 py-1.5"
              style={{ backgroundColor: '#ffffff14' }}
            >
              <Ionicons name="share-social-outline" size={13} color={palette.text} />
              <Text className="ml-1.5 text-xs font-semibold" style={{ color: palette.text }}>
                Share my streak
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Animated.View pointerEvents="none" style={[burstStyle, { position: 'absolute', right: 16, top: 8 }]}>
        <Text className="text-xl">🎉</Text>
      </Animated.View>
    </View>
  );
}

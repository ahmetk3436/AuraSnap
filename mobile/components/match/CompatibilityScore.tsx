import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight, hapticSuccess } from '../../lib/haptics';

interface CompatibilityBreakdown {
  energy: number;
  mood: number;
  vibe: number;
}

interface CompatibilityScoreProps {
  score: number;
  showConfetti?: boolean;
  breakdown?: CompatibilityBreakdown;
  onShare?: () => void;
  showDetails?: boolean;
  animated?: boolean;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scoreColor(score: number) {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#38bdf8';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number) {
  if (score >= 85) return 'Soul Connection';
  if (score >= 70) return 'High Alignment';
  if (score >= 55) return 'Promising Match';
  return 'Growth Potential';
}

function scoreEmoji(score: number) {
  if (score >= 85) return '💚';
  if (score >= 70) return '💛';
  if (score >= 55) return '🧡';
  return '❤️';
}

export default function CompatibilityScore({
  score,
  showConfetti = true,
  breakdown,
  onShare,
  showDetails = true,
  animated = true,
}: CompatibilityScoreProps) {
  const clampedScore = clamp(score);
  const ringColor = scoreColor(clampedScore);

  const [displayScore, setDisplayScore] = useState(animated ? 0 : clampedScore);
  const [expanded, setExpanded] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const progressAnim = useRef(new Animated.Value(animated ? 0 : clampedScore)).current;
  const glowAnim = useRef(new Animated.Value(0.25)).current;

  const parsedBreakdown = useMemo<CompatibilityBreakdown>(() => {
    if (breakdown) {
      return {
        energy: clamp(breakdown.energy),
        mood: clamp(breakdown.mood),
        vibe: clamp(breakdown.vibe),
      };
    }

    return {
      energy: clamp(clampedScore + 6),
      mood: clamp(clampedScore - 4),
      vibe: clamp(clampedScore + 2),
    };
  }, [breakdown, clampedScore]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.75,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    glowLoop.start();
    return () => glowLoop.stop();
  }, [glowAnim]);

  useEffect(() => {
    const listener = progressAnim.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: clampedScore,
        duration: animated ? 1100 : 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished && clampedScore >= 80) {
        hapticSuccess();
      }
    });

    return () => {
      progressAnim.removeListener(listener);
    };
  }, [animated, clampedScore, progressAnim, scaleAnim]);

  const orbitRotation = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['-90deg', '270deg'],
  });

  const ringRotation = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['-90deg', '270deg'],
  });

  const handleShare = async () => {
    hapticLight();
    if (onShare) {
      onShare();
      return;
    }

    await Share.share({
      message: `Aura match score: ${clampedScore}% ${scoreEmoji(clampedScore)}`,
    });
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handleShare}
        className="items-center rounded-3xl border border-white/10 bg-[#0e1535]/88 px-5 py-5"
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: `${ringColor}33`,
            opacity: glowAnim,
            transform: [{ scale: glowAnim }],
          }}
        />

        <View style={{ width: 176, height: 176 }} className="items-center justify-center">
          <View
            style={{
              position: 'absolute',
              width: 176,
              height: 176,
              borderRadius: 88,
              borderWidth: 12,
              borderColor: '#1f2a4a',
            }}
          />

          <Animated.View
            style={{
              position: 'absolute',
              width: 176,
              height: 176,
              borderRadius: 88,
              borderWidth: 12,
              borderColor: 'transparent',
              borderTopColor: ringColor,
              borderRightColor: clampedScore >= 25 ? ringColor : 'transparent',
              borderBottomColor: clampedScore >= 50 ? ringColor : 'transparent',
              borderLeftColor: clampedScore >= 75 ? ringColor : 'transparent',
              transform: [{ rotate: ringRotation }],
            }}
          />

          <Animated.View
            style={{
              position: 'absolute',
              width: 176,
              height: 176,
              alignItems: 'center',
              transform: [{ rotate: orbitRotation }],
            }}
          >
            <View
              style={{
                marginTop: -4,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: ringColor,
                shadowColor: ringColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.55,
                shadowRadius: 10,
                elevation: 6,
              }}
            />
          </Animated.View>

          <Text style={{ color: ringColor }} className="text-5xl font-black">
            {displayScore}
          </Text>
          <Text className="mt-0.5 text-sm font-semibold text-slate-200">% match</Text>
          <Text className="mt-1 text-xl">{scoreEmoji(clampedScore)}</Text>
        </View>

        {showConfetti && clampedScore >= 80 ? (
          <View className="absolute left-4 right-4 top-3 flex-row justify-between">
            {['🎉', '✨', '💫', '🎊'].map((item) => (
              <Text key={item} className="text-lg">
                {item}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={{ color: ringColor }} className="mt-4 text-lg font-bold">
          {scoreLabel(clampedScore)}
        </Text>
        <Text className="mt-1 text-xs text-slate-400">Tap to share result</Text>
      </Pressable>

      {showDetails ? (
        <View className="mt-3 rounded-2xl border border-white/10 bg-[#0d1330]/80 px-4 py-3">
          <Pressable
            onPress={() => {
              hapticLight();
              setExpanded((value) => !value);
            }}
            className="flex-row items-center justify-between"
          >
            <Text className="text-sm font-semibold text-slate-200">Compare Details</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
          </Pressable>

          {expanded ? (
            <View className="mt-3 gap-2">
              {([
                ['Energy', parsedBreakdown.energy],
                ['Mood', parsedBreakdown.mood],
                ['Vibe', parsedBreakdown.vibe],
              ] as const).map(([label, value]) => (
                <View key={label}>
                  <View className="mb-1 flex-row items-center justify-between">
                    <Text className="text-xs text-slate-300">{label}</Text>
                    <Text className="text-xs font-semibold text-slate-200">{value}%</Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${value}%`, backgroundColor: ringColor }}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

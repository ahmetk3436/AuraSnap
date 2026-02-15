import React, { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight } from '../../lib/haptics';
import AuraOrb from '../aura/AuraOrb';
import { getAuraTheme } from '../aura/auraTheme';

type OrbSize = 'sm' | 'md' | 'lg';

interface DualAuraOrbsProps {
  userColor: string;
  friendColor: string;
  compatibilityScore: number;
  userName?: string;
  friendName?: string;
  showParticles?: boolean;
  onUserOrbPress?: () => void;
  onFriendOrbPress?: () => void;
  size?: OrbSize;
}

interface FlowParticleProps {
  index: number;
  width: number;
  color: string;
}

const SIZE_MAP: Record<OrbSize, { orb: number; beam: number }> = {
  sm: { orb: 86, beam: 82 },
  md: { orb: 108, beam: 110 },
  lg: { orb: 126, beam: 132 },
};

function compatibilityColor(score: number) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#38bdf8';
  if (score >= 45) return '#f59e0b';
  return '#ef4444';
}

function FlowParticle({ index, width, color }: FlowParticleProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 220,
      withRepeat(withTiming(1, { duration: 1450, easing: Easing.linear }), -1, false)
    );
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width / 2 + progress.value * width }],
    opacity: 0.2 + (1 - Math.abs(progress.value - 0.5) * 2) * 0.7,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        animatedStyle,
        {
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: `${color}DD`,
        },
      ]}
    />
  );
}

export default function DualAuraOrbs({
  userColor,
  friendColor,
  compatibilityScore,
  userName = 'You',
  friendName = 'Friend',
  showParticles = true,
  onUserOrbPress,
  onFriendOrbPress,
  size = 'md',
}: DualAuraOrbsProps) {
  const { orb, beam } = SIZE_MAP[size];

  const userTheme = useMemo(() => getAuraTheme(userColor), [userColor]);
  const friendTheme = useMemo(() => getAuraTheme(friendColor), [friendColor]);
  const scoreColor = compatibilityColor(compatibilityScore);

  const beamOpacity = useSharedValue(0.35);
  const fusionGlow = useSharedValue(0.1);

  useEffect(() => {
    beamOpacity.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 900 }), withTiming(0.35, { duration: 900 })),
      -1,
      true
    );

    if (compatibilityScore >= 85) {
      fusionGlow.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 700 }), withTiming(0.12, { duration: 700 })),
        -1,
        true
      );
    } else {
      fusionGlow.value = withTiming(0.12, { duration: 260 });
    }
  }, [beamOpacity, compatibilityScore, fusionGlow]);

  const beamStyle = useAnimatedStyle(() => ({
    opacity: beamOpacity.value,
  }));

  const fusionStyle = useAnimatedStyle(() => ({
    opacity: fusionGlow.value,
    transform: [{ scale: 0.9 + fusionGlow.value * 0.35 }],
  }));

  const handleUserPress = () => {
    if (!onUserOrbPress) return;
    hapticLight();
    onUserOrbPress();
  };

  const handleFriendPress = () => {
    if (!onFriendOrbPress) return;
    hapticLight();
    onFriendOrbPress();
  };

  return (
    <View className="items-center rounded-3xl border border-white/10 bg-[#0e1433]/82 px-4 py-5">
      <View className="flex-row items-center justify-center">
        <View className="items-center">
          <AuraOrb
            colorName={userColor}
            size={orb}
            label={userName}
            animated
            showParticles={showParticles}
            onPress={onUserOrbPress ? handleUserPress : undefined}
          />
          <Text className="mt-1 text-xs capitalize text-slate-400">{userColor}</Text>
        </View>

        <View className="mx-3 items-center justify-center" style={{ width: beam }}>
          <Animated.View
            pointerEvents="none"
            style={[
              fusionStyle,
              {
                position: 'absolute',
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: `${scoreColor}55`,
              },
            ]}
          />

          <Animated.View style={[beamStyle, { width: beam, height: 8, borderRadius: 999, overflow: 'hidden' }]}>
            <LinearGradient
              colors={[userTheme.primary, scoreColor, friendTheme.primary]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {showParticles ? (
            <View className="absolute items-center justify-center" style={{ width: beam, height: 24 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <FlowParticle key={`flow-${index}`} index={index} width={beam - 10} color={scoreColor} />
              ))}
            </View>
          ) : null}

          <View
            className="absolute items-center justify-center rounded-full border border-white/25 bg-[#0f1a3f]"
            style={{ width: 38, height: 38 }}
          >
            <Text className="text-xs font-bold" style={{ color: scoreColor }}>
              {Math.max(0, Math.min(100, Math.round(compatibilityScore)))}%
            </Text>
          </View>
        </View>

        <View className="items-center">
          <AuraOrb
            colorName={friendColor}
            size={orb}
            label={friendName}
            animated
            showParticles={showParticles}
            onPress={onFriendOrbPress ? handleFriendPress : undefined}
          />
          <Text className="mt-1 text-xs capitalize text-slate-400">{friendColor}</Text>
        </View>
      </View>

      <Text className="mt-4 text-sm font-semibold" style={{ color: scoreColor }}>
        {compatibilityScore >= 85 ? 'Fusion Mode Active' : 'Energy Bridge Active'}
      </Text>
    </View>
  );
}

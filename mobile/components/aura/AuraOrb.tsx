import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight } from '../../lib/haptics';
import { getAuraTheme } from './auraTheme';

interface AuraOrbProps {
  colorName: string;
  size: number;
  label?: string;
  animated?: boolean;
  showParticles?: boolean;
  isLoading?: boolean;
  onPress?: () => void;
  secondaryColor?: string;
}

interface OrbParticleProps {
  index: number;
  size: number;
  color: string;
}

function OrbParticle({ index, size, color }: OrbParticleProps) {
  const drift = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    drift.value = withDelay(
      index * 120,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    scale.value = withDelay(
      index * 120,
      withRepeat(
        withSequence(withTiming(1.25, { duration: 1600 }), withTiming(0.9, { duration: 1600 })),
        -1,
        true
      )
    );
  }, [drift, index, scale]);

  const angle = (Math.PI * 2 * index) / 6;
  const radius = size * 0.64;
  const particleSize = Math.max(6, Math.round(size * 0.06));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle) * radius },
      { translateY: Math.sin(angle) * radius - drift.value * 6 },
      { scale: scale.value },
    ],
    opacity: 0.35 + drift.value * 0.45,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={animatedStyle}
      className="absolute items-center justify-center rounded-full"
    >
      <View style={{ width: particleSize, height: particleSize, borderRadius: particleSize / 2, backgroundColor: `${color}99` }} />
    </Animated.View>
  );
}

export default function AuraOrb({
  colorName,
  size,
  label,
  animated = true,
  showParticles = true,
  isLoading = false,
  onPress,
  secondaryColor,
}: AuraOrbProps) {
  const theme = useMemo(() => getAuraTheme(colorName), [colorName]);
  const gradientColors = useMemo<[string, string]>(
    () => [theme.primary, secondaryColor || theme.secondary],
    [secondaryColor, theme.primary, theme.secondary]
  );

  const orbScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.35);
  const spin = useSharedValue(0);
  const tapScale = useSharedValue(1);
  const colorFlash = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;

    orbScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    ringOpacity.value = withRepeat(
      withSequence(withTiming(0.75, { duration: 1600 }), withTiming(0.25, { duration: 1600 })),
      -1,
      true
    );

    spin.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1, false);
  }, [animated, orbScale, ringOpacity, spin]);

  useEffect(() => {
    colorFlash.value = 1;
    colorFlash.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
  }, [colorName, colorFlash]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value * tapScale.value }, { rotate: `${spin.value}deg` }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: orbScale.value * 1.08 }],
  }));

  const ringStyleLarge = useAnimatedStyle(() => ({
    opacity: ringOpacity.value * 0.65,
    transform: [{ scale: orbScale.value * 1.2 }],
  }));

  const colorFlashStyle = useAnimatedStyle(() => ({
    opacity: colorFlash.value,
  }));

  const containerSize = Math.max(72, size);
  const ringOne = containerSize * 1.28;
  const ringTwo = containerSize * 1.48;

  const handlePressIn = () => {
    tapScale.value = withSpring(0.96, { damping: 14, stiffness: 240 });
  };

  const handlePressOut = () => {
    tapScale.value = withSpring(1, { damping: 14, stiffness: 240 });
  };

  const handlePress = () => {
    if (!onPress) return;
    hapticLight();
    onPress();
  };

  return (
    <View className="items-center justify-center">
      <Pressable
        disabled={!onPress}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="items-center justify-center"
      >
        <View style={{ width: ringTwo, height: ringTwo }} className="items-center justify-center">
          <Animated.View
            style={[ringStyleLarge, { width: ringTwo, height: ringTwo, borderRadius: ringTwo / 2, borderColor: `${theme.glow}4D`, borderWidth: 1 }]}
            className="absolute"
          />
          <Animated.View
            style={[ringStyle, { width: ringOne, height: ringOne, borderRadius: ringOne / 2, borderColor: `${theme.glow}7D`, borderWidth: 1 }]}
            className="absolute"
          />

          {animated && showParticles
            ? Array.from({ length: 6 }).map((_, index) => (
                <OrbParticle key={`particle-${index}`} index={index} size={containerSize} color={theme.glow} />
              ))
            : null}

          <Animated.View style={orbStyle} entering={FadeIn.duration(320)}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0.15, y: 0.15 }}
              end={{ x: 0.85, y: 0.85 }}
              style={{
                width: containerSize,
                height: containerSize,
                borderRadius: containerSize / 2,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: theme.glow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.46,
                shadowRadius: 24,
                elevation: 12,
              }}
            >
              <View
                style={{
                  width: containerSize * 0.72,
                  height: containerSize * 0.72,
                  borderRadius: (containerSize * 0.72) / 2,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                }}
              />

              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ position: 'absolute' }} />
              ) : (
                <Text style={{ fontSize: Math.max(20, Math.round(containerSize * 0.24)) }} className="absolute">
                  {theme.emoji}
                </Text>
              )}

              <Animated.View
                pointerEvents="none"
                className="absolute inset-0"
                style={[
                  colorFlashStyle,
                  {
                    borderRadius: containerSize / 2,
                    borderWidth: 2,
                    borderColor: '#ffffff66',
                  },
                ]}
              />
            </LinearGradient>
          </Animated.View>
        </View>
      </Pressable>

      {label ? (
        <Text className="mt-3 text-center text-sm font-semibold text-slate-200" style={{ color: theme.text }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

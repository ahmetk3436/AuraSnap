import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { hapticMedium, hapticSuccess } from '../../lib/haptics';

type ScanButtonSize = 'sm' | 'md' | 'lg';
type ScanButtonVariant = 'default' | 'minimal' | 'floating';

interface ScanButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  loadingText?: string;
  loadingProgress?: number;
  size?: ScanButtonSize;
  disabled?: boolean;
  variant?: ScanButtonVariant;
  showLabel?: boolean;
}

const SIZE_CONFIG: Record<ScanButtonSize, { button: number; icon: number }> = {
  sm: { button: 112, icon: 32 },
  md: { button: 148, icon: 42 },
  lg: { button: 180, icon: 50 },
};

function getLoadingStage(progress: number, loadingText?: string) {
  if (loadingText) return loadingText;
  if (progress <= 30) return 'Uploading photo...';
  if (progress <= 75) return 'Analyzing aura...';
  return 'Generating result...';
}

export default function ScanButton({
  onPress,
  isLoading = false,
  loadingText,
  loadingProgress = 0,
  size = 'lg',
  disabled = false,
  variant = 'default',
  showLabel = true,
}: ScanButtonProps) {
  const { button, icon } = SIZE_CONFIG[size];
  const blocked = disabled || isLoading;
  const progress = Math.max(0, Math.min(100, loadingProgress));

  const idleScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);
  const spin = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);
  const completionFlash = useSharedValue(0);
  const progressFill = useSharedValue(isLoading ? progress : 0);

  const previousLoading = useRef(isLoading);

  useEffect(() => {
    idleScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.75, { duration: 1700 }), withTiming(0.3, { duration: 1700 })),
      -1,
      true
    );
  }, [glowOpacity, idleScale]);

  useEffect(() => {
    if (!isLoading) {
      spin.value = 0;
      return;
    }

    spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false);
  }, [isLoading, spin]);

  useEffect(() => {
    progressFill.value = withTiming(isLoading ? progress : 0, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, [isLoading, progress, progressFill]);

  useEffect(() => {
    if (!previousLoading.current && isLoading) {
      completionFlash.value = 0;
    }

    if (previousLoading.current && !isLoading) {
      completionFlash.value = withSequence(withTiming(0.55, { duration: 220 }), withTiming(0, { duration: 500 }));
      hapticSuccess();
    }

    previousLoading.current = isLoading;
  }, [completionFlash, isLoading]);

  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: idleScale.value }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: idleScale.value * pressScale.value }],
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  const completionStyle = useAnimatedStyle(() => ({
    opacity: completionFlash.value,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressFill.value}%`,
  }));

  const stageText = useMemo(() => getLoadingStage(progress, loadingText), [loadingText, progress]);

  const ringSize = button * 1.36;
  const outerRingSize = button * 1.56;

  const handlePressIn = () => {
    if (blocked) return;
    pressScale.value = withSpring(0.96, { damping: 14, stiffness: 260 });
  };

  const handlePressOut = () => {
    if (blocked) return;
    pressScale.value = withSpring(1, { damping: 14, stiffness: 260 });
  };

  const handlePress = () => {
    if (blocked) return;

    hapticMedium();
    rippleOpacity.value = 0.5;
    rippleScale.value = 0.8;
    rippleOpacity.value = withTiming(0, { duration: 460, easing: Easing.out(Easing.quad) });
    rippleScale.value = withTiming(1.35, { duration: 460, easing: Easing.out(Easing.quad) });

    onPress();
  };

  return (
    <View className={`items-center ${variant === 'floating' ? 'rounded-3xl border border-white/10 bg-[#0b1230]/80 p-4' : ''}`}>
      <View style={{ width: outerRingSize, height: outerRingSize }} className="items-center justify-center">
        <Animated.View
          className="absolute rounded-full"
          style={[outerGlowStyle, { width: outerRingSize, height: outerRingSize, backgroundColor: '#7c3aed33' }]}
        />
        <Animated.View
          className="absolute rounded-full border"
          style={[outerGlowStyle, { width: ringSize, height: ringSize, borderColor: '#a855f766' }]}
        />

        <Animated.View
          pointerEvents="none"
          className="absolute rounded-full border border-violet-300/40"
          style={[rippleStyle, { width: ringSize, height: ringSize }]}
        />

        <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={blocked}>
          <Animated.View style={buttonStyle}>
            <LinearGradient
              colors={blocked ? ['#475569', '#334155'] : ['#7c3aed', '#a855f7', '#ec4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: button,
                height: button,
                borderRadius: button / 2,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                shadowColor: '#a855f7',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: blocked ? 0.1 : 0.35,
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  completionStyle,
                  {
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: '#ffffff66',
                    borderRadius: button / 2,
                  },
                ]}
              />

              {isLoading ? (
                <Animated.View style={spinnerStyle}>
                  <Ionicons name="sparkles" size={icon} color="#ffffff" />
                </Animated.View>
              ) : (
                <Ionicons name={variant === 'minimal' ? 'camera-outline' : 'scan-outline'} size={icon} color="#ffffff" />
              )}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="mt-4 w-full" style={{ maxWidth: 260 }}>
          <View className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-slate-900/90">
            <Animated.View style={[progressStyle, { height: '100%', borderRadius: 999, overflow: 'hidden' }]}>
              <LinearGradient
                colors={['#7c3aed', '#ec4899']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>
          <Text className="mt-2 text-center text-xs font-semibold text-slate-300">
            {stageText} {progress > 0 ? `${progress}%` : ''}
          </Text>
        </View>
      ) : null}

      {showLabel ? (
        <View className="mt-4 items-center">
          <Text className="text-center text-lg font-bold text-white">{isLoading ? 'Reading your energy...' : 'Scan Your Aura'}</Text>
          {!isLoading ? (
            <Text className="mt-1 text-center text-sm text-slate-400">
              {blocked ? 'Scan temporarily unavailable' : 'Take a selfie to discover your aura'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

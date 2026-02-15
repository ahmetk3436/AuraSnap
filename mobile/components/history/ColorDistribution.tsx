import React, { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { hapticLight } from '../../lib/haptics';
import { getAuraTheme } from '../aura/auraTheme';

type DistributionVariant = 'bars' | 'donut' | 'both';

interface ColorDistributionProps {
  distribution: Record<string, number>;
  variant?: DistributionVariant;
  showPercentage?: boolean;
  onColorPress?: (color: string) => void;
  showEmojis?: boolean;
  animated?: boolean;
}

interface DistributionEntry {
  color: string;
  count: number;
  percentage: number;
}

interface DistributionBarRowProps {
  entry: DistributionEntry;
  maxCount: number;
  isDominant: boolean;
  showPercentage: boolean;
  showEmojis: boolean;
  animated: boolean;
  index: number;
  onPress?: (color: string) => void;
}

function DistributionBarRow({
  entry,
  maxCount,
  isDominant,
  showPercentage,
  showEmojis,
  animated,
  index,
  onPress,
}: DistributionBarRowProps) {
  const theme = useMemo(() => getAuraTheme(entry.color), [entry.color]);
  const progress = useSharedValue(animated ? 0 : (entry.count / maxCount) * 100);

  useEffect(() => {
    progress.value = withTiming((entry.count / maxCount) * 100, {
      duration: animated ? 700 + index * 120 : 0,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, entry.count, index, maxCount, progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const handlePress = () => {
    if (!onPress) return;
    hapticLight();
    onPress(entry.color);
  };

  return (
    <Animated.View entering={animated ? FadeInDown.delay(index * 75).duration(260) : undefined}>
      <Pressable
        onPress={handlePress}
        disabled={!onPress}
        className={`mb-3 rounded-2xl border px-3.5 py-3 ${onPress ? 'active:opacity-80' : ''}`}
        style={{ borderColor: isDominant ? `${theme.primary}90` : '#ffffff20', backgroundColor: '#0f172acc' }}
      >
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            {showEmojis ? <Text className="mr-1.5 text-base">{theme.emoji}</Text> : null}
            <Text className="capitalize text-sm font-semibold text-slate-200">{entry.color}</Text>
            {isDominant ? (
              <View className="ml-2 rounded-full px-2 py-0.5" style={{ backgroundColor: `${theme.primary}33` }}>
                <Text className="text-[10px] font-semibold" style={{ color: theme.text }}>
                  Most Dominant
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs font-semibold text-slate-300">
            {entry.count}x {showPercentage ? `(${entry.percentage.toFixed(0)}%)` : ''}
          </Text>
        </View>

        <View className="h-2.5 overflow-hidden rounded-full bg-slate-800/80">
          <Animated.View style={[barStyle, { height: '100%', borderRadius: 999, backgroundColor: theme.primary }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ColorDistribution({
  distribution,
  variant = 'bars',
  showPercentage = true,
  onColorPress,
  showEmojis = true,
  animated = true,
}: ColorDistributionProps) {
  const entries = useMemo<DistributionEntry[]>(() => {
    const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return [];

    return Object.entries(distribution)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => ({
        color,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }));
  }, [distribution]);

  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);
  const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);
  const dominant = entries[0];

  if (entries.length === 0) {
    return (
      <View className="items-center rounded-2xl border border-white/10 bg-[#0d1330]/70 px-4 py-8">
        <Text className="text-3xl">🎨</Text>
        <Text className="mt-3 text-base font-semibold text-slate-200">No aura data yet</Text>
        <Text className="mt-1 text-sm text-slate-400">Start scanning to build your color profile.</Text>
      </View>
    );
  }

  const showBars = variant === 'bars' || variant === 'both';
  const showDonut = variant === 'donut' || variant === 'both';

  return (
    <View className="rounded-3xl border border-white/10 bg-[#0d1330]/75 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-base font-bold text-white">Your Aura Colors</Text>
        <View className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          <Text className="text-xs font-semibold text-slate-300">{totalCount} total scans</Text>
        </View>
      </View>

      {showDonut && dominant ? (
        <Animated.View entering={animated ? FadeInDown.duration(320) : undefined} className="mb-4 items-center rounded-2xl border border-white/10 bg-white/5 py-4">
          <View className="items-center justify-center" style={{ width: 156, height: 156 }}>
            <View
              style={{
                width: 128,
                height: 128,
                borderRadius: 64,
                borderWidth: 12,
                borderColor: `${getAuraTheme(dominant.color).primary}66`,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0f172a',
              }}
            >
              <Text className="text-2xl">{getAuraTheme(dominant.color).emoji}</Text>
              <Text className="mt-1 text-lg font-bold text-white">{dominant.percentage.toFixed(0)}%</Text>
              <Text className="text-[11px] capitalize text-slate-400">{dominant.color} dominant</Text>
            </View>

            {entries.slice(0, 6).map((entry, index) => {
              const angle = (Math.PI * 2 * index) / Math.max(1, Math.min(6, entries.length));
              const radius = 60;
              const dotSize = Math.max(14, Math.min(28, 12 + entry.percentage * 0.2));
              return (
                <View
                  key={`donut-${entry.color}`}
                  style={{
                    position: 'absolute',
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    left: 78 + Math.cos(angle) * radius - dotSize / 2,
                    top: 78 + Math.sin(angle) * radius - dotSize / 2,
                    backgroundColor: getAuraTheme(entry.color).primary,
                    borderWidth: 1,
                    borderColor: '#ffffff66',
                  }}
                />
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {showBars ? (
        <View>
          {entries.map((entry, index) => (
            <DistributionBarRow
              key={entry.color}
              entry={entry}
              index={index}
              maxCount={maxCount}
              isDominant={index === 0}
              showPercentage={showPercentage}
              showEmojis={showEmojis}
              animated={animated}
              onPress={onColorPress}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

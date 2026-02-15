import React, { useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { getAuraTheme } from './auraTheme';

interface PersonalityCardProps {
  traits: string[];
  description: string;
  title?: string;
  auraColor?: string;
  onTraitPress?: (trait: string) => void;
  expandable?: boolean;
  showShare?: boolean;
  traitIcons?: Record<string, string>;
}

const DEFAULT_TRAIT_ICONS: Record<string, string> = {
  calm: 'leaf-outline',
  creative: 'color-palette-outline',
  intuitive: 'moon-outline',
  energetic: 'flash-outline',
  confident: 'sparkles-outline',
  kind: 'heart-outline',
  focused: 'compass-outline',
  balanced: 'planet-outline',
};

function iconForTrait(trait: string, customIcons?: Record<string, string>): string {
  const key = trait.trim().toLowerCase();
  if (customIcons?.[key]) return customIcons[key];
  if (DEFAULT_TRAIT_ICONS[key]) return DEFAULT_TRAIT_ICONS[key];
  return 'star-outline';
}

export default function PersonalityCard({
  traits,
  description,
  title = 'Your Personality Traits',
  auraColor = 'violet',
  onTraitPress,
  expandable = true,
  showShare = false,
  traitIcons,
}: PersonalityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTrait, setSelectedTrait] = useState<string | null>(null);

  const theme = useMemo(() => getAuraTheme(auraColor), [auraColor]);
  const canExpand = expandable && description.length > 140;

  const descriptionText = canExpand && !expanded ? `${description.slice(0, 140).trim()}...` : description;

  const handleTraitPress = (trait: string) => {
    hapticSelection();
    setSelectedTrait(trait);
    onTraitPress?.(trait);
  };

  const handleShare = async () => {
    hapticLight();
    const traitsText = traits.map((trait) => `• ${trait}`).join('\n');
    await Share.share({
      message: `${title}\n\n${description}\n\nTraits:\n${traitsText}`,
    });
  };

  return (
    <View
      className="rounded-3xl border border-white/12 bg-[#0d1330]/80 p-5"
      style={{
        shadowColor: theme.glow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
        elevation: 8,
      }}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2 rounded-full border border-white/15 px-2 py-1" style={{ backgroundColor: `${theme.primary}33` }}>
            <Text className="text-xs font-semibold" style={{ color: theme.text }}>
              AI Insight
            </Text>
          </View>
          <Text className="text-base font-bold text-white">{title}</Text>
        </View>

        {showShare ? (
          <Pressable onPress={handleShare} className="rounded-full border border-white/15 bg-white/5 p-2">
            <Ionicons name="share-social-outline" size={16} color="#d8b4fe" />
          </Pressable>
        ) : null}
      </View>

      <Text className="text-sm leading-6 text-slate-200">{descriptionText}</Text>

      {canExpand ? (
        <Pressable
          onPress={() => {
            hapticLight();
            setExpanded((value) => !value);
          }}
          className="mt-2 self-start"
        >
          <Text className="text-xs font-semibold" style={{ color: theme.text }}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      ) : null}

      <View className="mt-4 flex-row flex-wrap gap-2">
        {traits.map((trait, index) => {
          const isSelected = selectedTrait === trait;
          return (
            <Animated.View key={`${trait}-${index}`} entering={FadeInDown.delay(index * 70).duration(240)}>
              <Pressable
                onPress={() => handleTraitPress(trait)}
                className="flex-row items-center rounded-full border px-3 py-2"
                style={{
                  borderColor: isSelected ? `${theme.primary}CC` : '#ffffff22',
                  backgroundColor: isSelected ? `${theme.primary}2B` : '#0f172a',
                }}
              >
                <Ionicons
                  name={iconForTrait(trait, traitIcons) as keyof typeof Ionicons.glyphMap}
                  size={13}
                  color={isSelected ? theme.text : '#94a3b8'}
                />
                <Text
                  className="ml-1.5 text-xs font-semibold capitalize"
                  style={{ color: isSelected ? theme.text : '#cbd5e1' }}
                >
                  {trait}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

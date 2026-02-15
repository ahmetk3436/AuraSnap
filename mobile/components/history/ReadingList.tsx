import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, SectionList, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { getAuraTheme } from '../aura/auraTheme';

interface Reading {
  id: string;
  aura_color: string;
  energy_level: number;
  mood_score?: number;
  created_at: string;
}

interface ReadingListProps {
  readings: Reading[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onShare?: (reading: Reading) => void;
  groupByDate?: boolean;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  scrollEnabled?: boolean;
}

interface ReadingSection {
  title: string;
  data: Reading[];
}

interface ReadingRowProps {
  item: Reading;
  index: number;
  selected: boolean;
  selectable: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onShare?: (reading: Reading) => void;
}

function formatDateLabel(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sectionTitleForDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDay.getTime() === today.getTime()) return 'Today';
  if (itemDay.getTime() === yesterday.getTime()) return 'Yesterday';

  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86400000);
  if (diffDays <= 7) return 'This Week';
  return 'Earlier';
}

function ReadingRow({
  item,
  index,
  selected,
  selectable,
  onSelect,
  onToggleSelect,
  onDelete,
  onShare,
}: ReadingRowProps) {
  const theme = useMemo(() => getAuraTheme(item.aura_color), [item.aura_color]);
  const pressScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePress = () => {
    if (selectable) {
      hapticSelection();
      onToggleSelect(item.id);
      return;
    }
    hapticLight();
    onSelect(item.id);
  };

  const handleShare = async () => {
    if (onShare) {
      onShare(item);
      return;
    }

    await Share.share({
      message: `${theme.display} • ${item.energy_level}% energy • ${formatDateLabel(item.created_at)}`,
    });
  };

  const actionsEnabled = Boolean(onDelete || onShare);

  const rowContent = (
    <Animated.View entering={FadeInDown.delay(index * 45).duration(230)} style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => {
          pressScale.value = withSpring(0.985, { damping: 15, stiffness: 260 });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 15, stiffness: 260 });
        }}
        className={`mb-3 overflow-hidden rounded-2xl border ${selected ? 'border-violet-300/80 bg-violet-500/15' : 'border-white/10 bg-[#111a38]/90'}`}
      >
        <View className="absolute bottom-0 left-0 top-0" style={{ width: 4, backgroundColor: theme.primary }} />

        <View className="flex-row items-center px-4 py-3">
          <View
            style={{ backgroundColor: `${theme.primary}33` }}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/15"
          >
            <Text className="text-xl">{theme.emoji}</Text>
          </View>

          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold capitalize text-white">{item.aura_color} aura</Text>
            <Text className="text-xs text-slate-400">{formatDateLabel(item.created_at)}</Text>
          </View>

          <View className="items-end">
            <Text className="text-sm font-bold" style={{ color: theme.text }}>
              {item.energy_level}% ⚡
            </Text>
            <Text className="text-xs text-slate-400">😊 {item.mood_score ?? 0}</Text>
          </View>

          {selectable ? (
            <View className="ml-3">
              <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={selected ? '#a78bfa' : '#64748b'} />
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );

  if (!actionsEnabled || selectable) {
    return rowContent;
  }

  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <View className="mb-3 ml-2 flex-row overflow-hidden rounded-2xl">
          {(onShare || true) && (
            <Pressable
              onPress={handleShare}
              className="items-center justify-center px-4"
              style={{ backgroundColor: '#6d28d9' }}
            >
              <Ionicons name="share-social-outline" size={18} color="#ffffff" />
              <Text className="mt-1 text-[11px] font-semibold text-white">Share</Text>
            </Pressable>
          )}

          {onDelete ? (
            <Pressable
              onPress={() => {
                hapticSelection();
                onDelete(item.id);
              }}
              className="items-center justify-center px-4"
              style={{ backgroundColor: '#b91c1c' }}
            >
              <Ionicons name="trash-outline" size={18} color="#ffffff" />
              <Text className="mt-1 text-[11px] font-semibold text-white">Delete</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    >
      {rowContent}
    </Swipeable>
  );
}

export default function ReadingList({
  readings,
  onSelect,
  onDelete,
  onShare,
  groupByDate = true,
  selectable = false,
  onSelectionChange,
  onRefresh,
  refreshing = false,
  onEndReached,
  scrollEnabled = false,
}: ReadingListProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const sortedReadings = useMemo(
    () => [...readings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [readings]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [onSelectionChange, selectedIds]);

  useEffect(() => {
    if (!selectable && selectedIds.length) {
      setSelectedIds([]);
    }
  }, [selectable, selectedIds.length]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      return [...prev, id];
    });
  };

  const sections = useMemo<ReadingSection[]>(() => {
    if (!groupByDate) {
      return [{ title: 'All Readings', data: sortedReadings }];
    }

    const buckets: Record<string, Reading[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      Earlier: [],
    };

    sortedReadings.forEach((reading) => {
      buckets[sectionTitleForDate(reading.created_at)].push(reading);
    });

    return Object.entries(buckets)
      .filter(([, data]) => data.length > 0)
      .map(([title, data]) => ({ title, data }));
  }, [groupByDate, sortedReadings]);

  if (readings.length === 0) {
    return (
      <View className="items-center rounded-2xl border border-white/10 bg-[#0d1330]/70 px-5 py-12">
        <Text className="text-4xl">🔮</Text>
        <Text className="mt-4 text-lg font-bold text-slate-200">No readings yet</Text>
        <Text className="mt-1 text-center text-sm text-slate-400">Scan your first aura from Home to start your timeline.</Text>
      </View>
    );
  }

  const renderRow = (item: Reading, index: number) => (
    <ReadingRow
      item={item}
      index={index}
      selected={selectedSet.has(item.id)}
      selectable={selectable}
      onSelect={onSelect}
      onToggleSelect={toggleSelection}
      onDelete={onDelete}
      onShare={onShare}
    />
  );

  if (!groupByDate) {
    return (
      <FlatList
        data={sortedReadings}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderRow(item, index)}
        scrollEnabled={scrollEnabled}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.2}
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      scrollEnabled={scrollEnabled}
      stickySectionHeadersEnabled
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.2}
      renderSectionHeader={({ section }) => (
        <View className="mb-2 mt-1 rounded-xl border border-white/10 bg-[#0f1a3d]/85 px-3 py-2">
          <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-slate-300">{section.title}</Text>
        </View>
      )}
      renderItem={({ item, index }) => renderRow(item, index)}
      ListHeaderComponent={
        selectable && selectedIds.length > 0 ? (
          <View className="mb-3 rounded-xl border border-violet-300/30 bg-violet-500/15 px-3 py-2">
            <Text className="text-xs font-semibold text-violet-200">{selectedIds.length} selected</Text>
          </View>
        ) : null
      }
    />
  );
}

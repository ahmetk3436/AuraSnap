import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { useAuth } from '../../contexts/AuthContext';
import { hapticSelection } from '../../lib/haptics';

const TABS = [
  { name: 'home', label: 'Home', icon: 'sparkles', iconOutline: 'sparkles-outline' },
  { name: 'history', label: 'History', icon: 'time', iconOutline: 'time-outline' },
  { name: 'settings', label: 'Settings', icon: 'person', iconOutline: 'person-outline' },
] as const;

export default function ProtectedLayout() {
  const { isAuthenticated, isLoading, isGuest } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isDetailScreen = pathname.includes('/aura/') || pathname.includes('/paywall') || pathname.includes('/match');

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isGuest) {
      router.replace('/(auth)/login');
    }
  }, [isLoading, isAuthenticated, isGuest]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-950">
        <View className="w-12 h-12 rounded-full bg-violet-600/20 items-center justify-center">
          <Ionicons name="sparkles" size={24} color="#8b5cf6" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#050816]">
      <Animated.View
        key={pathname}
        entering={FadeIn.duration(240).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(180).easing(Easing.in(Easing.cubic))}
        style={{ flex: 1 }}
      >
        <Slot />
      </Animated.View>
      {!isDetailScreen && (
        <View
          className="px-4"
          style={{ paddingBottom: (insets.bottom || 12) + 8 }}
        >
          <View className="flex-row rounded-2xl border border-white/10 bg-[#0a1130]/95 px-2 py-2">
            {TABS.map((tab) => {
              const isActive = pathname === `/${tab.name}` || pathname === `/(protected)/${tab.name}`;
              return (
                <Pressable
                  key={tab.name}
                  onPress={() => {
                    const target = `/(protected)/${tab.name}` as any;
                    if (isActive) return;
                    hapticSelection();
                    router.navigate(target);
                  }}
                  className={`flex-1 items-center rounded-xl py-2 ${isActive ? 'bg-violet-500/20' : ''}`}
                >
                  <Ionicons
                    name={(isActive ? tab.icon : tab.iconOutline) as any}
                    size={22}
                    color={isActive ? '#c4b5fd' : '#64748b'}
                  />
                  <Text
                    className={`mt-1 text-[10px] font-medium ${
                      isActive ? 'text-violet-300' : 'text-slate-500'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

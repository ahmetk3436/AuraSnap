import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
const PENDING_DEEP_LINK_KEY = 'pending_deep_link';
const ROUTE_PERSISTENCE_KEY = 'last_route_v1';
const BOOT_TIMEOUT_MS = 5000;

function resolveInitialProtectedRoute(initialUrl: string | null): string | null {
  if (!initialUrl) return null;

  const parsed = Linking.parse(initialUrl);
  const rawPath = (parsed.path || '').replace(/^\/+/, '');
  const path = rawPath.toLowerCase();

  const rawId = parsed.queryParams?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  if (path.includes('match')) {
    if (id) {
      return `/(protected)/match?id=${encodeURIComponent(id)}`;
    }
    return '/(protected)/match';
  }

  if (path.includes('history')) return '/(protected)/history';
  if (path.includes('settings')) return '/(protected)/settings';
  if (path.includes('home')) return '/(protected)/home';

  return null;
}

function resolvePersistedRoute(route: string | null): string | null {
  if (!route) return null;
  if (!route.startsWith('/(protected)/')) return null;
  return route;
}

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isGuest, isLoading: authLoading } = useAuth();

  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [initialProtectedRoute, setInitialProtectedRoute] = useState<string | null>(null);
  const [persistedRoute, setPersistedRoute] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapTick, setBootstrapTick] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  const hasNavigatedRef = useRef(false);

  const orbScale = useSharedValue(1);
  const orbGlow = useSharedValue(0.4);

  useEffect(() => {
    orbScale.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    orbGlow.value = withRepeat(
      withSequence(withTiming(0.75, { duration: 1200 }), withTiming(0.35, { duration: 1200 })),
      -1,
      true
    );
  }, [orbGlow, orbScale]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
    opacity: orbGlow.value,
  }));

  const safeReplace = useCallback(
    (route: string) => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      router.replace(route as any);
    },
    [router]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setBootstrapError(null);
      setOnboardingComplete(null);
      setInitialProtectedRoute(null);
      setTimedOut(false);

      try {
        const [onboardedRaw, initialUrl, persisted] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
          Linking.getInitialURL(),
          AsyncStorage.getItem(ROUTE_PERSISTENCE_KEY),
        ]);

        if (!active) return;

        setOnboardingComplete(onboardedRaw === 'true' || onboardedRaw === '1');
        setInitialProtectedRoute(resolveInitialProtectedRoute(initialUrl));
        setPersistedRoute(resolvePersistedRoute(persisted));
      } catch (error) {
        if (!active) return;
        console.error('Bootstrap error:', error);
        setBootstrapError('Could not prepare app state.');
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [bootstrapTick]);

  useEffect(() => {
    if (bootstrapError) return;
    if (onboardingComplete !== null && !authLoading) return;

    const timeout = setTimeout(() => {
      setTimedOut(true);
    }, BOOT_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [authLoading, bootstrapError, onboardingComplete]);

  useEffect(() => {
    if (bootstrapError) return;

    if (timedOut && onboardingComplete === null) {
      safeReplace('/(auth)/login');
      return;
    }

    if (onboardingComplete === null) return;

    if (!onboardingComplete) {
      safeReplace('/onboarding');
      return;
    }

    if (authLoading && !timedOut) return;

    if (isAuthenticated || isGuest) {
      safeReplace(initialProtectedRoute || persistedRoute || '/(protected)/home');
      return;
    }

    if (initialProtectedRoute) {
      AsyncStorage.setItem(PENDING_DEEP_LINK_KEY, initialProtectedRoute).catch(() => undefined);
    }
    safeReplace('/(auth)/login');
  }, [
    authLoading,
    bootstrapError,
    initialProtectedRoute,
    isAuthenticated,
    isGuest,
    onboardingComplete,
    persistedRoute,
    safeReplace,
    timedOut,
  ]);

  const statusText = useMemo(() => {
    if (bootstrapError) return 'Could not prepare startup state';
    if (onboardingComplete === null) return 'Preparing onboarding...';
    if (authLoading && !timedOut) return 'Validating session...';
    if (timedOut) return 'Taking longer than expected...';
    return 'Launching AuraSnap...';
  }, [authLoading, bootstrapError, onboardingComplete, timedOut]);

  return (
    <SafeAreaView className="flex-1 bg-[#050816]">
      <LinearGradient colors={['#050816', '#0b1130', '#11183e']} style={{ flex: 1 }}>
        <View className="absolute left-[-80] top-[-20] h-64 w-64 rounded-full bg-violet-500/20" />
        <View className="absolute right-[-95] top-48 h-72 w-72 rounded-full bg-fuchsia-500/15" />

        <View className="flex-1 items-center justify-center px-8">
          <Animated.View style={orbStyle} className="absolute h-40 w-40 rounded-full bg-violet-500/20" />
          <LinearGradient
            colors={['#7c3aed', '#ec4899']}
            className="mb-5 h-20 w-20 items-center justify-center rounded-3xl"
          >
            <Ionicons name="sparkles" size={36} color="white" />
          </LinearGradient>

          <Text className="text-3xl font-bold text-white">AuraSnap</Text>
          <Text className="mt-1 text-sm text-slate-300">{statusText}</Text>

          {!bootstrapError && (
            <View className="mt-6 items-center">
              <ActivityIndicator size="small" color="#a78bfa" />
              {timedOut && (
                <Text className="mt-2 text-center text-xs text-slate-400">
                  Startup timed out. Redirecting to a safe route.
                </Text>
              )}
            </View>
          )}

          {bootstrapError && (
            <View className="mt-6 w-full max-w-xs rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
              <Text className="text-sm text-red-200">{bootstrapError}</Text>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => {
                    hasNavigatedRef.current = false;
                    setBootstrapTick((v) => v + 1);
                  }}
                  className="flex-1 rounded-lg bg-red-500/20 py-2.5 items-center"
                >
                  <Text className="text-xs font-semibold text-red-100">Retry</Text>
                </Pressable>
                <Pressable
                  onPress={() => safeReplace('/(auth)/login')}
                  className="flex-1 rounded-lg border border-red-300/20 py-2.5 items-center"
                >
                  <Text className="text-xs font-semibold text-red-100">Go Login</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

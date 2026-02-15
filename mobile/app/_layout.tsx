import '../global.css';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SubscriptionProvider } from '../contexts/SubscriptionContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import AppErrorBoundary from '../components/system/AppErrorBoundary';

const ROUTE_PERSISTENCE_KEY = 'last_route_v1';
const PENDING_DEEP_LINK_KEY = 'pending_deep_link';
const SPLASH_FAILSAFE_MS = 5000;

void SplashScreen.preventAutoHideAsync().catch(() => {
  // App can proceed if splash is already controlled by the runtime.
});

function RoutePersistence() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    AsyncStorage.setItem(ROUTE_PERSISTENCE_KEY, pathname).catch(() => undefined);
  }, [pathname]);

  return null;
}

function DeepLinkBridge() {
  const router = useRouter();
  const { isAuthenticated, isGuest } = useAuth();

  useEffect(() => {
    const sub = Linking.addEventListener('url', async ({ url }) => {
      const parsed = Linking.parse(url);
      const rawPath = (parsed.path || '').replace(/^\/+/, '').toLowerCase();

      let target: string | null = null;
      if (rawPath.includes('match')) {
        const rawId = parsed.queryParams?.id;
        const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
        target = id ? `/(protected)/match?id=${encodeURIComponent(id)}` : '/(protected)/match';
      } else if (rawPath.includes('history')) {
        target = '/(protected)/history';
      } else if (rawPath.includes('settings')) {
        target = '/(protected)/settings';
      } else if (rawPath.includes('home')) {
        target = '/(protected)/home';
      }

      if (!target) return;

      if (isAuthenticated || isGuest) {
        router.push(target as any);
        return;
      }

      await AsyncStorage.setItem(PENDING_DEEP_LINK_KEY, target);
      router.replace('/(auth)/login');
    });

    return () => {
      sub.remove();
    };
  }, [isAuthenticated, isGuest, router]);

  return null;
}

function RootNavigator() {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: themeLoading, colors } = useTheme();
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    const hideWhenReady = async () => {
      if (authLoading || themeLoading || splashHidden) return;
      await SplashScreen.hideAsync();
      setSplashHidden(true);
    };

    hideWhenReady().catch(() => undefined);
  }, [authLoading, splashHidden, themeLoading]);

  useEffect(() => {
    if (splashHidden) return;

    const timeout = setTimeout(() => {
      SplashScreen.hideAsync()
        .then(() => setSplashHidden(true))
        .catch(() => undefined);
    }, SPLASH_FAILSAFE_MS);

    return () => clearTimeout(timeout);
  }, [splashHidden]);

  const booting = authLoading || themeLoading;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={colors.statusBarStyle} />

      <RoutePersistence />
      <DeepLinkBridge />

      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 260,
          contentStyle: { backgroundColor: colors.stackBackground },
          gestureEnabled: true,
        }}
      />

      {booting && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center" style={{ backgroundColor: colors.appBackground }}>
          <View className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <Text className="text-xs font-semibold text-slate-200">Preparing app...</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 2,
            refetchOnReconnect: true,
            refetchOnMount: false,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <ToastProvider>
                  <AppErrorBoundary>
                    <RootNavigator />
                  </AppErrorBoundary>
                </ToastProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

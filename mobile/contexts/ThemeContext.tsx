import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'dark' | 'light' | 'system';

type ResolvedTheme = 'dark' | 'light';

interface ThemeColors {
  appBackground: string;
  stackBackground: string;
  statusBarStyle: 'light' | 'dark';
}

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  trueBlackEnabled: boolean;
  isLoading: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
  setTrueBlackEnabled: (enabled: boolean) => Promise<void>;
  reloadTheme: () => Promise<void>;
}

const STORAGE_THEME_MODE = 'theme_mode_v1';
const STORAGE_TRUE_BLACK = 'true_black_mode_v1';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function toResolvedTheme(mode: ThemeMode, deviceScheme: 'dark' | 'light' | null | undefined): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return deviceScheme === 'light' ? 'light' : 'dark';
}

function buildColors(resolved: ResolvedTheme, trueBlackEnabled: boolean): ThemeColors {
  if (resolved === 'light') {
    return {
      appBackground: '#e7edff',
      stackBackground: '#f1f5ff',
      statusBarStyle: 'dark',
    };
  }

  return {
    appBackground: trueBlackEnabled ? '#000000' : '#050816',
    stackBackground: trueBlackEnabled ? '#000000' : '#050816',
    statusBarStyle: 'light',
  };
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceScheme = useColorScheme();

  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [trueBlackEnabled, setTrueBlackState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const resolvedTheme = useMemo(() => toResolvedTheme(mode, deviceScheme), [deviceScheme, mode]);
  const colors = useMemo(() => buildColors(resolvedTheme, trueBlackEnabled), [resolvedTheme, trueBlackEnabled]);

  const loadFromStorage = useCallback(async () => {
    const entries = await AsyncStorage.multiGet([STORAGE_THEME_MODE, STORAGE_TRUE_BLACK]);
    const map = new Map(entries);

    const storedMode = map.get(STORAGE_THEME_MODE);
    if (storedMode === 'dark' || storedMode === 'light' || storedMode === 'system') {
      setModeState(storedMode);
    }

    const storedTrueBlack = map.get(STORAGE_TRUE_BLACK);
    setTrueBlackState(storedTrueBlack === 'true');
  }, []);

  useEffect(() => {
    loadFromStorage()
      .catch((err) => {
        console.error('Failed to load theme settings:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadFromStorage]);

  const setMode = useCallback(async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    await AsyncStorage.setItem(STORAGE_THEME_MODE, nextMode);
  }, []);

  const setTrueBlackEnabled = useCallback(async (enabled: boolean) => {
    setTrueBlackState(enabled);
    await AsyncStorage.setItem(STORAGE_TRUE_BLACK, String(enabled));
  }, []);

  const reloadTheme = useCallback(async () => {
    await loadFromStorage();
  }, [loadFromStorage]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolvedTheme,
        trueBlackEnabled,
        isLoading,
        colors,
        setMode,
        setTrueBlackEnabled,
        reloadTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

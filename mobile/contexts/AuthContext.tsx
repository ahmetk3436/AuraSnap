import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import {
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from '../lib/storage';
import { hapticSuccess, hapticError } from '../lib/haptics';
import type { User, AuthResponse } from '../types/auth';

const GUEST_USAGE_KEY = 'guest_usage_count';
const GUEST_MODE_KEY = 'guest_mode';
const GUEST_ID_KEY = 'guest_id';
const GUEST_STARTED_AT_KEY = 'guest_started_at';
const GUEST_AURA_HISTORY_STORAGE_KEY = 'guest_aura_history_v1';
const MAX_GUEST_SCANS = 3;
const GUEST_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function calculateGuestDaysRemaining(startedAt: string): number {
  const ts = new Date(startedAt).getTime();
  if (!Number.isFinite(ts)) return GUEST_RETENTION_DAYS;
  const elapsedDays = Math.floor((Date.now() - ts) / DAY_MS);
  return Math.max(0, GUEST_RETENTION_DAYS - elapsedDays);
}

function createGuestId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `guest_${Date.now().toString(36)}_${rand()}${rand()}`;
}

function guestCredentials(guestId: string): { email: string; password: string } {
  const compact = guestId.replace(/[^a-zA-Z0-9]/g, '').slice(-20);
  return {
    email: `${guestId}@guest.local`,
    password: `Guest!${compact}9`,
  };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  user: User | null;
  guestUsageCount: number;
  guestDaysRemaining: number | null;
  canUseFeature: () => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithApple: (identityToken: string, authCode: string, fullName?: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  incrementGuestUsage: () => Promise<number>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [guestUsageCount, setGuestUsageCount] = useState(0);
  const [guestDaysRemaining, setGuestDaysRemaining] = useState<number | null>(null);

  const isAuthenticated = user !== null;

  const ensureGuestId = useCallback(async (): Promise<string> => {
    const existing = await AsyncStorage.getItem(GUEST_ID_KEY);
    if (existing && existing.startsWith('guest_')) {
      return existing;
    }
    const next = createGuestId();
    await AsyncStorage.setItem(GUEST_ID_KEY, next);
    return next;
  }, []);

  const ensureGuestStartedAt = useCallback(async (): Promise<string> => {
    const raw = await AsyncStorage.getItem(GUEST_STARTED_AT_KEY);
    if (raw) {
      const ts = new Date(raw).getTime();
      if (Number.isFinite(ts)) return raw;
    }
    const now = new Date().toISOString();
    await AsyncStorage.setItem(GUEST_STARTED_AT_KEY, now);
    return now;
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        // Check guest mode
        const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
        if (guestMode === 'true') {
          await ensureGuestId();
          let startedAt = await ensureGuestStartedAt();
          let remainingDays = calculateGuestDaysRemaining(startedAt);

          if (remainingDays <= 0) {
            await AsyncStorage.multiRemove([GUEST_AURA_HISTORY_STORAGE_KEY, GUEST_USAGE_KEY]);
            startedAt = new Date().toISOString();
            await AsyncStorage.multiSet([
              [GUEST_STARTED_AT_KEY, startedAt],
              [GUEST_USAGE_KEY, '0'],
            ]);
            remainingDays = GUEST_RETENTION_DAYS;
            setGuestUsageCount(0);
          } else {
            const usage = await AsyncStorage.getItem(GUEST_USAGE_KEY);
            setGuestUsageCount(usage ? parseInt(usage, 10) : 0);
          }

          setGuestDaysRemaining(remainingDays);
          setIsGuest(true);
          setIsLoading(false);
          return;
        }

        // Check auth token
        const token = await getAccessToken();
        if (token) {
          const { data } = await api.get('/health');
          if (data.status === 'ok') {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUser({ id: payload.sub, email: payload.email });
            // If user is authenticated, exit guest mode
            setIsGuest(false);
            setGuestDaysRemaining(null);
          }
        }
      } catch {
        await AsyncStorage.multiRemove([
          GUEST_MODE_KEY,
          GUEST_USAGE_KEY,
          GUEST_ID_KEY,
          GUEST_STARTED_AT_KEY,
          GUEST_AURA_HISTORY_STORAGE_KEY,
        ]);
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, [ensureGuestId, ensureGuestStartedAt]);

  const canUseFeature = useCallback(() => {
    if (isAuthenticated) return true;
    return guestUsageCount < MAX_GUEST_SCANS;
  }, [isAuthenticated, guestUsageCount]);

  const incrementGuestUsage = useCallback(async () => {
    const newCount = guestUsageCount + 1;
    setGuestUsageCount(newCount);
    await AsyncStorage.setItem(GUEST_USAGE_KEY, String(newCount));
    return newCount;
  }, [guestUsageCount]);

  const continueAsGuest = useCallback(async () => {
    await clearTokens();
    const guestId = await ensureGuestId();
    const creds = guestCredentials(guestId);

    try {
      let data: AuthResponse;
      try {
        const loginRes = await api.post<AuthResponse>('/auth/login', creds);
        data = loginRes.data;
      } catch {
        const registerRes = await api.post<AuthResponse>('/auth/register', creds);
        data = registerRes.data;
      }
      await setTokens(data.access_token, data.refresh_token);
    } catch {
      // If anonymous backend session fails, guest mode still works for local limits/UI.
    }

    await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
    await AsyncStorage.setItem(GUEST_USAGE_KEY, '0');
    await AsyncStorage.setItem(GUEST_STARTED_AT_KEY, new Date().toISOString());
    await AsyncStorage.setItem('onboarding_complete', 'true');
    setUser(null);
    setIsGuest(true);
    setGuestUsageCount(0);
    setGuestDaysRemaining(GUEST_RETENTION_DAYS);
  }, [ensureGuestId]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const guestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const payload: Record<string, string> = { email, password };
      if (guestId) payload.guest_id = guestId;
      const { data } = await api.post<AuthResponse>('/auth/login', payload);
      await setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      setIsGuest(false);
      setGuestDaysRemaining(null);
      await AsyncStorage.multiRemove([GUEST_MODE_KEY, GUEST_USAGE_KEY, GUEST_ID_KEY, GUEST_STARTED_AT_KEY]);
      hapticSuccess();
    } catch (err) {
      hapticError();
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    try {
      const guestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
      const endpoint = guestMode === 'true' ? '/auth/claim' : '/auth/register';
      const payload: Record<string, string> = { email, password };
      if (guestId) payload.guest_id = guestId;
      let data: AuthResponse;
      try {
        const primaryRes = await api.post<AuthResponse>(endpoint, payload);
        data = primaryRes.data;
      } catch (err: any) {
        // Backward-compatible fallback for older backend versions without /auth/claim.
        if (endpoint === '/auth/claim' && (err?.response?.status === 404 || err?.response?.status === 405)) {
          const fallbackRes = await api.post<AuthResponse>('/auth/register', payload);
          data = fallbackRes.data;
        } else {
          throw err;
        }
      }
      await setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      setIsGuest(false);
      setGuestDaysRemaining(null);
      await AsyncStorage.multiRemove([GUEST_MODE_KEY, GUEST_USAGE_KEY, GUEST_ID_KEY, GUEST_STARTED_AT_KEY]);
      hapticSuccess();
    } catch (err) {
      hapticError();
      throw err;
    }
  }, []);

  const loginWithApple = useCallback(
    async (identityToken: string, authCode: string, fullName?: string, email?: string) => {
      try {
        const guestId = await AsyncStorage.getItem(GUEST_ID_KEY);
        const payload: Record<string, string> = {
          identity_token: identityToken,
          authorization_code: authCode,
        };
        if (fullName) payload.full_name = fullName;
        if (email) payload.email = email;
        if (guestId) payload.guest_id = guestId;
        const { data } = await api.post<AuthResponse>('/auth/apple', payload);
        await setTokens(data.access_token, data.refresh_token);
        setUser(data.user);
        setIsGuest(false);
        setGuestDaysRemaining(null);
        await AsyncStorage.multiRemove([GUEST_MODE_KEY, GUEST_USAGE_KEY, GUEST_ID_KEY, GUEST_STARTED_AT_KEY]);
        hapticSuccess();
      } catch (err) {
        hapticError();
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      }
    } catch {
      // Ignore logout API errors
    } finally {
      await clearTokens();
      await AsyncStorage.multiRemove([GUEST_MODE_KEY, GUEST_USAGE_KEY, GUEST_ID_KEY, GUEST_STARTED_AT_KEY]);
      setUser(null);
      setIsGuest(false);
      setGuestUsageCount(0);
      setGuestDaysRemaining(null);
    }
  }, []);

  const deleteAccount = useCallback(
    async (password?: string) => {
      await api.delete('/auth/account', {
        data: { password: password || '' },
      });
      await clearTokens();
      setUser(null);
      hapticSuccess();
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isGuest,
        user,
        guestUsageCount,
        guestDaysRemaining,
        canUseFeature,
        login,
        register,
        loginWithApple,
        logout,
        deleteAccount,
        continueAsGuest,
        incrementGuestUsage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

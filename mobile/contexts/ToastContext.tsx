import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

type ToastKind = 'success' | 'error' | 'info';

interface ToastPayload {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextType {
  showToast: (message: string, kind?: ToastKind, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_STYLES: Record<ToastKind, { container: string; text: string }> = {
  success: {
    container: 'bg-emerald-500/95 border border-emerald-300/50',
    text: 'text-white',
  },
  error: {
    container: 'bg-red-500/95 border border-red-300/50',
    text: 'text-white',
  },
  info: {
    container: 'bg-violet-600/95 border border-violet-300/50',
    text: 'text-white',
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -8,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast(null);
    });
  }, [opacity, translateY]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info', durationMs = 2800) => {
      if (!message.trim()) return;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const nextToast: ToastPayload = {
        id: Date.now(),
        message,
        kind,
      };
      setToast(nextToast);

      opacity.setValue(0);
      translateY.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 180,
          mass: 0.5,
        }),
      ]).start();

      timeoutRef.current = setTimeout(() => {
        hide();
      }, durationMs);
    },
    [hide, opacity, translateY]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && (
        <View pointerEvents="none" className="absolute left-0 right-0 top-12 z-50 items-center px-4">
          <Animated.View
            style={{
              opacity,
              transform: [{ translateY }],
              maxWidth: 440,
              width: '100%',
            }}
            className={`rounded-2xl px-4 py-3 shadow-lg ${TOAST_STYLES[toast.kind].container}`}
          >
            <Text className={`text-sm font-semibold ${TOAST_STYLES[toast.kind].text}`}>{toast.message}</Text>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

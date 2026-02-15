import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { hapticError, hapticSelection, hapticSuccess } from '../../lib/haptics';

const PENDING_DEEP_LINK_KEY = 'pending_deep_link';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, continueAsGuest } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PENDING_DEEP_LINK_KEY)
      .then((value) => {
        if (value && value.startsWith('/(protected)/')) {
          setPendingRoute(value);
        }
      })
      .catch(() => undefined);
  }, []);

  const resolvePostAuthRoute = async () => {
    const stored = pendingRoute || (await AsyncStorage.getItem(PENDING_DEEP_LINK_KEY));
    if (stored && stored.startsWith('/(protected)/')) {
      await AsyncStorage.removeItem(PENDING_DEEP_LINK_KEY);
      return stored;
    }
    return '/(protected)/home';
  };

  const handleRegister = async () => {
    setIsLoading(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Please fill in all fields.');
      setIsLoading(false);
      hapticError();
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setIsLoading(false);
      hapticError();
      return;
    }

    try {
      await register(normalizedEmail, password);
      hapticSuccess();
      const nextRoute = await resolvePostAuthRoute();
      router.replace(nextRoute as any);
    } catch (err: any) {
      hapticError();
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleGuestMode = async () => {
    hapticSelection();
    setError('');
    setIsGuestLoading(true);

    try {
      await continueAsGuest();
      const nextRoute = await resolvePostAuthRoute();
      router.replace(nextRoute as any);
    } catch {
      hapticError();
      setError('Guest mode is currently unavailable. Please try again.');
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050816]">
      <LinearGradient colors={['#050816', '#0b1130', '#11183e']} style={{ flex: 1 }}>
        <View className="absolute left-[-70] top-[-20] h-60 w-60 rounded-full bg-violet-500/20" />
        <View className="absolute right-[-90] top-52 h-72 w-72 rounded-full bg-fuchsia-500/15" />

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }}
          >
            <View className="mb-8 items-center">
              <LinearGradient
                colors={['#7c3aed', '#ec4899']}
                className="mb-4 h-20 w-20 items-center justify-center rounded-3xl"
              >
                <Ionicons name="sparkles" size={36} color="white" />
              </LinearGradient>
              <Text className="text-3xl font-bold text-white">Join AuraSnap</Text>
              <Text className="mt-1 text-sm text-slate-300">Create a free account in seconds</Text>
            </View>

            <View className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-5">
              <Text className="text-xl font-bold text-white">Create account</Text>
              <Text className="mt-1 text-sm text-slate-300">Unlock full aura history and matching</Text>

              <View className="mt-5">
                <Input
                  label="Email"
                  placeholder="email@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Input
                  label="Password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              {error ? (
                <View className="mb-4 rounded-xl border border-red-500/30 bg-red-500/15 p-3">
                  <Text className="text-sm text-red-300">{error}</Text>
                </View>
              ) : null}

              <Button
                onPress={handleRegister}
                disabled={isLoading || isGuestLoading}
                variant="primary"
                className="w-full"
              >
                {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : 'Create Account'}
              </Button>
            </View>

            <Pressable
              disabled={isLoading || isGuestLoading}
              onPress={handleGuestMode}
              className={`mb-6 rounded-2xl border border-violet-300/25 bg-violet-500/10 px-4 py-3.5 ${
                isLoading || isGuestLoading ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-center text-base font-semibold text-violet-200">
                {isGuestLoading ? 'Entering Guest Mode...' : 'Try Guest Mode'}
              </Text>
              <Text className="mt-1 text-center text-xs text-violet-200/80">Start with 3 free scans</Text>
            </Pressable>

            <View className="flex-row items-center justify-center">
              <Text className="text-slate-400">Already have an account? </Text>
              <Pressable onPress={() => router.push('/(auth)/login')}>
                <Text className="font-semibold text-violet-300">Sign In</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

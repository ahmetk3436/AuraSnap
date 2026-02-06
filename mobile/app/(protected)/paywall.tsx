import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { PurchasesPackage } from '../../lib/purchases';
import { hapticSuccess, hapticMedium } from '../../lib/haptics';

export default function PaywallScreen() {
  const { offerings, isLoading, handlePurchase, handleRestore } =
    useSubscription();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePackagePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    try {
      const success = await handlePurchase(pkg);
      if (success) {
        hapticSuccess();
        Alert.alert('Success', 'Welcome to AuraSnap Premium!');
        router.back();
      } else {
        Alert.alert('Error', 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestorePurchases = async () => {
    hapticMedium();
    const success = await handleRestore();
    if (success) {
      hapticSuccess();
      Alert.alert('Success', 'Premium restored!');
      router.back();
    } else {
      Alert.alert('Not Found', 'No previous purchases found.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-950">
        <ActivityIndicator size="large" color="#8b5cf6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="items-center px-6 pb-6 pt-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-violet-600/20">
            <Ionicons name="sparkles" size={40} color="#8b5cf6" />
          </View>
          <Text className="mb-2 text-3xl font-bold text-white">
            AuraSnap Premium
          </Text>
          <Text className="text-center text-base text-gray-400">
            Unlock the full power of your aura
          </Text>
        </View>

        {/* Features */}
        <View className="px-6 py-6">
          <Feature icon="infinite" text="Unlimited aura scans" color="#8b5cf6" />
          <Feature icon="color-palette" text="Unlock rare aura colors" color="#ec4899" />
          <Feature icon="people" text="Unlimited friend matches" color="#3b82f6" />
          <Feature icon="analytics" text="Detailed aura reports" color="#22c55e" />
          <Feature icon="time" text="Full scan history" color="#f59e0b" />
          <Feature icon="ban" text="No advertisements" color="#ef4444" />
        </View>

        {/* Packages */}
        {offerings?.availablePackages.map((pkg: PurchasesPackage) => (
          <TouchableOpacity
            key={pkg.identifier}
            className="mx-6 mb-4 flex-row items-center rounded-2xl border border-violet-500/30 bg-gray-800/50 p-5"
            onPress={() => handlePackagePurchase(pkg)}
            disabled={purchasing === pkg.identifier}
            style={purchasing === pkg.identifier ? { opacity: 0.7 } : undefined}
          >
            <View className="flex-1">
              <Text className="mb-1 text-lg font-semibold text-white">
                {pkg.product.title}
              </Text>
              <Text className="mb-2 text-sm text-gray-400">
                {pkg.product.description}
              </Text>
              <Text className="text-2xl font-bold text-violet-400">
                {pkg.product.priceString}
              </Text>
            </View>
            {purchasing === pkg.identifier && (
              <ActivityIndicator color="#8b5cf6" style={{ marginLeft: 16 }} />
            )}
          </TouchableOpacity>
        ))}

        {/* Restore */}
        <TouchableOpacity
          className="mx-6 mt-2 items-center rounded-xl border border-violet-600 p-4"
          onPress={handleRestorePurchases}
        >
          <Text className="text-base font-semibold text-violet-400">
            Restore Purchases
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text className="mx-6 mb-8 mt-4 text-center text-xs text-gray-500">
          Subscription automatically renews unless canceled 24 hours before the
          end of the current period. Cancel anytime in Settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <View className="mb-4 flex-row items-center">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}20` }}
      >
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={20}
          color={color}
        />
      </View>
      <Text className="ml-4 text-base text-gray-300">{text}</Text>
    </View>
  );
}

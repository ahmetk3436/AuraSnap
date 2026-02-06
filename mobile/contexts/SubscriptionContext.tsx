import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  checkSubscriptionStatus,
  purchasePackage,
  restorePurchases,
  getOfferings,
  initializePurchases,
  PurchasesPackage,
  PurchasesOffering,
} from '../lib/purchases';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
  offerings: PurchasesOffering | null;
  checkSubscription: () => Promise<void>;
  handlePurchase: (pkg: PurchasesPackage) => Promise<boolean>;
  handleRestore: () => Promise<boolean>;
  refreshOfferings: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
  undefined,
);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);

  const checkSubscription = async () => {
    try {
      const subscribed = await checkSubscriptionStatus();
      setIsSubscribed(subscribed);
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (
    pkg: PurchasesPackage,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        setIsSubscribed(true);
      }
      return success;
    } catch (error) {
      console.error('Purchase error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await restorePurchases();
      if (success) {
        setIsSubscribed(true);
      }
      return success;
    } catch (error) {
      console.error('Restore error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshOfferings = async () => {
    try {
      const offeringsData = await getOfferings();
      setOfferings(offeringsData);
    } catch (error) {
      console.error('Error fetching offerings:', error);
    }
  };

  useEffect(() => {
    initializePurchases();
    checkSubscription();
    refreshOfferings();
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        isLoading,
        offerings,
        checkSubscription,
        handlePurchase,
        handleRestore,
        refreshOfferings,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

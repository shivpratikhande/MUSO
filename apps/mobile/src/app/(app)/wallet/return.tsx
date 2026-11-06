import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { LoadingState, Screen } from '@/components/ui';

/** Deep-link target for MUSO's wallet page ("Return to MUSO"). Screens refetch on focus. */
export default function WalletReturn() {
  useEffect(() => {
    const id = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <LoadingState label="Returning to MUSO…" />
    </Screen>
  );
}

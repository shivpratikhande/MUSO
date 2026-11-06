import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { LoadingState, Screen } from '@/components/ui';

/** Deep-link target after World App finishes (`return_to`). The card keeps polling for the proof. */
export default function HumanReturn() {
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

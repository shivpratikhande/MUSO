import { router } from 'expo-router';
import { useEffect } from 'react';
import { LoadingState, Screen } from '@/components/ui';

/**
 * Deep-link target for hosted checkouts. Normally the in-app browser session captures the
 * redirect; if the OS opens the link instead, just return to where the user was — the
 * checkout screen (or background reconciliation) verifies the payment with the server.
 */
export default function PaymentReturn() {
  useEffect(() => {
    const id = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <Screen edges={['bottom']}>
      <LoadingState label="Returning to MUSO…" />
    </Screen>
  );
}

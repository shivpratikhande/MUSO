import type { MyProfile } from '@muso/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppText, Button, Card, FormError } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { openWalletPage } from './walletPage';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Onboarding: optionally link a USDC payout wallet (MetaMask / Coinbase Wallet / browser). */
export function WalletStep({
  profile,
  submitLabel,
  onSaved,
}: {
  profile: MyProfile;
  submitLabel: string;
  onSaved: (p: MyProfile) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['arc', 'wallet'], queryFn: () => api.arc.wallet() });
  // Linking finishes in the wallet app: refresh when the user comes back.
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const link = useMutation({
    mutationFn: () => openWalletPage((returnUrl) => api.arc.walletLink(returnUrl)),
    onSuccess: () => void refetch(),
    onError: (e) => setError(errorMessage(e)),
  });
  const address = q.data?.address ?? null;

  return (
    <>
      <Card>
        <AppText variant="label" tone="muted">
          How it works
        </AppText>
        <AppText variant="caption">
          1. Tap Link wallet and choose your wallet app (e.g. MetaMask).
        </AppText>
        <AppText variant="caption">
          2. Approve, then sign a message. It’s free: no transaction.
        </AppText>
        <AppText variant="caption">3. Come back here. Done.</AppText>
      </Card>
      {address ? (
        <Card inverse>
          <AppText variant="label" tone="inverse">
            Wallet linked ✓
          </AppText>
          <AppText variant="title" tone="inverse">
            {short(address)}
          </AppText>
        </Card>
      ) : null}
      <FormError message={error} />
      {address ? (
        <Button label={submitLabel} onPress={() => onSaved(profile)} />
      ) : (
        <>
          <Button
            label="Link wallet"
            loading={link.isPending}
            onPress={() => {
              setError(null);
              link.mutate();
            }}
          />
          <Button label="Skip for now" variant="ghost" onPress={() => onSaved(profile)} />
        </>
      )}
    </>
  );
}

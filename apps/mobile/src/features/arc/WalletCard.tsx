import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { AppText, Button, Card, FormError } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { openWalletPage } from './walletPage';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Creator's payout wallet for on-chain (Arc, USDC) reward pools. */
export function WalletCard() {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['arc', 'wallet'], queryFn: () => api.arc.wallet() });
  // Linking finishes in the browser / wallet app: refresh when the user comes back.
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const link = useMutation({
    mutationFn: () => openWalletPage((returnUrl) => api.arc.walletLink(returnUrl)),
    onSuccess: () => void q.refetch(),
    onError: (e) => setError(errorMessage(e)),
  });
  const unlink = useMutation({
    mutationFn: () => api.arc.unlinkWallet(),
    onSuccess: () => void q.refetch(),
    onError: (e) => setError(errorMessage(e)),
  });
  const address = q.data?.address ?? null;
  const ensName = q.data?.ensName ?? null;

  return (
    <Card>
      <AppText variant="label" tone="muted">
        USDC payout wallet · Arc
      </AppText>
      {address ? (
        ensName ? (
          <View>
            <AppText variant="bodyStrong" selectable>
              {ensName}
            </AppText>
            <AppText variant="caption" tone="muted">
              ENS name for {short(address)} · anyone can pay you at this name
            </AppText>
          </View>
        ) : (
          <AppText variant="bodyStrong">{short(address)}</AppText>
        )
      ) : (
        <AppText variant="caption">
          Some reward pools are funded on Arc and pay creators in USDC, directly to your wallet.
          MUSO pays the network fees.
          {ensName ? ` Link a wallet and your ENS name ${ensName} will point to it.` : ''}
        </AppText>
      )}
      <FormError message={error} />
      <View style={{ flexDirection: 'row', gap: t.space.sm }}>
        <Button
          size="sm"
          variant={address ? 'secondary' : 'primary'}
          label={address ? 'Change wallet' : 'Link wallet'}
          loading={link.isPending}
          onPress={() => {
            setError(null);
            link.mutate();
          }}
        />
        {address ? (
          <Button
            size="sm"
            variant="ghost"
            label="Unlink"
            loading={unlink.isPending}
            onPress={() =>
              Alert.alert(
                'Unlink this wallet?',
                'Rewards that were already sent stay in it. New on-chain rewards wait until you link a wallet again.',
                [
                  { text: 'Keep' },
                  { text: 'Unlink', style: 'destructive', onPress: () => unlink.mutate() },
                ],
              )
            }
          />
        ) : null}
      </View>
    </Card>
  );
}

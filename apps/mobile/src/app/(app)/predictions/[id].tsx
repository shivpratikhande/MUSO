import { PREDICTION_TEMPLATE_INFO } from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  FormError,
  LoadingState,
  Pill,
  TextField,
} from '@/components/ui';
import { openWalletPage } from '@/features/arc/walletPage';
import { OptionBar, STATUS, usdc } from '@/features/predictions/PredictionCard';
import { predictionKeys } from '@/features/predictions/PredictionsSection';
import { VerifyHumanCard } from '@/features/world-id/VerifyHumanCard';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function PredictionScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: predictionKeys.one(id),
    queryFn: () => api.predictions.get(id),
    refetchInterval: 15_000,
  });
  // Picks finish in the wallet page: refresh when the user comes back.
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const [option, setOption] = useState<number | null>(null);
  const [stake, setStake] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = (p?: Awaited<ReturnType<typeof api.predictions.get>>) => {
    if (p) qc.setQueryData(predictionKeys.one(id), p);
    void qc.invalidateQueries({ queryKey: ['predictions'] });
  };

  const pick = useMutation({
    mutationFn: () =>
      openWalletPage((returnUrl) =>
        api.predictions.pickLink(id, { option: option!, stakeUsdc: Number(stake), returnUrl }),
      ),
    onSuccess: () => refresh(),
    onError: (e) => setError(errorMessage(e)),
  });
  const settle = useMutation({
    mutationFn: (o: number) => api.predictions.settle(id, o),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.predictions.cancel(id),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const s = STATUS[p.status];
  const total = Number(p.totalMicro);
  const min = Number(p.minStakeMicro) / 1e6;
  const max = Number(p.maxStakeMicro) / 1e6;
  const stakeNum = Number(stake);
  const canPick = p.status === 'OPEN' && !p.myPick;
  const stakeOk = stakeNum >= min && stakeNum <= max;
  const suggestions = [...new Set([min, Math.min(max, 5), Math.min(max, 10), max])].filter(
    (v) => v >= min,
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ padding: t.space.lg, gap: t.space.lg, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl refreshing={q.isRefetching} onRefresh={() => void refetch()} />
      }
    >
      <Stack.Screen options={{ title: PREDICTION_TEMPLATE_INFO[p.template].label }} />
      <View style={{ gap: t.space.sm }}>
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          <Pill label={s.label} tone={s.tone} />
          {p.humanOnly ? <Pill label="Verified humans" /> : null}
          <Pill label="Test USDC · Arc" />
        </View>
        <AppText variant="title">{p.question}</AppText>
        <AppText tone="muted">
          {p.status === 'OPEN'
            ? `Picks close ${when(p.locksAt)}.`
            : p.status === 'LOCKED'
              ? p.resolution === 'DATA'
                ? `Picks are closed. MUSO settles it from verified watch time at ${when(p.settlesAt!)}.`
                : 'Picks are closed. Waiting for the organizer to declare the result.'
              : p.status === 'PENDING'
                ? 'Being set up on Arc. This takes a few seconds.'
                : (p.note ?? 'The result is in. Winners are paid automatically.')}
        </AppText>
      </View>

      <Card>
        <AppText variant="label" tone="muted">
          {canPick ? 'Choose your pick' : 'Options'}
        </AppText>
        {p.options.map((o) => {
          const selected = option === o.index;
          const won = p.winningOption === o.index && p.status === 'SETTLED';
          return (
            <Pressable
              key={o.index}
              disabled={!canPick}
              accessibilityRole={canPick ? 'radio' : undefined}
              accessibilityState={{ selected }}
              onPress={() => setOption(o.index)}
              style={{
                gap: t.space.xs,
                padding: t.space.md,
                borderRadius: t.radius.md,
                borderWidth: 1.5,
                borderColor: selected ? t.c.text : t.c.border,
                backgroundColor: selected ? t.c.surfaceMuted : 'transparent',
              }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.sm }}
              >
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {won ? '🏆 ' : ''}
                  {o.label}
                  {p.myPick?.option === o.index ? '  · your pick' : ''}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {o.multiplier ? `pays ${o.multiplier}×` : 'no picks yet'}
                </AppText>
              </View>
              <OptionBar share={total ? Number(o.totalMicro) / total : 0} highlight={won} />
              <AppText variant="caption" tone="muted">
                {usdc(o.totalMicro)} · {o.pickers} {o.pickers === 1 ? 'pick' : 'picks'}
                {o.watchSeconds !== null ? ` · ${o.watchSeconds}s verified watch time` : ''}
              </AppText>
            </Pressable>
          );
        })}
        <AppText variant="caption" tone="muted">
          Pool {usdc(p.totalMicro)}
          {p.creatorSharePct ? ` · ${p.creatorSharePct}% goes to the winning creator` : ''}. Winners
          split the rest by stake.
        </AppText>
      </Card>

      {canPick ? (
        <Card>
          <TextField
            label={`Your stake (${min}–${max} test USDC)`}
            keyboardType="decimal-pad"
            value={stake}
            onChangeText={setStake}
            placeholder={String(min)}
            error={stake && !stakeOk ? `Between ${min} and ${max}` : undefined}
          />
          <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
            {suggestions.map((v) => (
              <Chip
                key={v}
                label={`${v} USDC`}
                selected={stakeNum === v}
                onPress={() => setStake(String(v))}
              />
            ))}
          </View>
          <FormError message={error} />
          <Button
            label={option === null ? 'Choose an option' : `Pick “${p.options[option]!.label}”`}
            disabled={option === null || !stakeOk}
            loading={pick.isPending}
            onPress={() => {
              setError(null);
              pick.mutate();
            }}
          />
          <AppText variant="caption" tone="muted">
            Opens your wallet. Your stake goes into the PredictionPools contract on Arc, not to
            MUSO. Get free test USDC at faucet.circle.com (Arc Testnet).
          </AppText>
        </Card>
      ) : null}

      {p.myPick ? (
        <Card inverse>
          <AppText variant="label" tone="inverse">
            Your pick
          </AppText>
          <AppText variant="heading" tone="inverse">
            {p.options[p.myPick.option]?.label} · {usdc(p.myPick.stakeMicro)}
          </AppText>
          <AppText variant="caption" tone="inverse">
            {p.myPick.status === 'PAID'
              ? `Paid ${usdc(p.myPick.payoutMicro ?? '0')} to your wallet.`
              : p.myPick.status === 'LOST'
                ? 'Not this time. Better luck at the next event!'
                : 'Locked in on-chain. If you win, MUSO sends your winnings and pays the gas.'}
          </AppText>
          {(p.myPick.payoutTxUrl ?? p.myPick.pickTxUrl) ? (
            <Button
              size="sm"
              variant="secondary"
              label="View transaction"
              onPress={() => void Linking.openURL((p.myPick!.payoutTxUrl ?? p.myPick!.pickTxUrl)!)}
            />
          ) : null}
        </Card>
      ) : null}

      {p.humanOnly && canPick ? (
        <VerifyHumanCard reason="One person, one pick: only verified humans can play this prediction." />
      ) : null}

      {p.canManage && (p.status === 'LOCKED' || p.status === 'OPEN' || p.status === 'PENDING') ? (
        <Card>
          <AppText variant="label" tone="muted">
            Organizer
          </AppText>
          {p.status === 'LOCKED' && p.resolution === 'MANUAL' ? (
            <>
              <AppText variant="caption">Declare the result. This is final and on-chain.</AppText>
              <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
                {p.options.map((o) => (
                  <Button
                    key={o.index}
                    size="sm"
                    variant="secondary"
                    label={o.label}
                    loading={settle.isPending && settle.variables === o.index}
                    onPress={() =>
                      Alert.alert(`“${o.label}” won?`, 'Winners are paid automatically.', [
                        { text: 'Not yet' },
                        { text: 'Declare winner', onPress: () => settle.mutate(o.index) },
                      ])
                    }
                  />
                ))}
              </View>
            </>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            label="Cancel and refund everyone"
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert('Cancel this prediction?', 'Every stake goes back to its wallet.', [
                { text: 'Keep it' },
                { text: 'Cancel it', style: 'destructive', onPress: () => cancel.mutate() },
              ])
            }
          />
          <FormError message={!canPick ? error : null} />
        </Card>
      ) : null}

      <Card>
        <AppText variant="label" tone="muted">
          How it works
        </AppText>
        <AppText variant="caption">
          On-chain (Arc): your stake, the pool totals, the lock, the result and every payout.
          Off-chain (MUSO): the question, the one-person-one-pick check
          {p.resolution === 'DATA' ? ' and counting verified watch time for the result' : ''}. If
          the result isn’t declared by {when(p.resolveBy)}, everyone can take their stake back.
          Testnet prediction game: no real money.
        </AppText>
        {p.contractUrl ? (
          <Button
            size="sm"
            variant="ghost"
            label={`Market #${p.chainMarketId ?? '…'} on Arc`}
            onPress={() => void Linking.openURL(p.settleTxUrl ?? p.createTxUrl ?? p.contractUrl!)}
          />
        ) : null}
      </Card>
    </ScrollView>
  );
}

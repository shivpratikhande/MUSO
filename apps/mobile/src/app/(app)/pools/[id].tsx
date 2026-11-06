import { formatMoney, type ArcPayoutStatusDto, type RewardPoolStatusDto } from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  AppText,
  Avatar,
  Button,
  Card,
  ErrorState,
  FormError,
  LoadingState,
  Pill,
} from '@/components/ui';
import { openWalletPage } from '@/features/arc/walletPage';
import { VerifyHumanCard } from '@/features/world-id/VerifyHumanCard';
import { newIdempotencyKey, runCheckout } from '@/features/money/checkout';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const STATUS: Record<RewardPoolStatusDto, string> = {
  DRAFT: 'Draft · not funded',
  FUNDED: 'Funded · starts soon',
  ACTIVE: '● Active',
  COMPLETED: 'Ended · distributing',
  DISTRIBUTED: 'Distributed',
  CANCELLED: 'Cancelled',
};
const PAYOUT: Record<ArcPayoutStatusDto, string> = {
  WAITING_WALLET: 'Waiting for the creator to link a wallet',
  AWARDED: 'Awarded on-chain · sending',
  CLAIMED: 'Paid in USDC',
  SKIPPED: 'Not paid on-chain',
};
const usdc = (micro: string) => `${(Number(micro) / 1e6).toFixed(2)} USDC`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function PoolScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['pools', id],
    queryFn: () => api.rewards.get(id),
    refetchInterval: 30_000,
  });
  const [fundKey] = useState(newIdempotencyKey);
  const [fundError, setFundError] = useState<string | null>(null);
  const fund = useMutation({
    mutationFn: () => runCheckout({ kind: 'POOL_FUNDING', poolId: id }, fundKey),
    onSuccess: (p) => {
      if (p.status !== 'SUCCEEDED')
        setFundError(p.failureReason ?? 'Funding didn’t go through. No money was taken.');
      void qc.invalidateQueries({ queryKey: ['pools'] });
    },
    onError: (e) => setFundError(errorMessage(e)),
  });
  // Funding on Arc finishes in the wallet page: refresh when the user comes back.
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const fundArc = useMutation({
    mutationFn: () => openWalletPage((returnUrl) => api.arc.fundLink(id, returnUrl)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pools'] }),
    onError: (e) => setFundError(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.rewards.cancel(id),
    onSuccess: (p) => qc.setQueryData(['pools', id], p),
  });

  if (q.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: t.c.background }}>
        <LoadingState />
      </View>
    );
  if (q.isError)
    return (
      <View style={{ flex: 1, padding: t.space.xl, backgroundColor: t.c.background }}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </View>
    );
  const p = q.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ padding: t.space.xl, gap: t.space.lg, paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          tintColor={t.c.text}
        />
      }
    >
      <Pill
        label={STATUS[p.status]}
        tone={p.status === 'ACTIVE' ? 'accent' : p.status === 'CANCELLED' ? 'danger' : 'neutral'}
      />
      <AppText variant="display">{p.title}</AppText>
      <AppText tone="muted">
        Funded by {p.sponsorName} · for videos from {p.event.title}
      </AppText>

      <Card inverse>
        <AppText variant="label" tone="inverse">
          Reward pool
        </AppText>
        <AppText variant="hero" tone="inverse">
          {formatMoney(p.budgetMinor, p.currency)}
        </AppText>
        <AppText variant="caption" tone="inverse">
          {p.status === 'DISTRIBUTED'
            ? `${formatMoney(p.allocatedMinor, p.currency)} paid to creators${p.unallocatedMinor ? ` · ${formatMoney(p.unallocatedMinor, p.currency)} unallocated (returned to the funder)` : ''}`
            : q.data.estimated
              ? `${formatMoney(p.allocatedMinor, p.currency)} currently earned by creators (estimate, final when the pool ends)`
              : 'Shared among creators by qualified watch time.'}
        </AppText>
      </Card>

      {p.arc ? (
        <Card>
          <AppText variant="label" tone="muted">
            Funded on Arc · USDC
          </AppText>
          <AppText variant="caption">
            Campaign #{p.arc.campaignId} holds the money in the RewardCampaigns contract, not at
            MUSO. When the pool ends, creators are paid in USDC to their linked wallet, and MUSO
            pays the network fees.
          </AppText>
          <AppText variant="caption" tone="muted">
            Sponsor wallet {short(p.arc.sponsor)}
          </AppText>
          <Button
            size="sm"
            variant="ghost"
            label="View contract on Arc"
            onPress={() => void Linking.openURL(p.arc!.contractUrl)}
          />
        </Card>
      ) : null}

      {q.data.arcPayouts.length ? (
        <Card>
          <AppText variant="label" tone="muted">
            On-chain payouts
          </AppText>
          {q.data.arcPayouts.map((o) => {
            const who = q.data.leaderboard.find((r) => r.creator.id === o.creatorId)?.creator;
            const tx = o.claimTxUrl ?? o.awardTxUrl;
            return (
              <Pressable
                key={o.creatorId}
                disabled={!tx}
                accessibilityRole={tx ? 'link' : undefined}
                onPress={() => tx && void Linking.openURL(tx)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {who?.displayName ?? who?.username ?? 'Creator'}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {PAYOUT[o.status]}
                    {o.note ? ` · ${o.note}` : ''}
                    {tx ? ' · view transaction ↗' : ''}
                  </AppText>
                </View>
                <AppText variant="bodyStrong">{usdc(o.amountMicro)}</AppText>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {p.humanOnly ? (
        <VerifyHumanCard reason="This pool pays verified humans only, so one person can’t farm it with many accounts." />
      ) : null}

      <Card>
        <AppText variant="label" tone="muted">
          How it works
        </AppText>
        <AppText variant="caption">
          • Upload videos to {p.event.title}. Every creator except the funder can earn.
        </AppText>
        <AppText variant="caption">
          • Earnings are split by qualified watch time: real, signed-in viewers watching on screen.
          Rewatches count once per person.
        </AppText>
        <AppText variant="caption">
          • A video needs at least {p.minQualifiedViewers} different viewers, and can earn at most{' '}
          {p.perVideoCapBps / 100}% of the pool.
        </AppText>
        <AppText variant="caption">
          • Bots, view farms and suspicious activity are excluded automatically.
        </AppText>
        <AppText variant="caption" tone="muted">
          Window: {fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}
        </AppText>
        {p.rules ? <AppText variant="caption">{p.rules}</AppText> : null}
      </Card>

      {p.viewer.canFund ? (
        <View style={{ gap: t.space.sm }}>
          <FormError message={fundError} />
          <Button
            label={`Fund ${formatMoney(p.budgetMinor, p.currency)}`}
            loading={fund.isPending}
            onPress={() => {
              setFundError(null);
              fund.mutate();
            }}
          />
          <Button
            label="Fund with USDC on Arc"
            variant="secondary"
            loading={fundArc.isPending}
            onPress={() => {
              setFundError(null);
              fundArc.mutate();
            }}
          />
          <AppText variant="caption" tone="muted">
            The pool goes live once funded. Funds are held in escrow and only ever go to creators
            (or back to you if unallocated).
          </AppText>
          <Button
            label="Cancel pool"
            variant="ghost"
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert('Cancel this pool?', undefined, [
                { text: 'Keep' },
                { text: 'Cancel pool', style: 'destructive', onPress: () => cancel.mutate() },
              ])
            }
          />
        </View>
      ) : null}

      {q.data.stats ? (
        <Card>
          <AppText variant="label" tone="muted">
            Organizer stats
          </AppText>
          <AppText variant="caption">
            Qualified watch time: {Math.round(q.data.stats.qualifiedSeconds / 60)} min ·{' '}
            {q.data.stats.qualifiedViewers} qualified views
          </AppText>
          <AppText variant="caption">
            Eligible videos: {q.data.stats.eligibleVideos} · Flagged sessions:{' '}
            {q.data.stats.flaggedSessions}
          </AppText>
        </Card>
      ) : null}

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          {q.data.estimated ? 'Leaderboard · live estimate' : 'Leaderboard'}
        </AppText>
        {q.data.leaderboard.length === 0 ? (
          <AppText tone="muted">
            {p.status === 'DRAFT' ? 'Fund the pool to start.' : 'No qualified views yet.'}
          </AppText>
        ) : (
          q.data.leaderboard.map((r) => (
            <Pressable
              key={r.postId}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/posts/[id]', params: { id: r.postId } })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space.md,
                opacity: r.eligible ? 1 : 0.55,
              }}
            >
              <AppText variant="heading" style={{ width: 24 }}>
                {r.rank}
              </AppText>
              {r.thumbUrl ? (
                <Image
                  source={{ uri: r.thumbUrl }}
                  style={{ width: 44, height: 44, borderRadius: 6 }}
                  contentFit="cover"
                />
              ) : (
                <Avatar url={r.creator.avatarUrl} name={r.creator.displayName} size={44} />
              )}
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {r.creator.displayName ?? r.creator.username}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {Math.round(r.qualifiedSeconds / 60) || '<1'} min · {r.qualifiedViewers} viewers
                  {r.eligible ? '' : ` · needs ${p.minQualifiedViewers}`}
                  {r.capped ? ' · capped' : ''}
                </AppText>
              </View>
              <AppText variant="bodyStrong">{formatMoney(r.shareMinor, p.currency)}</AppText>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

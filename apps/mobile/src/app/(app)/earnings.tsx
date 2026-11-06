import { formatMoney, type EarningSourceDto, type EarningStatusDto } from '@muso/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const SOURCE: Record<EarningSourceDto, string> = {
  TIP: 'Tips',
  PHOTO_SALE: 'Photo sales',
  VIDEO_SALE: 'Video sales',
  WATCH_REWARD: 'Watch rewards',
};
const STATUS: Record<EarningStatusDto, string> = {
  ESTIMATED: 'Estimated',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  AVAILABLE: 'Available',
  PAID: 'Paid out',
  REVERSED: 'Reversed',
};

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} tone={muted ? 'muted' : 'default'}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} tone={muted ? 'muted' : 'default'}>
        {value}
      </AppText>
    </View>
  );
}

export default function EarningsScreen() {
  const t = useTheme();
  const q = useQuery({
    queryKey: ['payments', 'earnings'],
    queryFn: () => api.payments.earnings(),
    refetchInterval: 30_000,
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
  const e = q.data;
  const s = e.byStatus;

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
      <Card inverse>
        <AppText variant="label" tone="inverse">
          Available to withdraw
        </AppText>
        <AppText variant="hero" tone="inverse">
          {formatMoney(s.AVAILABLE)}
        </AppText>
        <AppText variant="caption" tone="inverse">
          Payouts arrive in a later update. Only available earnings can ever be withdrawn.
        </AppText>
      </Card>

      <View style={{ flexDirection: 'row', gap: t.space.md }}>
        <Card style={{ flex: 1 }}>
          <AppText variant="label" tone="muted">
            Pending
          </AppText>
          <AppText variant="title">{formatMoney(s.PENDING + s.CONFIRMED)}</AppText>
          <AppText variant="caption" tone="muted">
            Released after{' '}
            {e.holdHours < 1 ? `${Math.round(e.holdHours * 60)} min` : `${e.holdHours} h`}
          </AppText>
        </Card>
        <Card style={{ flex: 1 }}>
          <AppText variant="label" tone="muted">
            Estimated
          </AppText>
          <AppText variant="title">{formatMoney(s.ESTIMATED)}</AppText>
          <AppText variant="caption" tone="muted">
            Watch rewards (coming soon)
          </AppText>
        </Card>
      </View>

      <Card>
        <AppText variant="label" tone="muted">
          Breakdown
        </AppText>
        {(Object.keys(SOURCE) as EarningSourceDto[]).map((k) => (
          <Row key={k} label={SOURCE[k]} value={formatMoney(e.bySource[k])} />
        ))}
        <Row label="Platform fees" value={`− ${formatMoney(e.feesMinor)}`} muted />
        <View style={{ height: 1, backgroundColor: t.c.border, marginVertical: 4 }} />
        <Row label="Net earnings" value={formatMoney(e.netMinor)} strong />
        <Row label="Paid out" value={formatMoney(s.PAID)} muted />
        {s.REVERSED ? <Row label="Reversed" value={formatMoney(s.REVERSED)} muted /> : null}
      </Card>

      {e.topPosts.length ? (
        <View style={{ gap: t.space.sm }}>
          <AppText variant="label" tone="muted">
            Top content
          </AppText>
          {e.topPosts.map((tp) => (
            <Pressable
              key={tp.postId}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/posts/[id]', params: { id: tp.postId } })}
              style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'center' }}
            >
              {tp.thumbUrl ? (
                <Image
                  source={{ uri: tp.thumbUrl }}
                  style={{ width: 48, height: 48, borderRadius: 6 }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ width: 48, height: 48 }} />
              )}
              <AppText style={{ flex: 1 }}>
                {tp.count} {tp.count === 1 ? 'payment' : 'payments'}
              </AppText>
              <AppText variant="bodyStrong">{formatMoney(tp.netMinor)}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Recent
        </AppText>
        {e.recent.length === 0 ? (
          <EmptyState
            title="No earnings yet."
            body="Set a price or turn on tips when you post. Sales and tips show up here."
          />
        ) : (
          e.recent.map((r) => (
            <View
              key={r.id}
              style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'center' }}
            >
              {r.post?.thumbUrl ? (
                <Image
                  source={{ uri: r.post.thumbUrl }}
                  style={{ width: 40, height: 40, borderRadius: 6 }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ width: 40, height: 40 }} />
              )}
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{SOURCE[r.source]}</AppText>
                <AppText variant="caption" tone="muted">
                  {r.from?.displayName ?? r.from?.username ?? 'Someone'} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <AppText variant="bodyStrong">{formatMoney(r.netMinor)}</AppText>
                <Pill
                  label={STATUS[r.status]}
                  tone={
                    r.status === 'AVAILABLE'
                      ? 'accent'
                      : r.status === 'REVERSED'
                        ? 'danger'
                        : 'neutral'
                  }
                />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

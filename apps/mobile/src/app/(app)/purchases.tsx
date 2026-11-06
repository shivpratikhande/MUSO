import { formatMoney, type PaymentStatusDto } from '@muso/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { AppText, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const STATUS: Record<PaymentStatusDto, string> = {
  PENDING: 'Pending',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
};

export default function PurchasesScreen() {
  const t = useTheme();
  const q = useInfiniteQuery({
    queryKey: ['payments', 'history'],
    queryFn: ({ pageParam }) => api.payments.mine(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ padding: t.space.xl, gap: t.space.md, paddingBottom: 80 }}
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item: p }) => (
        <Pressable
          accessibilityRole="button"
          disabled={!p.post}
          onPress={() =>
            p.post && router.push({ pathname: '/posts/[id]', params: { id: p.post.id } })
          }
          style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'center' }}
        >
          {p.post?.thumbUrl ? (
            <Image
              source={{ uri: p.post.thumbUrl }}
              style={{ width: 48, height: 48, borderRadius: 6 }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: 48, height: 48 }} />
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">
              {p.kind === 'POOL_FUNDING'
                ? `Reward pool · ${p.pool?.title ?? ''}`
                : `${p.kind === 'TIP' ? 'Tip' : 'Unlock'} · ${p.payee?.displayName ?? p.payee?.username ?? ''}`}
            </AppText>
            <AppText variant="caption" tone="muted">
              {new Date(p.createdAt).toLocaleString(undefined, {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {p.testMode ? ' · test' : ''}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <AppText variant="bodyStrong">{formatMoney(p.amountMinor, p.currency)}</AppText>
            <Pill
              label={STATUS[p.status]}
              tone={
                p.status === 'SUCCEEDED' ? 'accent' : p.status === 'FAILED' ? 'danger' : 'neutral'
              }
            />
          </View>
        </Pressable>
      )}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          tintColor={t.c.text}
        />
      }
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListEmptyComponent={
        q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState title="No purchases yet." body="Unlocks and tips you send show up here." />
        )
      }
    />
  );
}

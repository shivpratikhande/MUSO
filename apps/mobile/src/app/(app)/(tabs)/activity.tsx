import type { NotificationDto } from '@muso/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Avatar, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const name = (n: NotificationDto) => n.actor?.displayName ?? n.actor?.username ?? 'Someone';

function text(n: NotificationDto): string {
  switch (n.type) {
    case 'NEW_FOLLOWER':
      return `${name(n)} started following you`;
    case 'POST_LIKED':
      return `${name(n)} liked your post`;
    case 'POST_COMMENTED':
      return `${name(n)} commented: “${n.comment?.body ?? ''}”`;
    case 'COMMENT_REPLIED':
      return `${name(n)} replied: “${n.comment?.body ?? ''}”`;
    case 'MENTIONED':
      return `${name(n)} mentioned you`;
    case 'TAGGED_IN_POST':
      return `${name(n)} tagged you in a moment`;
    case 'POST_PUBLISHED':
      return 'Your post is live';
    case 'POST_FAILED':
      return 'Your upload couldn’t be processed. Tap to see why.';
  }
}

function open(n: NotificationDto) {
  if (n.post) router.push({ pathname: '/posts/[id]', params: { id: n.post.id } });
  else if (n.actor) router.push({ pathname: '/users/[id]', params: { id: n.actor.id } });
}

export default function ActivityScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });

  // Viewing the tab marks everything read (the list keeps showing which were new).
  useFocusEffect(
    useCallback(() => {
      void q
        .refetch()
        .then(() =>
          api.notifications
            .markRead()
            .then(() => qc.invalidateQueries({ queryKey: ['notifications', 'unread'] })),
        );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.c.background }}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: t.space.xl, paddingBottom: 120, gap: t.space.md }}
        ListHeaderComponent={
          <View style={{ gap: t.space.sm, marginBottom: t.space.lg }}>
            <AppText variant="label" tone="muted">
              Activity
            </AppText>
            <AppText variant="display">What’s new.</AppText>
          </View>
        }
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(n)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: t.space.md,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Avatar url={n.actor?.avatarUrl} name={n.actor ? name(n) : 'MUSO'} size={40} />
            <View style={{ flex: 1 }}>
              <AppText
                variant="caption"
                style={{ fontFamily: n.read ? t.fonts.body : t.fonts.bodySemiBold }}
                numberOfLines={3}
              >
                {text(n)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {new Date(n.createdAt).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </AppText>
            </View>
            {n.post?.thumbUrl ? (
              <Image
                source={{ uri: n.post.thumbUrl }}
                style={{ width: 44, height: 44, borderRadius: 6 }}
                contentFit="cover"
              />
            ) : null}
            {!n.read ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.danger }} />
            ) : null}
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
            <EmptyState
              title="Nothing here yet."
              body="Follows, likes, comments, mentions and tags will show up here."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

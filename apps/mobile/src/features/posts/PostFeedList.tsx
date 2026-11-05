import type { Paginated, PostDto } from '@muso/shared';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { PostCard } from './PostCard';

type Viewable = { item: PostDto; isViewable: boolean };

/** Infinite list of PostCards; the most visible video autoplays (muted). */
export function PostFeedList({
  queryKey,
  fetchPage,
  header,
  empty,
}: {
  queryKey: QueryKey;
  fetchPage: (cursor?: string) => Promise<Paginated<PostDto>>;
  header?: ReactElement;
  empty: { title: string; body?: string };
}) {
  const t = useTheme();
  const [activeId, setActiveId] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  // Must be referentially stable for FlatList (setActiveId never changes).
  const onViewable = useCallback(({ viewableItems }: { viewableItems: Viewable[] }) => {
    const firstVideo = viewableItems.find((v) => v.isViewable && v.item.type === 'VIDEO');
    setActiveId(firstVideo?.item.id ?? null);
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: PostDto }) => <PostCard post={item} active={item.id === activeId} />,
    [activeId],
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={renderItem}
      extraData={activeId}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: t.space.xxl }} />}
      contentContainerStyle={{ padding: t.space.xl, paddingBottom: 120 }}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => void q.refetch()}
          tintColor={t.c.text}
        />
      }
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
      }}
      ListEmptyComponent={
        q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState {...empty} />
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? (
          <ActivityIndicator style={{ marginTop: t.space.lg }} color={t.c.text} />
        ) : undefined
      }
      removeClippedSubviews
      windowSize={7}
    />
  );
}

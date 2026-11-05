import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
} from '@/components/ui';
import { ROLE_COPY } from '@/features/profile/forms/RolesForm';
import { PostGrid } from '@/features/posts/PostGrid';
import { postKeys } from '@/features/posts/keys';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

/** Public profile. `id` may be a user id or a username (from @mentions). */
export default function UserScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useQuery({ queryKey: ['users', id], queryFn: () => api.users.get(id) });
  const userId = profile.data?.id;
  const posts = useInfiniteQuery({
    queryKey: postKeys.user(userId ?? id),
    queryFn: ({ pageParam }) => api.posts.byUser(userId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: !!userId && !profile.data?.viewer.blocked,
  });
  const follow = useMutation({
    mutationFn: (on: boolean) => api.users.follow(userId!, on),
    onSuccess: (p) => qc.setQueryData(['users', id], p),
    onError: (e) => Alert.alert('Couldn’t update', errorMessage(e)),
  });
  const block = useMutation({
    mutationFn: (on: boolean) => api.users.block(userId!, on),
    onSuccess: (p) => {
      qc.setQueryData(['users', id], p);
      void qc.invalidateQueries({ queryKey: postKeys.all });
    },
  });

  if (profile.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: t.c.background }}>
        <LoadingState />
      </View>
    );
  if (profile.isError)
    return (
      <View style={{ flex: 1, padding: t.space.xl, backgroundColor: t.c.background }}>
        <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />
      </View>
    );
  const p = profile.data;
  const items = posts.data?.pages.flatMap((pg) => pg.items) ?? [];

  const more = () =>
    Alert.alert(p.displayName ?? 'User', undefined, [
      p.viewer.blocked
        ? { text: 'Unblock', onPress: () => block.mutate(false) }
        : { text: 'Block', style: 'destructive', onPress: () => block.mutate(true) },
      {
        text: 'Report account',
        onPress: () =>
          void api.reports
            .create({ targetType: 'USER', targetId: p.id, reason: 'OTHER' })
            .then(() => Alert.alert('Thanks', 'Our team will take a look.')),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ padding: t.space.xl, gap: t.space.lg, paddingBottom: 80 }}
    >
      <View style={{ flexDirection: 'row', gap: t.space.lg, alignItems: 'center' }}>
        <Avatar url={p.avatarUrl} name={p.displayName} size={84} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{p.displayName ?? p.username}</AppText>
          {p.username ? <AppText tone="muted">@{p.username}</AppText> : null}
          {p.city ? (
            <AppText variant="caption" tone="muted">
              {p.city}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: t.space.xl }}>
        <AppText>
          <AppText variant="bodyStrong">{p.postCount}</AppText> posts
        </AppText>
        <AppText>
          <AppText variant="bodyStrong">{p.followerCount}</AppText> followers
        </AppText>
        <AppText>
          <AppText variant="bodyStrong">{p.followingCount}</AppText> following
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: t.space.xs, flexWrap: 'wrap' }}>
        {p.roles.map((r) => (
          <Pill key={r} label={ROLE_COPY[r as 'SUPPORTER']?.title ?? r} />
        ))}
      </View>
      {p.bio ? <AppText>{p.bio}</AppText> : null}
      {p.viewer.isMe ? (
        <Button label="Edit profile" variant="ghost" onPress={() => router.push('/profile/edit')} />
      ) : (
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          <View style={{ flex: 1 }}>
            {p.viewer.blocked ? (
              <Button
                label="Unblock"
                variant="ghost"
                loading={block.isPending}
                onPress={() => block.mutate(false)}
              />
            ) : (
              <Button
                label={p.viewer.following ? 'Following' : 'Follow'}
                variant={p.viewer.following ? 'ghost' : 'primary'}
                loading={follow.isPending}
                onPress={() => follow.mutate(!p.viewer.following)}
              />
            )}
          </View>
          <Button label="•••" variant="ghost" fullWidth={false} onPress={more} />
        </View>
      )}
      {p.artistId ? (
        <Button
          label="View artist page"
          variant="secondary"
          onPress={() => router.push({ pathname: '/artists/[id]', params: { id: p.artistId! } })}
        />
      ) : null}

      {p.viewer.blocked ? (
        <EmptyState title="You blocked this account." body="Unblock to see their posts." />
      ) : posts.isPending ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="No posts yet." />
      ) : (
        <>
          <PostGrid posts={items} />
          {posts.hasNextPage ? (
            <Button label="Load more" variant="ghost" onPress={() => void posts.fetchNextPage()} />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

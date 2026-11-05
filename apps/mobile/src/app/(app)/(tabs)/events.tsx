import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Segmented,
  TextField,
} from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { EventCard } from '@/features/events/EventCard';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

type When = 'live' | 'upcoming' | 'past';

const EMPTY: Record<When, { title: string; body: string }> = {
  live: { title: 'Nothing live right now.', body: 'When a show starts, it lights up here.' },
  upcoming: {
    title: 'No upcoming events yet.',
    body: 'Organizers are lining things up — check back soon.',
  },
  past: { title: 'No past events yet.', body: 'Finished shows and their moments will live here.' },
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function EventsScreen() {
  const t = useTheme();
  const roles = useSession((s) => s.user?.roles ?? []);
  const isOrganizer = roles.includes('ORGANIZER');
  const isAdmin = roles.includes('ADMIN');
  const [when, setWhen] = useState<When>('upcoming');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const list = useInfiniteQuery({
    queryKey: eventKeys.list(when, q),
    queryFn: ({ pageParam }) =>
      api.events.list({ when, q: q || undefined, cursor: pageParam, limit: 10 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pending = useQuery({
    queryKey: eventKeys.pending,
    queryFn: () => api.admin.pendingEvents(),
    enabled: isAdmin,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={{ gap: t.space.lg, paddingBottom: t.space.lg }}>
      <AppText variant="label" tone="muted">
        Events
      </AppText>
      <AppText variant="display">Live, upcoming{'\n'}& unforgettable.</AppText>
      {isOrganizer || isAdmin ? (
        <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
          {isOrganizer ? (
            <Button
              label="Create event"
              fullWidth={false}
              onPress={() => router.push('/events/new')}
            />
          ) : null}
          {isOrganizer ? (
            <Button
              label="My events"
              variant="ghost"
              fullWidth={false}
              onPress={() => router.push('/events/mine')}
            />
          ) : null}
          {isAdmin ? (
            <Button
              label={`Review${pending.data?.length ? ` (${pending.data.length})` : ''}`}
              variant="ghost"
              fullWidth={false}
              onPress={() => router.push('/admin/review')}
            />
          ) : null}
        </View>
      ) : null}
      <Segmented<When>
        value={when}
        onChange={setWhen}
        options={[
          { value: 'live', label: 'Live' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      <TextField
        label="Search"
        placeholder="Event, artist, venue or city"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.c.background }}>
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventCard event={item} />}
        ItemSeparatorComponent={() => <View style={{ height: t.space.lg }} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: t.space.xl, paddingBottom: 120 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            tintColor={t.c.text}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <LoadingState label="Finding events…" />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : q ? (
            <EmptyState title="No matches." body={`Nothing found for “${q}”.`} />
          ) : (
            <EmptyState {...EMPTY[when]} />
          )
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginTop: t.space.lg }} color={t.c.text} />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

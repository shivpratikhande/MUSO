import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { EventCard } from '@/features/events/EventCard';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function DiscoverScreen() {
  const t = useTheme();
  const name = useSession((s) => s.user?.displayName);
  const live = useQuery({
    queryKey: eventKeys.list('live', ''),
    queryFn: () => api.events.list({ when: 'live', limit: 5 }),
  });
  const upcoming = useQuery({
    queryKey: [...eventKeys.list('upcoming', ''), 'discover'],
    queryFn: () => api.events.list({ when: 'upcoming', limit: 5 }),
  });
  const refreshing = live.isRefetching || upcoming.isRefetching;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: t.space.xl, gap: t.space.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void live.refetch();
              void upcoming.refetch();
            }}
            tintColor={t.c.text}
          />
        }
      >
        <AppText variant="label" tone="muted">
          Discover
        </AppText>
        <AppText variant="display">
          Hey{name ? ` ${name.split(' ')[0]}` : ''}.{'\n'}
          <AppText variant="display" style={{ fontFamily: t.fonts.displayItalic }}>
            What’s on tonight?
          </AppText>
        </AppText>

        <AppText variant="label" tone="muted" style={{ marginTop: t.space.md }}>
          ● Live now
        </AppText>
        {live.isPending ? (
          <LoadingState />
        ) : live.isError ? (
          <ErrorState message={errorMessage(live.error)} onRetry={() => void live.refetch()} />
        ) : live.data.items.length === 0 ? (
          <AppText tone="muted">Nothing live right now.</AppText>
        ) : (
          live.data.items.map((e) => <EventCard key={e.id} event={e} />)
        )}

        <AppText variant="label" tone="muted" style={{ marginTop: t.space.md }}>
          Coming up
        </AppText>
        {upcoming.isPending ? (
          <LoadingState />
        ) : upcoming.isError ? (
          <ErrorState
            message={errorMessage(upcoming.error)}
            onRetry={() => void upcoming.refetch()}
          />
        ) : upcoming.data.items.length === 0 ? (
          <AppText tone="muted">No upcoming events yet.</AppText>
        ) : (
          <View style={{ gap: t.space.lg }}>
            {upcoming.data.items.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
            <Button label="All events" variant="ghost" onPress={() => router.navigate('/events')} />
          </View>
        )}

        <EmptyState
          eyebrow="Coming in Milestone 3"
          title="The moments feed."
          body="Photos and videos captured at these shows will appear here — For You, Trending, Around You and more."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

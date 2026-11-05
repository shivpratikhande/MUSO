import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { EventCard } from '@/features/events/EventCard';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function MyEventsScreen() {
  const t = useTheme();
  const mine = useQuery({ queryKey: eventKeys.mine, queryFn: () => api.events.mine() });
  return (
    <Screen edges={['bottom']}>
      <Button label="Create event" onPress={() => router.push('/events/new')} />
      {mine.isPending ? (
        <LoadingState />
      ) : mine.isError ? (
        <ErrorState message={errorMessage(mine.error)} onRetry={() => void mine.refetch()} />
      ) : mine.data.length === 0 ? (
        <EmptyState
          title="No events yet."
          body="Create your first event — it goes live once approved."
        />
      ) : (
        <View style={{ gap: t.space.lg }}>
          {mine.data.map((e) => (
            <EventCard key={e.id} event={e} showReview />
          ))}
        </View>
      )}
    </Screen>
  );
}

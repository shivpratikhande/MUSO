import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { AppText, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { EventCard } from '@/features/events/EventCard';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function ReviewQueueScreen() {
  const t = useTheme();
  const pending = useQuery({
    queryKey: eventKeys.pending,
    queryFn: () => api.admin.pendingEvents(),
  });
  return (
    <Screen edges={['bottom']}>
      <AppText tone="muted">Open an event to approve or reject it.</AppText>
      {pending.isPending ? (
        <LoadingState />
      ) : pending.isError ? (
        <ErrorState message={errorMessage(pending.error)} onRetry={() => void pending.refetch()} />
      ) : pending.data.length === 0 ? (
        <EmptyState title="All caught up." body="No events waiting for review." />
      ) : (
        <View style={{ gap: t.space.lg }}>
          {pending.data.map((e) => (
            <EventCard key={e.id} event={e} showReview />
          ))}
        </View>
      )}
    </Screen>
  );
}

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { api } from '@/services/api';
import { useTheme } from '@/theme';
import { PredictionCard } from './PredictionCard';

export const predictionKeys = {
  event: (eventId: string) => ['predictions', 'event', eventId] as const,
  one: (id: string) => ['predictions', id] as const,
};

/** Event screen: the event's prediction games (and "Add prediction" for its organizer). */
export function PredictionsSection({
  eventId,
  canEdit,
  ended,
}: {
  eventId: string;
  canEdit: boolean;
  ended: boolean;
}) {
  const t = useTheme();
  const q = useQuery({
    queryKey: predictionKeys.event(eventId),
    queryFn: () => api.predictions.forEvent(eventId),
    refetchInterval: 30_000,
  });
  if (!q.data?.length && !(canEdit && !ended)) return null;
  return (
    <View style={{ gap: t.space.sm }}>
      <AppText variant="label" tone="muted">
        Predictions
      </AppText>
      {q.data?.map((p) => (
        <PredictionCard key={p.id} p={p} />
      ))}
      {canEdit && !ended ? (
        <Button
          label="Add a prediction"
          variant="ghost"
          onPress={() => router.push({ pathname: '/predictions/new', params: { eventId } })}
        />
      ) : null}
    </View>
  );
}

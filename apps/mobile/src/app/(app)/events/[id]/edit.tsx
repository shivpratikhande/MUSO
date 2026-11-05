import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, ErrorState, LoadingState, Screen } from '@/components/ui';
import { EventForm } from '@/features/events/EventForm';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const event = useQuery({ queryKey: eventKeys.detail(id), queryFn: () => api.events.get(id) });
  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.events.update>[1]) => api.events.update(id, input),
    onSuccess: (e) => {
      qc.setQueryData(eventKeys.detail(id), e);
      void qc.invalidateQueries({ queryKey: eventKeys.all, refetchType: 'none' });
      router.back();
    },
  });

  return (
    <Screen keyboard edges={['bottom']}>
      {event.isPending ? (
        <LoadingState />
      ) : event.isError ? (
        <ErrorState message={errorMessage(event.error)} onRetry={() => void event.refetch()} />
      ) : (
        <>
          {event.data.reviewStatus === 'APPROVED' && !event.data.viewer.canReview ? (
            <AppText variant="caption" tone="muted">
              Changing the name, description, poster, venue or dates sends the event back for a
              quick review.
            </AppText>
          ) : null}
          <EventForm
            initial={event.data}
            submitLabel="Save changes"
            submitting={save.isPending}
            serverError={save.isError ? errorMessage(save.error) : null}
            onSubmit={(input) => save.mutate(input)}
          />
        </>
      )}
    </Screen>
  );
}

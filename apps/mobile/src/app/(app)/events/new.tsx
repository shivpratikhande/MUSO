import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { EventForm } from '@/features/events/EventForm';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';

export default function NewEventScreen() {
  const qc = useQueryClient();
  const verified = useSession((s) => s.user?.emailVerified ?? false);
  const create = useMutation({
    mutationFn: api.events.create,
    onSuccess: (e) => {
      qc.setQueryData(eventKeys.detail(e.id), e);
      void qc.invalidateQueries({ queryKey: eventKeys.all });
      router.replace({ pathname: '/events/[id]', params: { id: e.id } });
    },
  });

  if (!verified) {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <AppText variant="heading">Verify your email first</AppText>
          <AppText variant="caption" tone="muted">
            Organizers need a verified email before publishing events.
          </AppText>
          <Button label="Verify email" onPress={() => router.push('/verify-email')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <AppText tone="muted">
        New events are reviewed before they appear publicly. Add the lineup after creating it.
      </AppText>
      <EventForm
        submitLabel="Create event"
        submitting={create.isPending}
        serverError={create.isError ? errorMessage(create.error) : null}
        onSubmit={(input) => create.mutate(input)}
      />
    </Screen>
  );
}

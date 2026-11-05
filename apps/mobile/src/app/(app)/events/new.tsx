import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AppText, Button, Card, LoadingState, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { EventForm } from '@/features/events/EventForm';
import { eventKeys } from '@/features/events/format';
import { useMe } from '@/features/profile/use-me';
import { api, errorMessage } from '@/services/api';

export default function NewEventScreen() {
  const qc = useQueryClient();
  const verified = useSession((s) => s.user?.emailVerified ?? false);
  const me = useMe();
  const create = useMutation({
    mutationFn: api.events.create,
    onSuccess: (e) => {
      qc.setQueryData(eventKeys.detail(e.id), e);
      void qc.invalidateQueries({ queryKey: eventKeys.all });
      router.replace({ pathname: '/events/[id]', params: { id: e.id } });
    },
  });

  if (me.isPending) {
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  }

  // Organizer role without organizer details (e.g. role added after onboarding):
  // send them to the form instead of letting the server reject the event.
  if (me.data && !me.data.organizerProfile) {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <AppText variant="heading">Add your organizer details first</AppText>
          <AppText variant="caption" tone="muted">
            Your organization name and contact email are shown on your events. It takes a few
            seconds.
          </AppText>
          <Button label="Add organizer details" onPress={() => router.push('/profile/organizer')} />
        </Card>
      </Screen>
    );
  }

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

import { AppText, EmptyState, Screen } from '@/components/ui';

export default function CreateScreen() {
  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Create
      </AppText>
      <AppText variant="display">Capture the moment.</AppText>
      <EmptyState
        eyebrow="Coming in Milestone 3"
        title="Camera & uploads."
        body="Shoot or pick photos and videos, tag the event and artist, choose free, paid or tip-enabled, and publish."
      />
    </Screen>
  );
}

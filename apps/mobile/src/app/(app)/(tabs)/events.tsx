import { AppText, EmptyState, Screen } from '@/components/ui';

export default function EventsScreen() {
  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Events
      </AppText>
      <AppText variant="display">Live, upcoming{'\n'}& unforgettable.</AppText>
      <EmptyState
        eyebrow="Coming in Milestone 2"
        title="No events yet."
        body="Organizers will publish events with lineups, schedules and reward programs. When an event goes live, its content feed lights up here."
      />
    </Screen>
  );
}

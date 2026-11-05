import { AppText, EmptyState, Screen } from '@/components/ui';

export default function ActivityScreen() {
  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Activity
      </AppText>
      <AppText variant="display">Your activity.</AppText>
      <EmptyState
        title="Nothing here yet."
        body="Likes, comments, tips, purchases and earnings will show up here as they happen."
      />
    </Screen>
  );
}

import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Pill, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function DiscoverScreen() {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health.get(signal),
  });

  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Discover
      </AppText>
      <AppText variant="display">
        Hey{user?.displayName ? ` ${user.displayName}` : ''}.{'\n'}
        <AppText variant="display" style={{ fontFamily: t.fonts.displayItalic }}>
          What did you catch tonight?
        </AppText>
      </AppText>

      <Card>
        <AppText variant="label" tone="muted">
          Platform status
        </AppText>
        {health.isPending ? (
          <LoadingState label="Checking connection…" />
        ) : health.isError ? (
          <ErrorState message={errorMessage(health.error)} onRetry={() => void health.refetch()} />
        ) : (
          <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
            <Pill
              label={`API ${health.data.status}`}
              tone={health.data.status === 'ok' ? 'accent' : 'danger'}
            />
            <Pill label={`Database ${health.data.services.database}`} />
            <Pill label={`Cache ${health.data.services.redis}`} />
          </View>
        )}
      </Card>

      <EmptyState
        eyebrow="Coming in Milestone 3"
        title="The feed is warming up."
        body="Photos and videos captured at live events will appear here — For You, Trending, Live Events and more."
      />
    </Screen>
  );
}

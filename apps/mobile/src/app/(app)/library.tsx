import { useQuery } from '@tanstack/react-query';
import { ScrollView } from 'react-native';
import { AppText, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { PostGrid } from '@/features/posts/PostGrid';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

/** Everything the user has unlocked. Access is permanent. */
export default function LibraryScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['posts', 'library'], queryFn: () => api.payments.library() });
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ padding: t.space.xl, gap: t.space.lg }}
    >
      <AppText tone="muted">
        Moments you’ve unlocked. They stay yours, even if the creator changes the price.
      </AppText>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.length ? (
        <PostGrid posts={q.data} />
      ) : (
        <EmptyState title="Nothing unlocked yet." />
      )}
    </ScrollView>
  );
}

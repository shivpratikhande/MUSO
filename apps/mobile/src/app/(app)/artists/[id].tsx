import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Avatar, Chip, ErrorState, ListRow, LoadingState } from '@/components/ui';
import { EventCard } from '@/features/events/EventCard';
import { postKeys } from '@/features/posts/keys';
import { PostGrid } from '@/features/posts/PostGrid';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

const POLICY: Record<string, string> = {
  PERSONAL_SHARING_ONLY: 'Fans can share captures of these shows. Commercial use needs a licence.',
  FAN_MONETIZATION_ALLOWED: 'Fans can share and earn from their own captures of these shows.',
  NO_RECORDINGS: 'This artist asks fans not to post recordings.',
};

export default function ArtistScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const artist = useQuery({ queryKey: ['artists', id], queryFn: () => api.artists.get(id) });
  const captures = useQuery({
    queryKey: postKeys.artist(id),
    queryFn: () => api.posts.byArtist(id),
  });

  if (artist.isPending)
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 60, backgroundColor: t.c.background }}>
        <LoadingState />
      </View>
    );
  if (artist.isError) {
    return (
      <View
        style={{
          flex: 1,
          padding: t.space.xl,
          paddingTop: insets.top + 60,
          backgroundColor: t.c.background,
        }}
      >
        <ErrorState message={errorMessage(artist.error)} onRetry={() => void artist.refetch()} />
      </View>
    );
  }
  const a = artist.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
    >
      <View style={{ aspectRatio: 16 / 10, backgroundColor: t.c.inverseBackground }}>
        {a.coverUrl ? (
          <Image
            source={{ uri: a.coverUrl }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <View style={{ paddingHorizontal: t.space.xl, marginTop: -44, gap: t.space.md }}>
        <View
          style={{
            borderWidth: 4,
            borderColor: t.c.background,
            borderRadius: 999,
            alignSelf: 'flex-start',
          }}
        >
          <Avatar url={a.avatarUrl} name={a.stageName} size={88} />
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="display">{a.stageName}</AppText>
          <AppText tone="muted">
            {[a.username ? `@${a.username}` : null, a.city].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {a.genres.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs }}>
            {a.genres.map((g) => (
              <Chip key={g.id} label={g.name} selected={false} onPress={() => undefined} disabled />
            ))}
          </View>
        ) : null}
        {a.bio ? <AppText>{a.bio}</AppText> : null}
        {a.links.map((l) => (
          <ListRow
            key={l.url}
            title={l.label}
            subtitle={l.url.replace(/^https?:\/\//, '')}
            onPress={() => void Linking.openURL(l.url)}
          />
        ))}
        <AppText variant="caption" tone="muted">
          {POLICY[a.contentUsagePolicy]}
        </AppText>

        <AppText variant="label" tone="muted" style={{ marginTop: t.space.lg }}>
          Captured at their shows
        </AppText>
        {captures.isPending ? (
          <LoadingState />
        ) : captures.data?.items.length ? (
          <PostGrid posts={captures.data.items} />
        ) : (
          <AppText tone="muted">No fan moments yet.</AppText>
        )}

        <AppText variant="label" tone="muted" style={{ marginTop: t.space.lg }}>
          Upcoming
        </AppText>
        {a.upcomingEvents.length === 0 ? (
          <AppText tone="muted">No upcoming shows announced.</AppText>
        ) : (
          a.upcomingEvents.map((e) => <EventCard key={e.id} event={e} />)
        )}

        {a.pastEvents.length ? (
          <>
            <AppText variant="label" tone="muted" style={{ marginTop: t.space.lg }}>
              Past shows
            </AppText>
            {a.pastEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

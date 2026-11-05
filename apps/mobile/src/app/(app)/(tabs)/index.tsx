import { FEED_TABS, type FeedTab } from '@muso/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Chip, Pill } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { eventKeys } from '@/features/events/format';
import { PostFeedList } from '@/features/posts/PostFeedList';
import { postKeys } from '@/features/posts/keys';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

const LABEL: Record<FeedTab, string> = {
  for_you: 'For You',
  trending: 'Trending',
  live: 'Live',
  around: 'Around You',
  artists: 'Artists',
  photos: 'Photos',
  videos: 'Videos',
};
const EMPTY: Record<FeedTab, { title: string; body: string }> = {
  for_you: {
    title: 'Your feed is warming up.',
    body: 'Follow artists, creators and events to fill it. Meanwhile, check Trending.',
  },
  trending: {
    title: 'Nothing trending yet.',
    body: 'Moments with the most love this week show up here.',
  },
  live: {
    title: 'No live moments right now.',
    body: 'When a show is on, captures from the crowd appear here.',
  },
  around: {
    title: 'Nothing nearby yet.',
    body: 'Add your city in Edit profile to see moments around you.',
  },
  artists: { title: 'No artist posts yet.', body: 'Official posts and artist uploads land here.' },
  photos: { title: 'No photos yet.', body: 'Be the first to capture one.' },
  videos: { title: 'No videos yet.', body: 'Be the first to capture one.' },
};

export default function DiscoverScreen() {
  const t = useTheme();
  const name = useSession((s) => s.user?.displayName);
  const [tab, setTab] = useState<FeedTab>('for_you');
  const live = useQuery({
    queryKey: eventKeys.list('live', ''),
    queryFn: () => api.events.list({ when: 'live', limit: 5 }),
  });

  const header = (
    <View style={{ gap: t.space.lg, paddingBottom: t.space.xl }}>
      <AppText variant="label" tone="muted">
        Discover
      </AppText>
      <AppText variant="display">
        Hey{name ? ` ${name.split(' ')[0]}` : ''}.{'\n'}
        <AppText variant="display" style={{ fontFamily: t.fonts.displayItalic }}>
          What’s on tonight?
        </AppText>
      </AppText>
      {live.data?.items.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: t.space.sm }}
        >
          {live.data.items.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, live now`}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })}
              style={{
                backgroundColor: t.c.inverseBackground,
                borderRadius: t.radius.md,
                padding: t.space.md,
                gap: 4,
                width: 200,
              }}
            >
              <Pill label="● Live now" tone="accent" />
              <AppText variant="bodyStrong" tone="inverse" numberOfLines={1}>
                {e.title}
              </AppText>
              <AppText variant="caption" tone="inverse" numberOfLines={1}>
                {e.venueName} · {e.city}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: t.space.sm }}
      >
        {FEED_TABS.map((k) => (
          <Chip key={k} label={LABEL[k]} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.c.background }}>
      <PostFeedList
        key={tab}
        queryKey={postKeys.feed(tab)}
        fetchPage={(c) => api.feed(tab, c)}
        header={header}
        empty={EMPTY[tab]}
      />
    </SafeAreaView>
  );
}

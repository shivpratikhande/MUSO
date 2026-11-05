import type { PostDto } from '@muso/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** 3-column thumbnail grid (gallery / profile). */
export function PostGrid({ posts, showStatus }: { posts: PostDto[]; showStatus?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
      {posts.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.type === 'VIDEO' ? 'Video' : 'Photo'} by ${p.author.displayName ?? 'someone'}`}
          onPress={() => router.push({ pathname: '/posts/[id]', params: { id: p.id } })}
          style={{
            width: '32.6%',
            aspectRatio: 1,
            backgroundColor: t.c.surfaceMuted,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {p.media.thumbUrl ? (
            <Image
              source={{ uri: p.media.thumbUrl }}
              style={{ flex: 1 }}
              contentFit="cover"
              transition={120}
            />
          ) : null}
          {p.type === 'VIDEO' ? (
            <AppText
              variant="caption"
              style={{ position: 'absolute', top: 4, right: 6, color: '#fff' }}
            >
              ▶
            </AppText>
          ) : null}
          {showStatus && p.status !== 'PUBLISHED' ? (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption" style={{ color: '#fff' }}>
                {p.status === 'PROCESSING' ? 'Processing…' : 'Failed'}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

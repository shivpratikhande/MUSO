import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostFeedList } from '@/features/posts/PostFeedList';
import { postKeys } from '@/features/posts/keys';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

export default function HashtagScreen() {
  const t = useTheme();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.c.background }}>
      <Stack.Screen options={{ title: `#${tag}` }} />
      <PostFeedList
        queryKey={postKeys.hashtag(tag)}
        fetchPage={(c) => api.posts.byHashtag(tag, c)}
        empty={{ title: `Nothing tagged #${tag} yet.` }}
      />
    </SafeAreaView>
  );
}

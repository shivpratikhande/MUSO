import { SafeAreaView } from 'react-native-safe-area-context';
import { PostFeedList } from '@/features/posts/PostFeedList';
import { postKeys } from '@/features/posts/keys';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

export default function SavedScreen() {
  const t = useTheme();
  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.c.background }}>
      <PostFeedList
        queryKey={postKeys.saved}
        fetchPage={(c) => api.posts.saved(c)}
        empty={{ title: 'Nothing saved yet.', body: 'Tap ☆ Save on any moment to keep it here.' }}
      />
    </SafeAreaView>
  );
}

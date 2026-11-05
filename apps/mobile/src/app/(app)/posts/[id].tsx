import type { CommentDto } from '@muso/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Avatar, Button, ErrorState, LoadingState } from '@/components/ui';
import { patchPostEverywhere } from '@/features/posts/cache';
import { postKeys } from '@/features/posts/keys';
import { PostCard } from '@/features/posts/PostCard';
import { RichText } from '@/features/posts/RichText';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

function Comment({
  c,
  onReply,
  onDelete,
  reply,
}: {
  c: CommentDto;
  onReply?: () => void;
  onDelete: () => void;
  reply?: boolean;
}) {
  const t = useTheme();
  const [showReplies, setShowReplies] = useState(false);
  const replies = useQuery({
    queryKey: postKeys.comments(c.postId, c.id),
    queryFn: () => api.comments.list(c.postId, c.id),
    enabled: showReplies,
  });
  return (
    <View style={{ flexDirection: 'row', gap: t.space.sm, marginLeft: reply ? 44 : 0 }}>
      <Pressable
        onPress={() => router.push({ pathname: '/users/[id]', params: { id: c.author.id } })}
      >
        <Avatar url={c.author.avatarUrl} name={c.author.displayName} size={reply ? 28 : 36} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="caption" style={{ fontFamily: t.fonts.bodySemiBold }}>
          {c.author.displayName ?? c.author.username}
        </AppText>
        <RichText text={c.body} />
        <View style={{ flexDirection: 'row', gap: t.space.lg, marginTop: 2 }}>
          {onReply ? (
            <AppText variant="caption" tone="muted" accessibilityRole="button" onPress={onReply}>
              Reply
            </AppText>
          ) : null}
          {c.canDelete ? (
            <AppText variant="caption" tone="muted" accessibilityRole="button" onPress={onDelete}>
              Delete
            </AppText>
          ) : null}
          {!reply && c.replyCount > 0 ? (
            <AppText
              variant="caption"
              tone="muted"
              accessibilityRole="button"
              onPress={() => setShowReplies((s) => !s)}
            >
              {showReplies
                ? 'Hide replies'
                : `View ${c.replyCount} ${c.replyCount === 1 ? 'reply' : 'replies'}`}
            </AppText>
          ) : null}
        </View>
        {showReplies && replies.data ? (
          <View style={{ gap: t.space.md, marginTop: t.space.sm }}>
            {replies.data.items.map((r) => (
              <Comment key={r.id} c={r} reply onDelete={onDelete} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function PostScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);

  const post = useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => api.posts.get(id),
    // Poll while the media is being processed.
    refetchInterval: (q) => (q.state.data?.status === 'PROCESSING' ? 2000 : false),
  });
  const comments = useInfiniteQuery({
    queryKey: postKeys.comments(id),
    queryFn: ({ pageParam }) => api.comments.list(id, undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: post.data?.status === 'PUBLISHED',
  });

  const refreshCounts = () => {
    void qc.invalidateQueries({ queryKey: ['comments', id] });
    void api.posts.get(id).then((p) => patchPostEverywhere(qc, p));
  };
  const send = useMutation({
    mutationFn: () => api.comments.create(id, { body: text.trim(), parentId: replyTo?.id ?? null }),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      refreshCounts();
    },
    onError: (err) => Alert.alert('Couldn’t post comment', errorMessage(err)),
  });
  const remove = (commentId: string) =>
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void api.comments
            .remove(commentId)
            .then(refreshCounts)
            .catch((e) => Alert.alert('Error', errorMessage(e))),
      },
    ]);

  if (post.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: t.c.background }}>
        <LoadingState />
      </View>
    );
  if (post.isError) {
    return (
      <View style={{ flex: 1, padding: t.space.xl, backgroundColor: t.c.background }}>
        <ErrorState message={errorMessage(post.error)} onRetry={() => void post.refetch()} />
      </View>
    );
  }
  const items = comments.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={{ padding: t.space.xl, gap: t.space.xl, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <PostCard post={post.data} detail onRemoved={() => router.back()} />
        {post.data.status === 'PUBLISHED' ? (
          <View style={{ gap: t.space.lg }}>
            <AppText variant="label" tone="muted">
              Comments
            </AppText>
            {comments.isPending ? (
              <LoadingState />
            ) : items.length === 0 ? (
              <AppText tone="muted">No comments yet. Say something nice.</AppText>
            ) : null}
            {items.map((c) => (
              <Comment
                key={c.id}
                c={c}
                onReply={() => setReplyTo(c)}
                onDelete={() => remove(c.id)}
              />
            ))}
            {comments.hasNextPage ? (
              <Button
                label="More comments"
                variant="ghost"
                onPress={() => void comments.fetchNextPage()}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {post.data.status === 'PUBLISHED' ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.c.border,
            padding: t.space.md,
            paddingBottom: insets.bottom + t.space.sm,
            gap: t.space.xs,
            backgroundColor: t.c.background,
          }}
        >
          {replyTo ? (
            <AppText variant="caption" tone="muted" onPress={() => setReplyTo(null)}>
              Replying to {replyTo.author.displayName ?? replyTo.author.username} · tap to cancel
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.space.sm, alignItems: 'flex-end' }}>
            <TextInput
              accessibilityLabel="Write a comment"
              placeholder="Add a comment…"
              placeholderTextColor={t.c.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              style={[
                t.type.body,
                {
                  flex: 1,
                  color: t.c.text,
                  backgroundColor: t.c.surface,
                  borderRadius: t.radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  maxHeight: 120,
                },
              ]}
            />
            <Button
              label="Post"
              fullWidth={false}
              disabled={!text.trim()}
              loading={send.isPending}
              onPress={() => send.mutate()}
            />
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

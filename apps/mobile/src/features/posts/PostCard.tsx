import type { PostDto } from '@muso/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Avatar, Pill } from '@/components/ui';
import { useTheme } from '@/theme';
import { openAuthor, sharePost, usePostMenu, usePostToggles } from './post-actions';
import { RichText } from './RichText';
import { VideoPlayer } from './VideoPlayer';

const ago = (iso: string | null) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const mmss = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function Action({
  label,
  a11y,
  onPress,
  active,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  active?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        paddingVertical: 6,
        paddingHorizontal: 4,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <AppText variant="bodyStrong" style={{ color: active ? t.c.danger : t.c.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Editorial post: author, media (photo or autoplaying muted video), tags, actions, caption. */
export function PostCard({
  post,
  active = false,
  detail = false,
  onRemoved,
}: {
  post: PostDto;
  active?: boolean;
  detail?: boolean;
  onRemoved?: () => void;
}) {
  const t = useTheme();
  const { toggleLike, toggleSave } = usePostToggles(post);
  const menu = usePostMenu(post, onRemoved);
  const ratio =
    post.media.width && post.media.height
      ? Math.max(0.6, Math.min(1.8, post.media.width / post.media.height))
      : 4 / 5;
  const open = () => !detail && router.push({ pathname: '/posts/[id]', params: { id: post.id } });

  return (
    <View style={{ gap: t.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${post.author.displayName ?? 'author'}’s profile`}
          onPress={() => openAuthor(post)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm, flex: 1 }}
        >
          <Avatar url={post.author.avatarUrl} name={post.author.displayName} size={36} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {post.author.displayName ?? post.author.username ?? 'Someone'}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {[
                post.author.username ? `@${post.author.username}` : null,
                ago(post.publishedAt ?? post.createdAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post options"
          onPress={() => void menu()}
          hitSlop={10}
        >
          <AppText variant="heading">•••</AppText>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole={detail ? undefined : 'button'}
        accessibilityLabel={detail ? undefined : 'Open post'}
        onPress={open}
        disabled={detail}
      >
        <View
          style={{
            aspectRatio: ratio,
            borderRadius: t.radius.lg,
            overflow: 'hidden',
            backgroundColor: t.c.inverseBackground,
          }}
        >
          {post.status !== 'PUBLISHED' ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: t.space.xl,
                gap: t.space.sm,
              }}
            >
              <AppText variant="title" tone="inverse">
                {post.status === 'PROCESSING' ? 'Processing…' : 'Upload failed'}
              </AppText>
              <AppText variant="caption" tone="inverse" align="center">
                {post.status === 'PROCESSING'
                  ? 'Optimising your capture. This usually takes a few seconds.'
                  : (post.failureReason ?? 'Please try another file.')}
              </AppText>
            </View>
          ) : post.type === 'VIDEO' && post.media.url ? (
            <>
              {!active ? (
                <Image
                  source={{ uri: post.media.thumbUrl ?? undefined }}
                  style={{ position: 'absolute', inset: 0 }}
                  contentFit="cover"
                />
              ) : null}
              {active || detail ? (
                <VideoPlayer
                  uri={post.media.url}
                  active={active || detail}
                  controls={detail}
                  style={{ flex: 1 }}
                />
              ) : null}
              {!detail && post.media.durationMs ? (
                <View style={{ position: 'absolute', right: 10, bottom: 10 }}>
                  <Pill label={`▶ ${mmss(post.media.durationMs)}`} />
                </View>
              ) : null}
            </>
          ) : (
            <Image
              source={{ uri: post.media.url ?? undefined }}
              placeholder={{ uri: post.media.thumbUrl ?? undefined }}
              style={{ flex: 1 }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={post.caption || 'Photo'}
            />
          )}
          <View
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              flexDirection: 'row',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {post.event?.status === 'LIVE' ? <Pill label="● Live" tone="accent" /> : null}
            {post.isOfficial ? <Pill label="Official" tone="accent" /> : null}
            {post.hidden ? <Pill label="Hidden" tone="danger" /> : null}
          </View>
        </View>
      </Pressable>

      {post.event || post.artists.length ? (
        <View style={{ flexDirection: 'row', gap: t.space.xs, flexWrap: 'wrap' }}>
          {post.event ? (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                router.push({ pathname: '/events/[id]', params: { id: post.event!.id } })
              }
            >
              <Pill label={`@ ${post.event.title}`} />
            </Pressable>
          ) : null}
          {post.artists.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
            >
              <Pill label={a.stageName} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {post.status === 'PUBLISHED' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
          <Action
            label={`${post.viewer.liked ? '♥' : '♡'} ${post.likeCount}`}
            a11y={post.viewer.liked ? 'Unlike' : 'Like'}
            active={post.viewer.liked}
            onPress={toggleLike}
          />
          <Action
            label={`💬 ${post.commentCount}`}
            a11y="Comments"
            onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } })}
          />
          <Action
            label={post.viewer.saved ? '★ Saved' : '☆ Save'}
            a11y={post.viewer.saved ? 'Unsave' : 'Save'}
            onPress={toggleSave}
          />
          <View style={{ flex: 1 }} />
          <Action label="Share" a11y="Share" onPress={() => void sharePost(post)} />
        </View>
      ) : null}

      {post.caption ? (
        <RichText text={post.caption} numberOfLines={detail ? undefined : 3} />
      ) : null}
    </View>
  );
}

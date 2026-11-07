import { formatMoney, type EventDetail } from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Avatar,
  Button,
  Card,
  ErrorState,
  FormError,
  ListRow,
  LoadingState,
  Pill,
} from '@/components/ui';
import {
  RECORDING_COPY,
  STATUS_LABEL,
  eventKeys,
  formatEventWhen,
  formatTime,
} from '@/features/events/format';
import { pickCapture } from '@/features/posts/capture';
import { useDraft } from '@/features/posts/draft-store';
import { postKeys } from '@/features/posts/keys';
import { PostGrid } from '@/features/posts/PostGrid';
import { PredictionsSection } from '@/features/predictions/PredictionsSection';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function EventDetailScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const setDraft = useDraft((s) => s.set);
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const event = useQuery({ queryKey: eventKeys.detail(id), queryFn: () => api.events.get(id) });

  const onUpdated = (e: EventDetail) => {
    qc.setQueryData(eventKeys.detail(id), e);
    void qc.invalidateQueries({ queryKey: eventKeys.all, refetchType: 'none' });
  };
  const follow = useMutation({
    mutationFn: (on: boolean) => (on ? api.events.follow(id) : api.events.unfollow(id)),
    onSuccess: onUpdated,
  });
  const review = useMutation({
    mutationFn: (v: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api.admin.reviewEvent(id, v),
    onSuccess: (e) => {
      onUpdated(e);
      void qc.invalidateQueries({ queryKey: eventKeys.pending });
    },
  });
  const cancel = useMutation({ mutationFn: () => api.events.cancel(id), onSuccess: onUpdated });
  const moments = useQuery({
    queryKey: postKeys.event(id),
    queryFn: () => api.posts.byEvent(id),
    enabled: event.data?.reviewStatus === 'APPROVED',
  });
  const pools = useQuery({
    queryKey: ['pools', 'event', id],
    queryFn: () => api.rewards.forEvent(id),
    enabled: event.data?.reviewStatus === 'APPROVED',
  });
  const boards = useQuery({
    queryKey: ['events', 'leaderboards', id],
    queryFn: () => api.rewards.leaderboards(id),
    enabled: event.data?.reviewStatus === 'APPROVED',
  });

  if (event.isPending)
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 60, backgroundColor: t.c.background }}>
        <LoadingState />
      </View>
    );
  if (event.isError) {
    return (
      <View
        style={{
          flex: 1,
          padding: t.space.xl,
          paddingTop: insets.top + 60,
          backgroundColor: t.c.background,
        }}
      >
        <ErrorState message={errorMessage(event.error)} onRetry={() => void event.refetch()} />
      </View>
    );
  }
  const e = event.data;
  const canCapture =
    e.reviewStatus === 'APPROVED' && e.status === 'LIVE' && e.recordingPolicy !== 'NOT_ALLOWED';
  const editable = e.viewer.canEdit && e.status !== 'CANCELLED' && e.status !== 'COMPLETED';
  const mutationError = [follow, review, cancel].find((m) => m.isError)?.error;

  const confirmCancel = () =>
    Alert.alert('Cancel this event?', 'Followers will see it as cancelled. This can’t be undone.', [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Cancel event', style: 'destructive', onPress: () => cancel.mutate() },
    ]);

  const reject = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt('Reject event', 'Tell the organizer what to fix (optional).', [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: (note?: string) =>
            review.mutate({ decision: 'REJECTED', note: note?.trim() || undefined }),
        },
      ]);
    } else {
      review.mutate({ decision: 'REJECTED' });
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.c.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
    >
      <View
        style={{
          aspectRatio: 4 / 3,
          backgroundColor: t.c.inverseBackground,
          justifyContent: 'flex-end',
        }}
      >
        {e.coverUrl ? (
          <Image
            source={{ uri: e.coverUrl }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
          />
        ) : null}
        <View style={{ padding: t.space.xl, flexDirection: 'row', gap: t.space.xs }}>
          <Pill
            label={STATUS_LABEL[e.status]}
            tone={e.status === 'LIVE' ? 'accent' : e.status === 'CANCELLED' ? 'danger' : 'neutral'}
          />
          {e.reviewStatus !== 'APPROVED' ? (
            <Pill
              label={e.reviewStatus === 'PENDING' ? 'In review' : 'Not approved'}
              tone={e.reviewStatus === 'REJECTED' ? 'danger' : 'neutral'}
            />
          ) : null}
        </View>
      </View>

      <View style={{ padding: t.space.xl, gap: t.space.lg }}>
        <View style={{ gap: t.space.xs }}>
          <AppText variant="display">{e.title}</AppText>
          <AppText variant="bodyStrong">{formatEventWhen(e.startsAt, e.endsAt)}</AppText>
          <AppText tone="muted">
            {e.venueName}
            {e.address ? `, ${e.address}` : ''} · {e.city}, {e.country}
          </AppText>
        </View>

        {e.reviewStatus === 'PENDING' && e.viewer.canEdit && !e.viewer.canReview ? (
          <Card>
            <AppText variant="caption">
              Your event is waiting for review. Only you can see it until it’s approved.
            </AppText>
          </Card>
        ) : null}
        {e.reviewStatus === 'REJECTED' && e.viewer.canEdit ? (
          <Card>
            <AppText variant="bodyStrong">Not approved</AppText>
            <AppText variant="caption" tone="muted">
              {e.reviewNote ?? 'Update the details and it will be reviewed again.'}
            </AppText>
          </Card>
        ) : null}

        {e.viewer.canReview && e.reviewStatus !== 'APPROVED' ? (
          <Card inverse>
            <AppText variant="heading" tone="inverse">
              Admin review
            </AppText>
            <Button
              label="Approve & publish"
              loading={review.isPending}
              onPress={() => review.mutate({ decision: 'APPROVED' })}
            />
            {e.reviewStatus === 'PENDING' ? (
              <Button label="Reject" variant="danger" onPress={reject} />
            ) : null}
          </Card>
        ) : null}

        {e.reviewStatus === 'APPROVED' && e.status !== 'CANCELLED' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <View style={{ flex: 1 }}>
              <Button
                label={e.viewer.isFollowing ? 'Following' : 'Follow event'}
                variant={e.viewer.isFollowing ? 'ghost' : 'primary'}
                loading={follow.isPending}
                onPress={() => follow.mutate(!e.viewer.isFollowing)}
              />
            </View>
            <AppText variant="caption" tone="muted">
              {e.followerCount} {e.followerCount === 1 ? 'follower' : 'followers'}
            </AppText>
          </View>
        ) : null}

        <FormError message={mutationError ? errorMessage(mutationError) : null} />

        <Card>
          <AppText variant="label" tone="muted">
            Recording
          </AppText>
          <AppText variant="bodyStrong">{RECORDING_COPY[e.recordingPolicy].title}</AppText>
          <AppText variant="caption" tone="muted">
            {e.recordingNotes ?? RECORDING_COPY[e.recordingPolicy].body}
          </AppText>
        </Card>

        {canCapture ? (
          <Button
            label="📸 Capture this moment"
            onPress={async () => {
              try {
                const draft = await pickCapture(
                  e.recordingPolicy === 'PHOTOS_ONLY' ? 'camera-photo' : 'library',
                  e.id,
                );
                if (draft) {
                  setDraft(draft);
                  router.push('/compose');
                }
              } catch (err) {
                Alert.alert('Couldn’t open camera', errorMessage(err));
              }
            }}
          />
        ) : null}

        <AppText>{e.description}</AppText>

        {e.reviewStatus === 'APPROVED' ? (
          <View style={{ gap: t.space.sm }}>
            <AppText variant="label" tone="muted">
              Moments
              {moments.data?.items.length
                ? ` · ${moments.data.items.length}${moments.data.nextCursor ? '+' : ''}`
                : ''}
            </AppText>
            {moments.isPending ? (
              <LoadingState />
            ) : moments.data?.items.length ? (
              <PostGrid posts={moments.data.items} />
            ) : (
              <AppText tone="muted">
                {e.status === 'UPCOMING'
                  ? 'Photos and videos from the crowd will appear here once the show starts.'
                  : 'No moments shared yet.'}
              </AppText>
            )}
          </View>
        ) : null}

        {e.reviewStatus === 'APPROVED' && (pools.data?.length || e.viewer.canEdit) ? (
          <View style={{ gap: t.space.sm }}>
            <AppText variant="label" tone="muted">
              Creator rewards
            </AppText>
            {pools.data?.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/pools/[id]', params: { id: p.id } })}
              >
                <Card inverse>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="heading" tone="inverse">
                      {formatMoney(p.budgetMinor, p.currency)} pool
                    </AppText>
                    <Pill
                      label={p.status === 'ACTIVE' ? '● Active' : p.status.toLowerCase()}
                      tone={p.status === 'ACTIVE' ? 'accent' : 'neutral'}
                    />
                  </View>
                  <AppText variant="caption" tone="inverse">
                    {p.title} · funded by {p.sponsorName}. Upload videos here and earn by qualified
                    watch time.
                  </AppText>
                </Card>
              </Pressable>
            ))}
            {e.viewer.canEdit && e.status !== 'CANCELLED' && e.status !== 'COMPLETED' ? (
              <Button
                label="Create a reward pool"
                variant="ghost"
                onPress={() => router.push({ pathname: '/pools/new', params: { eventId: e.id } })}
              />
            ) : null}
          </View>
        ) : null}

        {e.reviewStatus === 'APPROVED' ? (
          <PredictionsSection
            eventId={e.id}
            canEdit={e.viewer.canEdit}
            ended={e.status === 'CANCELLED' || e.status === 'COMPLETED'}
          />
        ) : null}

        {boards.data &&
        (boards.data.watchTime.length ||
          boards.data.mostLoved.length ||
          boards.data.mostSupported.length) ? (
          <View style={{ gap: t.space.sm }}>
            <AppText variant="label" tone="muted">
              Leaderboards
            </AppText>
            {boards.data.watchTime.length ? (
              <Card>
                <AppText variant="bodyStrong">Most watched creators</AppText>
                {boards.data.watchTime.slice(0, 5).map((w, i) => (
                  <AppText key={w.creatorId} variant="caption">
                    {i + 1}. {w.displayName ?? w.username} ·{' '}
                    {Math.max(1, Math.round(w.qualifiedSeconds / 60))} min qualified
                  </AppText>
                ))}
              </Card>
            ) : null}
            {boards.data.mostLoved.length ? (
              <Card>
                <AppText variant="bodyStrong">Most loved moments</AppText>
                {boards.data.mostLoved.slice(0, 5).map((m, i) => (
                  <AppText
                    key={m.postId}
                    variant="caption"
                    onPress={() =>
                      router.push({ pathname: '/posts/[id]', params: { id: m.postId } })
                    }
                  >
                    {i + 1}. {m.creatorName} · ♥ {m.likes}
                  </AppText>
                ))}
              </Card>
            ) : null}
            {boards.data.mostSupported.length ? (
              <Card>
                <AppText variant="bodyStrong">Most supported creators</AppText>
                {boards.data.mostSupported.slice(0, 5).map((s, i) => (
                  <AppText key={s.creatorId} variant="caption">
                    {i + 1}. {s.displayName ?? s.username} · {s.supporters} supporters
                  </AppText>
                ))}
              </Card>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: t.space.xs }}>
          <AppText variant="label" tone="muted">
            Lineup
          </AppText>
          {e.lineup.length === 0 ? (
            <AppText tone="muted">To be announced.</AppText>
          ) : (
            e.lineup.map((a) => (
              <ListRow
                key={a.id}
                title={a.stageName}
                subtitle={a.position === 0 ? 'Headliner' : undefined}
                left={<Avatar url={a.avatarUrl} name={a.stageName} size={44} />}
                onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
              />
            ))
          )}
        </View>

        {e.schedule.length ? (
          <View style={{ gap: t.space.sm }}>
            <AppText variant="label" tone="muted">
              Schedule
            </AppText>
            {e.schedule.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', gap: t.space.md }}>
                <AppText variant="bodyStrong" style={{ width: 80 }}>
                  {formatTime(s.startsAt)}
                </AppText>
                <View style={{ flex: 1 }}>
                  <AppText>{s.title}</AppText>
                  {s.stage || s.artist ? (
                    <AppText variant="caption" tone="muted">
                      {[s.artist?.stageName, s.stage].filter(Boolean).join(' · ')}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: t.space.xs }}>
          <AppText variant="label" tone="muted">
            Presented by
          </AppText>
          <ListRow
            title={e.organizer.organizationName ?? e.organizer.displayName ?? 'Organizer'}
            left={
              <Avatar
                url={e.organizer.avatarUrl}
                name={e.organizer.organizationName ?? e.organizer.displayName}
                size={40}
              />
            }
          />
        </View>

        {editable ? (
          <View style={{ gap: t.space.sm }}>
            <AppText variant="label" tone="muted">
              Manage
            </AppText>
            <Button
              label="Edit details"
              variant="secondary"
              onPress={() => router.push({ pathname: '/events/[id]/edit', params: { id } })}
            />
            <Button
              label="Edit lineup"
              variant="ghost"
              onPress={() => router.push({ pathname: '/events/[id]/lineup', params: { id } })}
            />
            <Button
              label="Edit schedule"
              variant="ghost"
              onPress={() => router.push({ pathname: '/events/[id]/schedule', params: { id } })}
            />
            <Pressable
              accessibilityRole="button"
              onPress={confirmCancel}
              style={{ alignSelf: 'center', padding: t.space.md }}
            >
              <AppText tone="danger">{cancel.isPending ? 'Cancelling…' : 'Cancel event'}</AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

import type { ArtistSummary, EventSummary, PricingInput } from '@muso/shared';
import { MAX_CAPTION, MAX_TAGGED_ARTISTS } from '@muso/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  FormError,
  Screen,
  TextField,
} from '@/components/ui';
import { RECORDING_COPY } from '@/features/events/format';
import { PricingPicker } from '@/features/money/PricingPicker';
import { useDraft } from '@/features/posts/draft-store';
import { postKeys } from '@/features/posts/keys';
import { putWithProgress } from '@/features/posts/upload';
import { VideoPlayer } from '@/features/posts/VideoPlayer';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

type Phase =
  | { kind: 'editing' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'publishing' }
  | { kind: 'error'; message: string };

export default function ComposeScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const draft = useDraft((s) => s.draft);
  const clearDraft = useDraft((s) => s.clear);
  const [caption, setCaption] = useState('');
  const [eventId, setEventId] = useState<string | null>(draft?.eventId ?? null);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [artistQuery, setArtistQuery] = useState('');
  const [rights, setRights] = useState(false);
  const [pricing, setPricing] = useState<PricingInput>({ mode: 'FREE', tipsEnabled: true });
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  /** Storage key of a completed upload, reused when retrying the publish step. */
  const uploadedKey = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Events you can post to: happening now, or recently finished.
  const live = useQuery({
    queryKey: ['compose', 'events', 'live'],
    queryFn: () => api.events.list({ when: 'live', limit: 10 }),
  });
  const past = useQuery({
    queryKey: ['compose', 'events', 'past'],
    queryFn: () => api.events.list({ when: 'past', limit: 10 }),
  });
  const events: EventSummary[] = [...(live.data?.items ?? []), ...(past.data?.items ?? [])];
  const selectedEvent = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => api.events.get(eventId!),
    enabled: !!eventId,
  });

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(artistQuery.trim()), 250);
    return () => clearTimeout(h);
  }, [artistQuery]);
  const artistResults = useQuery({
    queryKey: ['artists', 'search', debounced],
    queryFn: () => api.artists.search(debounced, 8),
    enabled: debounced.length > 0,
  });

  useEffect(() => () => abort.current?.abort(), []);

  if (!draft) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          title="Nothing to post."
          body="Go back and capture or choose a photo or video."
        />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const policy = selectedEvent.data?.recordingPolicy;
  const blockedByPolicy =
    policy === 'NOT_ALLOWED' || (policy === 'PHOTOS_ONLY' && draft.type === 'VIDEO');
  const busy = phase.kind === 'uploading' || phase.kind === 'publishing';

  const toggleArtist = (a: ArtistSummary) =>
    setArtists((cur) =>
      cur.some((x) => x.id === a.id)
        ? cur.filter((x) => x.id !== a.id)
        : cur.length >= MAX_TAGGED_ARTISTS
          ? cur
          : [...cur, a],
    );

  const publish = async () => {
    try {
      if (!uploadedKey.current) {
        setPhase({ kind: 'uploading', progress: 0 });
        const presigned = await api.posts.presign(
          draft.type === 'PHOTO'
            ? {
                type: 'PHOTO',
                contentType: draft.mimeType as 'image/jpeg',
                sizeBytes: draft.sizeBytes,
              }
            : {
                type: 'VIDEO',
                contentType: draft.mimeType as 'video/mp4',
                sizeBytes: draft.sizeBytes,
              },
        );
        const blob = await (await fetch(draft.uri)).blob();
        abort.current = new AbortController();
        await putWithProgress(
          presigned.uploadUrl,
          presigned.headers,
          blob,
          (p) => setPhase({ kind: 'uploading', progress: p }),
          abort.current.signal,
        );
        uploadedKey.current = presigned.key;
      }
      setPhase({ kind: 'publishing' });
      const post = await api.posts.create({
        clientRequestId: draft.clientRequestId,
        mediaKey: uploadedKey.current,
        type: draft.type,
        caption: caption.trim(),
        eventId,
        artistIds: artists.map((a) => a.id),
        rightsConfirmed: true,
        pricing,
      });
      clearDraft();
      void qc.invalidateQueries({ queryKey: postKeys.all });
      router.replace({ pathname: '/posts/[id]', params: { id: post.id } });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err) });
    }
  };

  const lineup = selectedEvent.data?.lineup ?? [];

  return (
    <Screen keyboard edges={['bottom']}>
      <View
        style={{
          aspectRatio: Math.max(0.7, Math.min(1.6, draft.width / Math.max(draft.height, 1))),
          borderRadius: t.radius.lg,
          overflow: 'hidden',
          backgroundColor: t.c.inverseBackground,
        }}
      >
        {draft.type === 'VIDEO' ? (
          <VideoPlayer uri={draft.uri} active controls style={{ flex: 1 }} />
        ) : (
          <Image source={{ uri: draft.uri }} style={{ flex: 1 }} contentFit="cover" />
        )}
      </View>

      <TextField
        label={`Caption · ${caption.length}/${MAX_CAPTION}`}
        placeholder="What happened? Use #tags and @mentions"
        multiline
        maxLength={MAX_CAPTION}
        style={{ minHeight: 90, textAlignVertical: 'top' }}
        value={caption}
        onChangeText={setCaption}
        editable={!busy}
      />

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Event
        </AppText>
        {events.length === 0 ? (
          <AppText variant="caption" tone="muted">
            No live or recent events to tag. You can still post without one.
          </AppText>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {events.map((e) => (
              <Chip
                key={e.id}
                label={`${e.status === 'LIVE' ? '● ' : ''}${e.title}`}
                selected={eventId === e.id}
                disabled={busy}
                onPress={() => setEventId(eventId === e.id ? null : e.id)}
              />
            ))}
          </View>
        )}
        {policy ? (
          <Card>
            <AppText variant="bodyStrong">{RECORDING_COPY[policy].title}</AppText>
            <AppText variant="caption" tone={blockedByPolicy ? 'danger' : 'muted'}>
              {blockedByPolicy
                ? 'This event doesn’t allow this kind of capture. Remove the event to post.'
                : (selectedEvent.data?.recordingNotes ?? RECORDING_COPY[policy].body)}
            </AppText>
          </Card>
        ) : null}
      </View>

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Tag artists · up to {MAX_TAGGED_ARTISTS}
        </AppText>
        {artists.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {artists.map((a) => (
              <Chip
                key={a.id}
                label={`${a.stageName} ✕`}
                selected
                onPress={() => toggleArtist(a)}
                disabled={busy}
              />
            ))}
          </View>
        ) : null}
        {lineup.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {lineup
              .filter((a) => !artists.some((x) => x.id === a.id))
              .map((a) => (
                <Chip
                  key={a.id}
                  label={`+ ${a.stageName}`}
                  selected={false}
                  disabled={busy}
                  onPress={() =>
                    toggleArtist({
                      id: a.id,
                      stageName: a.stageName,
                      avatarUrl: a.avatarUrl,
                      city: null,
                      genres: [],
                    })
                  }
                />
              ))}
          </View>
        ) : null}
        <TextField
          label="Search artists"
          placeholder="Name"
          value={artistQuery}
          onChangeText={setArtistQuery}
          autoCorrect={false}
          editable={!busy}
        />
        {artistResults.data?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {artistResults.data
              .filter((a) => !artists.some((x) => x.id === a.id))
              .map((a) => (
                <Chip
                  key={a.id}
                  label={`+ ${a.stageName}`}
                  selected={false}
                  disabled={busy}
                  onPress={() => toggleArtist(a)}
                />
              ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Earnings
        </AppText>
        <PricingPicker value={pricing} onChange={setPricing} disabled={busy} />
        {pricing.mode !== 'FREE' && artists.length ? (
          <AppText variant="caption" tone="muted">
            Selling captures needs permission from every tagged artist. If one hasn’t allowed it,
            you’ll be asked to post for free (tips still work).
          </AppText>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rights }}
        onPress={() => setRights((r) => !r)}
        disabled={busy}
        style={{
          flexDirection: 'row',
          gap: t.space.md,
          alignItems: 'flex-start',
          padding: t.space.md,
          borderRadius: t.radius.md,
          borderWidth: 1.5,
          borderColor: rights ? t.c.text : t.c.border,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: t.c.text,
            backgroundColor: rights ? t.c.text : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {rights ? (
            <AppText variant="caption" tone="inverse">
              ✓
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" style={{ flex: 1 }}>
          I captured this myself and have the right to share it. I understand this doesn’t give me
          rights to the artist’s performance or music, and I won’t post private moments of people
          without consent.
        </AppText>
      </Pressable>

      {phase.kind === 'uploading' ? (
        <View
          style={{ gap: t.space.xs }}
          accessibilityLabel={`Uploading ${Math.round(phase.progress * 100)} percent`}
        >
          <View
            style={{ height: 6, borderRadius: 3, backgroundColor: t.c.border, overflow: 'hidden' }}
          >
            <View
              style={{
                height: 6,
                width: `${Math.round(phase.progress * 100)}%`,
                backgroundColor: t.c.text,
              }}
            />
          </View>
          <AppText variant="caption" tone="muted">
            Uploading… {Math.round(phase.progress * 100)}%
          </AppText>
        </View>
      ) : null}
      <FormError message={phase.kind === 'error' ? phase.message : null} />

      <Button
        label={
          phase.kind === 'error' ? 'Retry' : phase.kind === 'publishing' ? 'Publishing…' : 'Publish'
        }
        loading={busy}
        disabled={!rights || blockedByPolicy}
        onPress={() => void publish()}
      />
      {phase.kind === 'uploading' ? (
        <Button label="Cancel upload" variant="ghost" onPress={() => abort.current?.abort()} />
      ) : null}
    </Screen>
  );
}

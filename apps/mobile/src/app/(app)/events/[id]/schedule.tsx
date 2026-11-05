import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { EventDetail } from '@muso/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  DateTimeField,
  ErrorState,
  FormError,
  LoadingState,
  Screen,
  TextField,
} from '@/components/ui';
import { eventKeys, formatTime } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

type Item = { title: string; stage?: string; startsAt: string; artistId: string | null };

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useQuery({ queryKey: eventKeys.detail(id), queryFn: () => api.events.get(id) });
  if (event.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (event.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState message={errorMessage(event.error)} onRetry={() => void event.refetch()} />
      </Screen>
    );
  return <ScheduleEditor event={event.data} />;
}

function ScheduleEditor({ event: e }: { event: EventDetail }) {
  const t = useTheme();
  const id = e.id;
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>(() =>
    e.schedule.map((s) => ({
      title: s.title,
      stage: s.stage ?? undefined,
      startsAt: s.startsAt,
      artistId: s.artist?.id ?? null,
    })),
  );
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState(() => new Date(e.startsAt));
  const [artistId, setArtistId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>();

  const save = useMutation({
    mutationFn: () =>
      api.events.setSchedule(id, { items: items.map((i) => ({ ...i, stage: i.stage ?? '' })) }),
    onSuccess: (e) => {
      qc.setQueryData(eventKeys.detail(id), e);
      router.back();
    },
  });

  const artistName = (aid: string | null) => e.lineup.find((a) => a.id === aid)?.stageName;

  const addItem = () => {
    if (!title.trim()) return setFormError('Give the slot a title');
    setFormError(undefined);
    setItems((cur) =>
      [
        ...cur,
        {
          title: title.trim(),
          stage: stage.trim() || undefined,
          startsAt: start.toISOString(),
          artistId,
        },
      ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    );
    setTitle('');
    setArtistId(null);
  };

  return (
    <Screen keyboard edges={['bottom']}>
      {items.length === 0 ? (
        <AppText tone="muted">No schedule yet. Add set times below.</AppText>
      ) : null}
      {items.map((it, i) => (
        <View
          key={`${it.startsAt}-${i}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}
        >
          <AppText variant="bodyStrong" style={{ width: 80 }}>
            {formatTime(it.startsAt)}
          </AppText>
          <View style={{ flex: 1 }}>
            <AppText>{it.title}</AppText>
            {it.stage || it.artistId ? (
              <AppText variant="caption" tone="muted">
                {[artistName(it.artistId), it.stage].filter(Boolean).join(' · ')}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${it.title}`}
            hitSlop={8}
            onPress={() => setItems((cur) => cur.filter((_, j) => j !== i))}
          >
            <AppText variant="bodyStrong">✕</AppText>
          </Pressable>
        </View>
      ))}
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label="Save schedule" loading={save.isPending} onPress={() => save.mutate()} />

      <Card>
        <AppText variant="heading">Add a slot</AppText>
        <TextField
          label="Title"
          placeholder="Doors open, Main set…"
          value={title}
          onChangeText={setTitle}
          error={formError}
        />
        <TextField label="Stage (optional)" value={stage} onChangeText={setStage} />
        <DateTimeField label="Starts" value={start} onChange={setStart} />
        {e.lineup.length ? (
          <View style={{ gap: t.space.xs }}>
            <AppText variant="label" tone="muted">
              Artist (optional)
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
              {e.lineup.map((a) => (
                <Chip
                  key={a.id}
                  label={a.stageName}
                  selected={artistId === a.id}
                  onPress={() => setArtistId(artistId === a.id ? null : a.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Button label="Add slot" variant="secondary" onPress={addItem} />
      </Card>
    </Screen>
  );
}

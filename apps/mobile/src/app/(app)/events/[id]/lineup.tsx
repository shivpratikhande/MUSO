import type { ArtistSummary, EventDetail } from '@muso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  FormError,
  ListRow,
  LoadingState,
  Screen,
  TextField,
} from '@/components/ui';
import { eventKeys } from '@/features/events/format';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

type Slot = { id: string; stageName: string; avatarUrl: string | null };

export default function LineupScreen() {
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
  return <LineupEditor event={event.data} />;
}

function LineupEditor({ event }: { event: EventDetail }) {
  const t = useTheme();
  const id = event.id;
  const qc = useQueryClient();
  const [lineup, setLineup] = useState<Slot[]>(() =>
    event.lineup.map(({ id: aid, stageName, avatarUrl }) => ({ id: aid, stageName, avatarUrl })),
  );
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  const results = useQuery({
    queryKey: ['artists', 'search', debounced],
    queryFn: () => api.artists.search(debounced || undefined, 15),
  });
  const save = useMutation({
    mutationFn: () => api.events.setLineup(id, { artistIds: lineup.map((a) => a.id) }),
    onSuccess: (e) => {
      qc.setQueryData(eventKeys.detail(id), e);
      void qc.invalidateQueries({ queryKey: eventKeys.all, refetchType: 'none' });
      router.back();
    },
  });

  const move = (i: number, d: -1 | 1) =>
    setLineup((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const add = (a: ArtistSummary) =>
    setLineup((cur) =>
      cur.some((x) => x.id === a.id)
        ? cur
        : [...cur, { id: a.id, stageName: a.stageName, avatarUrl: a.avatarUrl }],
    );
  const remove = (aid: string) => setLineup((cur) => cur.filter((x) => x.id !== aid));

  const smallBtn = (label: string, onPress: () => void, a11y: string, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={{ paddingHorizontal: 8, paddingVertical: 4, opacity: disabled ? 0.3 : 1 }}
    >
      <AppText variant="bodyStrong">{label}</AppText>
    </Pressable>
  );

  return (
    <Screen keyboard edges={['bottom']}>
      <AppText variant="label" tone="muted">
        Billing order · first is the headliner
      </AppText>
      {lineup.length === 0 ? (
        <AppText tone="muted">No artists yet. Search below to add.</AppText>
      ) : null}
      {lineup.map((a, i) => (
        <ListRow
          key={a.id}
          title={a.stageName}
          subtitle={i === 0 ? 'Headliner' : `#${i + 1}`}
          left={<Avatar url={a.avatarUrl} name={a.stageName} size={40} />}
          right={
            <View style={{ flexDirection: 'row' }}>
              {smallBtn('↑', () => move(i, -1), `Move ${a.stageName} up`, i === 0)}
              {smallBtn('↓', () => move(i, 1), `Move ${a.stageName} down`, i === lineup.length - 1)}
              {smallBtn('✕', () => remove(a.id), `Remove ${a.stageName}`)}
            </View>
          }
        />
      ))}
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label="Save lineup" loading={save.isPending} onPress={() => save.mutate()} />

      <View style={{ height: 1, backgroundColor: t.c.border, marginVertical: t.space.sm }} />
      <TextField
        label="Add artists"
        placeholder="Search by name"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
      />
      {results.isPending ? (
        <LoadingState />
      ) : results.isError ? (
        <ErrorState message={errorMessage(results.error)} onRetry={() => void results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState
          title="No artists found."
          body="Artists appear here once they’ve set up their MUSO page."
        />
      ) : (
        results.data.map((a) => {
          const added = lineup.some((x) => x.id === a.id);
          return (
            <ListRow
              key={a.id}
              title={a.stageName}
              subtitle={
                [a.genres.map((g) => g.name).join(', '), a.city].filter(Boolean).join(' · ') ||
                undefined
              }
              left={<Avatar url={a.avatarUrl} name={a.stageName} size={40} />}
              right={
                <AppText variant="bodyStrong" tone={added ? 'muted' : 'default'}>
                  {added ? 'Added' : 'Add'}
                </AppText>
              }
              onPress={added ? undefined : () => add(a)}
            />
          );
        })
      )}
    </Screen>
  );
}

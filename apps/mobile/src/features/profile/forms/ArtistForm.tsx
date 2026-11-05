import { CONTENT_USAGE_POLICIES, type ContentUsagePolicy, type MyProfile } from '@muso/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  Chip,
  ErrorState,
  FormError,
  ImageField,
  LoadingState,
  TextField,
} from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

const POLICY_COPY: Record<ContentUsagePolicy, { title: string; body: string }> = {
  PERSONAL_SHARING_ONLY: {
    title: 'Share, don’t sell',
    body: 'Fans can post and share captures of your shows. Commercial use needs your licence.',
  },
  FAN_MONETIZATION_ALLOWED: {
    title: 'Fans can earn',
    body: 'Fans can post, share and sell access to their own captures of your shows.',
  },
  NO_RECORDINGS: {
    title: 'No recordings',
    body: 'Ask fans not to post recordings of your performances.',
  },
};

export function ArtistForm({
  profile,
  submitLabel,
  onSaved,
}: {
  profile: MyProfile;
  submitLabel: string;
  onSaved: (p: MyProfile) => void;
}) {
  const t = useTheme();
  const apply = useApplyProfile();
  const a = profile.artistProfile;
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: () => api.genres.list(),
    staleTime: Infinity,
  });

  const [stageName, setStageName] = useState(a?.stageName ?? profile.displayName ?? '');
  const [genreIds, setGenreIds] = useState<string[]>(a?.genres.map((g) => g.id) ?? []);
  const [cover, setCover] = useState<{ key: string | null | undefined; url: string | null }>({
    key: undefined,
    url: a?.coverUrl ?? null,
  });
  const [policy, setPolicy] = useState<ContentUsagePolicy>(
    a?.contentUsagePolicy ?? 'PERSONAL_SHARING_ONLY',
  );
  const [nameError, setNameError] = useState<string>();

  const save = useMutation({
    mutationFn: () =>
      api.me.saveArtist({
        stageName,
        genreIds,
        contentUsagePolicy: policy,
        ...(cover.key !== undefined ? { coverKey: cover.key } : {}),
      }),
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });

  const submit = () => {
    if (!stageName.trim()) return setNameError('Add your artist or band name');
    setNameError(undefined);
    save.mutate();
  };

  const toggleGenre = (id: string) =>
    setGenreIds((cur) =>
      cur.includes(id) ? cur.filter((g) => g !== id) : cur.length >= 5 ? cur : [...cur, id],
    );

  return (
    <View style={{ gap: t.space.lg }}>
      <TextField
        label="Artist / band name"
        value={stageName}
        onChangeText={setStageName}
        error={nameError}
      />
      <ImageField
        label="Cover image"
        purpose="ARTIST_COVER"
        url={cover.url}
        onUploaded={(key, url) => setCover({ key, url })}
      />

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Genres · up to 5
        </AppText>
        {genres.isPending ? (
          <LoadingState />
        ) : genres.isError ? (
          <ErrorState message={errorMessage(genres.error)} onRetry={() => void genres.refetch()} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
            {genres.data.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                selected={genreIds.includes(g.id)}
                disabled={!genreIds.includes(g.id) && genreIds.length >= 5}
                onPress={() => toggleGenre(g.id)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Fan recordings of your shows
        </AppText>
        {CONTENT_USAGE_POLICIES.map((p) => {
          const on = policy === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setPolicy(p)}
              style={{
                borderWidth: 1.5,
                borderColor: on ? t.c.text : t.c.border,
                borderRadius: t.radius.md,
                padding: t.space.md,
                gap: 2,
              }}
            >
              <AppText variant="bodyStrong">
                {on ? '● ' : '○ '}
                {POLICY_COPY[p].title}
              </AppText>
              <AppText variant="caption" tone="muted">
                {POLICY_COPY[p].body}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label={submitLabel} loading={save.isPending} onPress={submit} />
    </View>
  );
}

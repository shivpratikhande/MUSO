import type { MyProfile } from '@muso/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, ErrorState, FormError, LoadingState } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

export function InterestsForm({
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
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: () => api.genres.list(),
    staleTime: Infinity,
  });
  const [ids, setIds] = useState<string[]>(profile.interests.map((g) => g.id));
  const save = useMutation({
    mutationFn: () => api.me.setInterests(ids),
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });
  return (
    <View style={{ gap: t.space.lg }}>
      <AppText variant="label" tone="muted">
        Pick up to 10
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
              selected={ids.includes(g.id)}
              disabled={!ids.includes(g.id) && ids.length >= 10}
              onPress={() =>
                setIds((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : [...c, g.id]))
              }
            />
          ))}
        </View>
      )}
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label={submitLabel} loading={save.isPending} onPress={() => save.mutate()} />
    </View>
  );
}

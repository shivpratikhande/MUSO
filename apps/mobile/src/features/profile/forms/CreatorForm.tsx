import { CREATOR_FOCUSES, HttpUrlSchema, type MyProfile } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FormError, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

type Focus = (typeof CREATOR_FOCUSES)[number];
const LABEL: Record<Focus, string> = { PHOTOGRAPHY: 'Photography', VIDEOGRAPHY: 'Video' };

export function CreatorForm({
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
  const [focus, setFocus] = useState<Focus[]>(profile.creatorProfile?.focus ?? ['PHOTOGRAPHY']);
  const [portfolio, setPortfolio] = useState(profile.creatorProfile?.portfolioUrl ?? '');
  const [urlError, setUrlError] = useState<string>();

  const save = useMutation({
    mutationFn: () => api.me.saveCreator({ focus, portfolioUrl: portfolio.trim() || null }),
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });

  const submit = () => {
    if (portfolio.trim() && !HttpUrlSchema.safeParse(portfolio.trim()).success)
      return setUrlError('Enter a valid https:// link');
    setUrlError(undefined);
    save.mutate();
  };

  return (
    <View style={{ gap: t.space.lg }}>
      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          What do you shoot?
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          {CREATOR_FOCUSES.map((f) => (
            <Chip
              key={f}
              label={LABEL[f]}
              selected={focus.includes(f)}
              onPress={() =>
                setFocus((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
              }
            />
          ))}
        </View>
      </View>
      <TextField
        label="Portfolio link (optional)"
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        value={portfolio}
        onChangeText={setPortfolio}
        error={urlError}
      />
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button
        label={submitLabel}
        disabled={focus.length === 0}
        loading={save.isPending}
        onPress={submit}
      />
    </View>
  );
}

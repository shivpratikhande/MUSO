import { zodResolver } from '@hookform/resolvers/zod';
import { CountryCodeSchema, ProfileLinkSchema, UsernameSchema, type MyProfile } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { AppText, Button, FormError, ImageField, SwitchRow, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

const Schema = z.object({
  displayName: z.string().trim().min(1, 'Add your name').max(60),
  username: UsernameSchema,
  bio: z.string().trim().max(300, 'Keep it under 300 characters'),
  city: z.string().trim().max(80),
  country: z.union([z.literal(''), CountryCodeSchema]),
  links: z.array(ProfileLinkSchema).max(6),
  showLocation: z.boolean(),
});

export function BasicsForm({
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
  const [avatar, setAvatar] = useState<{ key: string | null; url: string | null }>({
    key: profile.avatarKey,
    url: profile.avatarUrl,
  });

  const { control, handleSubmit } = useForm({
    resolver: zodResolver(Schema),
    defaultValues: {
      displayName: profile.displayName ?? '',
      username: profile.username ?? '',
      bio: profile.bio ?? '',
      city: profile.city ?? '',
      country: profile.country ?? 'IN',
      links: profile.links,
      showLocation: profile.showLocation,
    },
  });
  const links = useFieldArray({ control, name: 'links' });

  const save = useMutation({
    mutationFn: (v: z.output<typeof Schema>) =>
      api.me.update({ ...v, country: v.country === '' ? null : v.country, avatarKey: avatar.key }),
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });
  const submit = () => void handleSubmit((v) => save.mutate(v))();

  return (
    <View style={{ gap: t.space.lg }}>
      <ImageField
        label="Profile photo"
        purpose="AVATAR"
        round
        aspect={[1, 1]}
        url={avatar.url}
        onUploaded={(key, url) => setAvatar({ key, url })}
      />
      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label="Name"
            autoComplete="name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="username"
        render={({ field, fieldState }) => (
          <TextField
            label="Username"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Letters, numbers, _ and ."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="bio"
        render={({ field, fieldState }) => (
          <TextField
            label="Bio"
            multiline
            numberOfLines={3}
            style={{ minHeight: 88, textAlignVertical: 'top' }}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <View style={{ flexDirection: 'row', gap: t.space.md }}>
        <View style={{ flex: 2 }}>
          <Controller
            control={control}
            name="city"
            render={({ field, fieldState }) => (
              <TextField
                label="City"
                autoComplete="postal-address-locality"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="country"
            render={({ field, fieldState }) => (
              <TextField
                label="Country"
                autoCapitalize="characters"
                maxLength={2}
                placeholder="IN"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
      </View>
      <Controller
        control={control}
        name="showLocation"
        render={({ field }) => (
          <SwitchRow
            label="Show my city on my profile"
            hint="Turn off to keep your location private."
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <View style={{ gap: t.space.sm }}>
        <AppText variant="label" tone="muted">
          Links
        </AppText>
        {links.fields.map((f, i) => (
          <View
            key={f.id}
            style={{
              gap: t.space.sm,
              borderLeftWidth: 2,
              borderLeftColor: t.c.border,
              paddingLeft: t.space.md,
            }}
          >
            <Controller
              control={control}
              name={`links.${i}.label`}
              render={({ field, fieldState }) => (
                <TextField
                  label="Label"
                  placeholder="Instagram"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`links.${i}.url`}
              render={({ field, fieldState }) => (
                <TextField
                  label="URL"
                  placeholder="https://"
                  autoCapitalize="none"
                  keyboardType="url"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Button
              label="Remove link"
              variant="ghost"
              fullWidth={false}
              onPress={() => links.remove(i)}
            />
          </View>
        ))}
        {links.fields.length < 6 ? (
          <Button
            label="Add a link"
            variant="ghost"
            fullWidth={false}
            onPress={() => links.append({ label: '', url: 'https://' })}
          />
        ) : null}
      </View>

      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label={submitLabel} loading={save.isPending} onPress={submit} />
    </View>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { OrganizerProfileInputSchema, type MyProfile } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button, FormError, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

export function OrganizerForm({
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
  const o = profile.organizerProfile;
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(OrganizerProfileInputSchema),
    defaultValues: {
      organizationName: o?.organizationName ?? '',
      contactEmail: o?.contactEmail ?? profile.email,
      contactPhone: o?.contactPhone ?? '',
      website: o?.website ?? null,
    },
  });
  const save = useMutation({
    mutationFn: api.me.saveOrganizer,
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });
  const submit = () => void handleSubmit((v) => save.mutate(v))();

  return (
    <View style={{ gap: t.space.lg }}>
      <Controller
        control={control}
        name="organizationName"
        render={({ field, fieldState }) => (
          <TextField
            label="Organization / promoter name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="contactEmail"
        render={({ field, fieldState }) => (
          <TextField
            label="Contact email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="contactPhone"
        render={({ field, fieldState }) => (
          <TextField
            label="Phone (optional)"
            keyboardType="phone-pad"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="website"
        render={({ field, fieldState }) => (
          <TextField
            label="Website (optional)"
            placeholder="https://"
            autoCapitalize="none"
            keyboardType="url"
            value={field.value ?? ''}
            onChangeText={(v) => field.onChange(v.trim() === '' ? null : v)}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button label={submitLabel} loading={save.isPending} onPress={submit} />
    </View>
  );
}

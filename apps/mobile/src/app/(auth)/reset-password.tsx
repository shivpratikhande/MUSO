import { zodResolver } from '@hookform/resolvers/zod';
import { ResetPasswordSchema } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { AppText, Button, Card, FormError, Screen, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';

export default function ResetPasswordScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { email, code: '', newPassword: '' },
  });
  const mutation = useMutation({ mutationFn: api.auth.resetPassword });
  const submit = () => void handleSubmit((v) => mutation.mutate(v))();

  if (mutation.isSuccess) {
    return (
      <Screen edges={['top', 'bottom']} contentStyle={{ paddingTop: 72 }}>
        <AppText variant="display">Password updated.</AppText>
        <AppText tone="muted">
          For your security we signed you out on every device. Sign in with your new password.
        </AppText>
        <Button label="Sign in" onPress={() => router.dismissTo('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen keyboard edges={['top', 'bottom']} contentStyle={{ paddingTop: 72 }}>
      <AppText variant="display">Check your email.</AppText>
      <Card>
        <AppText variant="caption" tone="muted">
          Code sent to
        </AppText>
        <AppText variant="bodyStrong">{email}</AppText>
      </Card>
      <FormError message={mutation.isError ? errorMessage(mutation.error) : null} />
      <Controller
        control={control}
        name="code"
        render={({ field, fieldState }) => (
          <TextField
            label="6-digit code"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="newPassword"
        render={({ field, fieldState }) => (
          <TextField
            label="New password"
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 10 characters."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button label="Update password" loading={mutation.isPending} onPress={submit} />
    </Screen>
  );
}

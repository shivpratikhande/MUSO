import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordSchema } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { AppText, Button, FormError, Screen, TextField } from '@/components/ui';
import { api, errorMessage } from '@/services/api';

export default function ForgotPasswordScreen() {
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const mutation = useMutation({
    mutationFn: api.auth.forgotPassword,
    onSuccess: (_d, vars) =>
      router.push({ pathname: '/reset-password', params: { email: vars.email } }),
  });
  const submit = () => void handleSubmit((v) => mutation.mutate(v))();

  return (
    <Screen keyboard edges={['top', 'bottom']} contentStyle={{ paddingTop: 72 }}>
      <AppText variant="display">Reset your password.</AppText>
      <AppText tone="muted">
        Enter your email. If there’s an account, we’ll send a 6-digit code.
      </AppText>
      <FormError message={mutation.isError ? errorMessage(mutation.error) : null} />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button label="Send code" loading={mutation.isPending} onPress={submit} />
    </Screen>
  );
}

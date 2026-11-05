import { zodResolver } from '@hookform/resolvers/zod';
import { VerifyEmailSchema } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { AppText, Button, FormError, Screen, TextField } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { api, errorMessage } from '@/services/api';

export default function VerifyEmailScreen() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(VerifyEmailSchema),
    defaultValues: { code: '' },
  });
  const verify = useMutation({
    mutationFn: (code: string) => api.auth.verifyEmail(code),
    onSuccess: (u) => {
      setUser(u);
      router.back();
    },
  });
  const resend = useMutation({ mutationFn: api.auth.resendVerification });
  const submit = () => void handleSubmit((v) => verify.mutate(v.code))();

  return (
    <Screen keyboard edges={['bottom']}>
      <AppText variant="display">Verify your email.</AppText>
      <AppText tone="muted">Enter the 6-digit code we sent to {user?.email}.</AppText>
      <FormError
        message={
          verify.isError
            ? errorMessage(verify.error)
            : resend.isError
              ? errorMessage(resend.error)
              : null
        }
      />
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
            autoFocus
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button label="Verify" loading={verify.isPending} onPress={submit} />
      <Button
        label={resend.isSuccess ? 'New code sent' : 'Send a new code'}
        variant="ghost"
        loading={resend.isPending}
        disabled={resend.isSuccess}
        onPress={() => resend.mutate()}
      />
    </Screen>
  );
}

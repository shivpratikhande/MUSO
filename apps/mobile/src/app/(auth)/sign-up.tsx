import { zodResolver } from '@hookform/resolvers/zod';
import { SignUpSchema, type SignUpInput } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { AppText, Button, FormError, Screen, TextField } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { api, errorMessage } from '@/services/api';

export default function SignUpScreen() {
  const setSession = useSession((s) => s.setSession);
  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });
  const mutation = useMutation({
    mutationFn: (input: SignUpInput) => api.auth.signUp(input),
    onSuccess: setSession,
  });

  const submit = () =>
    void handleSubmit((v) =>
      mutation.mutate({ ...v, displayName: v.displayName?.trim() ? v.displayName : undefined }),
    )();

  return (
    <Screen keyboard edges={['top', 'bottom']} contentStyle={{ paddingTop: 72 }}>
      <AppText variant="display">Join the crowd.</AppText>
      <AppText tone="muted">
        Create your account. You’ll choose whether you’re an artist, creator, fan or organizer next.
      </AppText>
      <FormError message={mutation.isError ? errorMessage(mutation.error) : null} />
      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label="Name (optional)"
            autoComplete="name"
            textContentType="name"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Password"
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 10 characters."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            returnKeyType="go"
            error={fieldState.error?.message}
          />
        )}
      />
      <Button
        label="Create account"
        loading={mutation.isPending || formState.isSubmitting}
        onPress={submit}
      />
      <Link href="/sign-in" replace asChild>
        <Button label="I already have an account" variant="ghost" />
      </Link>
    </Screen>
  );
}

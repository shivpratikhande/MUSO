import { zodResolver } from '@hookform/resolvers/zod';
import { SignInSchema, type SignInInput } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { AppText, Button, FormError, Screen, TextField } from '@/components/ui';
import { useSession } from '@/features/auth/session-store';
import { api, errorMessage } from '@/services/api';

export default function SignInScreen() {
  const setSession = useSession((s) => s.setSession);
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (input: SignInInput) => api.auth.signIn(input),
    onSuccess: setSession,
  });
  const submit = () => void handleSubmit((v) => mutation.mutate(v))();

  return (
    <Screen keyboard edges={['top', 'bottom']} contentStyle={{ paddingTop: 72 }}>
      <AppText variant="display">Welcome back.</AppText>
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
            autoComplete="current-password"
            textContentType="password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={submit}
            returnKeyType="go"
            error={fieldState.error?.message}
          />
        )}
      />
      <Button label="Sign in" loading={mutation.isPending} onPress={submit} />
      <Link href="/forgot-password" asChild>
        <Button label="Forgot password?" variant="ghost" />
      </Link>
    </Screen>
  );
}

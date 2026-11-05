import type { MyProfile } from '@muso/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { errorMessage } from '@/services/api';
import { useMe } from './use-me';

/** Wraps a profile form for editing after onboarding: load, render, go back on save. */
export function ProfileEditScreen({
  children,
}: {
  children: (args: { profile: MyProfile; submitLabel: string; onSaved: () => void }) => ReactNode;
}) {
  const me = useMe();
  return (
    <Screen keyboard edges={['bottom']}>
      {me.isPending ? (
        <LoadingState />
      ) : me.isError ? (
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
      ) : (
        children({ profile: me.data, submitLabel: 'Save', onSaved: () => router.back() })
      )}
    </Screen>
  );
}

import type { MyProfile } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText, ErrorState, FormError, LoadingState, Screen } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { nextStepRoute, stepProgress, type OnboardingStep } from './onboarding-steps';
import { useApplyProfile, useMe } from './use-me';

interface Props {
  step: OnboardingStep;
  eyebrow?: string;
  title: string;
  body?: string;
  children: (args: {
    profile: MyProfile;
    submitLabel: string;
    onSaved: (p: MyProfile) => void;
  }) => ReactNode;
}

/** Shared chrome + navigation for onboarding steps: progress, loading/error, next/finish. */
export function OnboardingStepScreen({ step, title, body, children }: Props) {
  const t = useTheme();
  const me = useMe();
  const apply = useApplyProfile();
  const finish = useMutation({
    mutationFn: () => api.me.completeOnboarding(),
    // Flipping `onboarded` makes the root layout swap to the main app.
    onSuccess: apply,
  });

  const onSaved = (p: MyProfile) => {
    const next = nextStepRoute(step, p.roles);
    if (next) router.push(next);
    else finish.mutate();
  };

  const roles = me.data?.roles ?? ['SUPPORTER'];
  const { index, total } = stepProgress(step, roles);
  const isLast = me.data ? nextStepRoute(step, me.data.roles) === null : false;

  return (
    <Screen
      keyboard
      edges={['top', 'bottom']}
      contentStyle={{ paddingTop: step === 'roles' ? undefined : 56 }}
    >
      <View
        style={{ flexDirection: 'row', gap: 4 }}
        accessibilityLabel={`Step ${index} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < index ? t.c.text : t.c.border,
            }}
          />
        ))}
      </View>
      <AppText variant="label" tone="muted">
        Step {index} of {total}
      </AppText>
      <AppText variant="display">{title}</AppText>
      {body ? <AppText tone="muted">{body}</AppText> : null}
      {me.isPending ? (
        <LoadingState />
      ) : me.isError ? (
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
      ) : (
        children({ profile: me.data, submitLabel: isLast ? 'Finish' : 'Continue', onSaved })
      )}
      <FormError message={finish.isError ? errorMessage(finish.error) : null} />
    </Screen>
  );
}

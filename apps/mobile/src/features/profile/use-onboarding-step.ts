import type { MyProfile } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/services/api';
import { nextStepRoute, stepProgress, type OnboardingStep } from './onboarding-steps';
import { useApplyProfile, useMe } from './use-me';

/** Loads the profile and moves to the next onboarding step (or finishes) after a save. */
export function useOnboardingStep(step: OnboardingStep) {
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

  return { me, finish, onSaved, index, total, isLast };
}

import type { MyProfile } from '@muso/shared';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText, ErrorState, FormError, LoadingState, Screen } from '@/components/ui';
import { errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import type { OnboardingStep } from './onboarding-steps';
import { useOnboardingStep } from './use-onboarding-step';

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
  const { me, finish, onSaved, index, total, isLast } = useOnboardingStep(step);

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

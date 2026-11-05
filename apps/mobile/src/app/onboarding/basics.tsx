import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { BasicsForm } from '@/features/profile/forms/BasicsForm';

export default function OnboardingBasics() {
  return (
    <OnboardingStepScreen
      step="basics"
      title="Your profile."
      body="How people will find and recognise you."
    >
      {(p) => <BasicsForm {...p} />}
    </OnboardingStepScreen>
  );
}

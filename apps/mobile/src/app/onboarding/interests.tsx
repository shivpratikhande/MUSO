import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { InterestsForm } from '@/features/profile/forms/InterestsForm';

export default function OnboardingInterests() {
  return (
    <OnboardingStepScreen
      step="interests"
      title="What do you love?"
      body="We’ll use this to fill your feed with the right moments."
    >
      {(p) => <InterestsForm {...p} />}
    </OnboardingStepScreen>
  );
}

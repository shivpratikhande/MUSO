import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { CreatorForm } from '@/features/profile/forms/CreatorForm';

export default function OnboardingCreator() {
  return (
    <OnboardingStepScreen
      step="creator"
      title="You, behind the lens."
      body="Tell us what you capture at shows."
    >
      {(p) => <CreatorForm {...p} />}
    </OnboardingStepScreen>
  );
}

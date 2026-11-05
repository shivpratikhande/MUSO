import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { RolesForm } from '@/features/profile/forms/RolesForm';

export default function OnboardingRoles() {
  return (
    <OnboardingStepScreen
      step="roles"
      title="How will you use MUSO?"
      body="This shapes your profile and tools."
    >
      {({ profile, onSaved }) => (
        <RolesForm initial={profile.roles} submitLabel="Continue" onSaved={onSaved} />
      )}
    </OnboardingStepScreen>
  );
}

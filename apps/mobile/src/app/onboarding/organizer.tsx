import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { OrganizerForm } from '@/features/profile/forms/OrganizerForm';

export default function OnboardingOrganizer() {
  return (
    <OnboardingStepScreen
      step="organizer"
      title="Who’s putting on the show?"
      body="Shown on your events. Contact details are only used for event questions."
    >
      {(p) => <OrganizerForm {...p} />}
    </OnboardingStepScreen>
  );
}

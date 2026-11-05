import { OnboardingStepScreen } from '@/features/profile/OnboardingStepScreen';
import { ArtistForm } from '@/features/profile/forms/ArtistForm';

export default function OnboardingArtist() {
  return (
    <OnboardingStepScreen
      step="artist"
      title="Your artist page."
      body="Fans and organizers will see this."
    >
      {(p) => <ArtistForm {...p} />}
    </OnboardingStepScreen>
  );
}

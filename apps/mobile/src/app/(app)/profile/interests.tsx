import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { InterestsForm } from '@/features/profile/forms/InterestsForm';

export default function EditInterests() {
  return <ProfileEditScreen>{(p) => <InterestsForm {...p} />}</ProfileEditScreen>;
}

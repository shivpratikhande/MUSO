import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { CreatorForm } from '@/features/profile/forms/CreatorForm';

export default function EditCreator() {
  return <ProfileEditScreen>{(p) => <CreatorForm {...p} />}</ProfileEditScreen>;
}

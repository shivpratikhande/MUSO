import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { BasicsForm } from '@/features/profile/forms/BasicsForm';

export default function EditProfile() {
  return <ProfileEditScreen>{(p) => <BasicsForm {...p} />}</ProfileEditScreen>;
}

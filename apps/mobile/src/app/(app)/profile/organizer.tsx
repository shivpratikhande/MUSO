import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { OrganizerForm } from '@/features/profile/forms/OrganizerForm';

export default function EditOrganizer() {
  return <ProfileEditScreen>{(p) => <OrganizerForm {...p} />}</ProfileEditScreen>;
}

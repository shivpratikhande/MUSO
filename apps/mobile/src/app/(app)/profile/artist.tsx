import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { ArtistForm } from '@/features/profile/forms/ArtistForm';

export default function EditArtist() {
  return <ProfileEditScreen>{(p) => <ArtistForm {...p} />}</ProfileEditScreen>;
}

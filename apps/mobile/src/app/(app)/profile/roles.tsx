import { router } from 'expo-router';
import { ProfileEditScreen } from '@/features/profile/ProfileEditScreen';
import { RolesForm } from '@/features/profile/forms/RolesForm';

/** After saving roles, jump straight to any role profile that still needs filling in. */
export default function EditRoles() {
  return (
    <ProfileEditScreen>
      {({ profile }) => (
        <RolesForm
          initial={profile.roles}
          submitLabel="Save"
          onSaved={(p) => {
            if (p.roles.includes('ARTIST') && !p.artistProfile)
              return router.replace('/profile/artist');
            if (p.roles.includes('CREATOR') && !p.creatorProfile)
              return router.replace('/profile/creator');
            if (p.roles.includes('ORGANIZER') && !p.organizerProfile)
              return router.replace('/profile/organizer');
            router.back();
          }}
        />
      )}
    </ProfileEditScreen>
  );
}

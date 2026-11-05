import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Pill, Screen } from '@/components/ui';
import { signOut } from '@/features/auth/session';
import { useSession } from '@/features/auth/session-store';
import { useTheme } from '@/theme';

const ROLE_LABEL = {
  ARTIST: 'Artist',
  CREATOR: 'Creator',
  SUPPORTER: 'Supporter',
  ORGANIZER: 'Organizer',
  ADMIN: 'Admin',
} as const;

export default function ProfileScreen() {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Profile
      </AppText>
      <AppText variant="display">{user.displayName ?? 'Your profile'}</AppText>
      <AppText tone="muted">{user.email}</AppText>

      <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' }}>
        {user.roles.map((r) => (
          <Pill key={r} label={ROLE_LABEL[r]} />
        ))}
      </View>

      {!user.emailVerified ? (
        <Card inverse>
          <AppText variant="heading" tone="inverse">
            Verify your email
          </AppText>
          <AppText variant="caption" tone="inverse">
            We sent a 6-digit code to {user.email}. Verifying is required before you can earn or
            buy.
          </AppText>
          <Button label="Enter code" onPress={() => router.push('/verify-email')} />
        </Card>
      ) : (
        <Pill label="Email verified" tone="accent" />
      )}

      <AppText variant="caption" tone="muted">
        Profile setup, role selection and creator tools arrive in Milestone 2.
      </AppText>

      <Button
        label="Sign out"
        variant="ghost"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </Screen>
  );
}

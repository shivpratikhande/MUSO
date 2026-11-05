import { useState } from 'react';
import { AppText, Button, Screen } from '@/components/ui';
import { restoreSession, signOut } from '@/features/auth/session';

/** Shown when a saved session exists but the server can't be reached at launch. */
export default function OfflineScreen() {
  const [retrying, setRetrying] = useState(false);
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <AppText variant="label" tone="muted">
        Offline
      </AppText>
      <AppText variant="display">We can’t reach MUSO right now.</AppText>
      <AppText tone="muted">Check your connection and try again. You’re still signed in.</AppText>
      <Button
        label="Try again"
        loading={retrying}
        onPress={async () => {
          setRetrying(true);
          await restoreSession();
          setRetrying(false);
        }}
      />
      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

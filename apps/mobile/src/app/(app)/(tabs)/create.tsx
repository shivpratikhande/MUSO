import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, FormError, Screen } from '@/components/ui';
import { pickCapture, type CaptureSource } from '@/features/posts/capture';
import { useDraft } from '@/features/posts/draft-store';
import { useSession } from '@/features/auth/session-store';
import { useTheme } from '@/theme';

export default function CreateScreen() {
  const t = useTheme();
  const setDraft = useDraft((s) => s.set);
  const verified = useSession((s) => s.user?.emailVerified ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CaptureSource | null>(null);

  const start = async (source: CaptureSource) => {
    setError(null);
    setBusy(source);
    try {
      const draft = await pickCapture(source);
      if (draft) {
        setDraft(draft);
        router.push('/compose');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t open that.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <AppText variant="label" tone="muted">
        Create
      </AppText>
      <AppText variant="display">Capture{'\n'}the moment.</AppText>
      <AppText tone="muted">
        Shoot it, tag the event and the artist, and share it with everyone who was there (and
        everyone who wasn’t).
      </AppText>
      {!verified ? (
        <Card inverse>
          <AppText variant="heading" tone="inverse">
            Verify your email to post
          </AppText>
          <Button label="Verify email" onPress={() => router.push('/verify-email')} />
        </Card>
      ) : (
        <View style={{ gap: t.space.md }}>
          <Button
            label="Take a photo"
            loading={busy === 'camera-photo'}
            onPress={() => void start('camera-photo')}
          />
          <Button
            label="Record a video"
            variant="secondary"
            loading={busy === 'camera-video'}
            onPress={() => void start('camera-video')}
          />
          <Button
            label="Choose from library"
            variant="ghost"
            loading={busy === 'library'}
            onPress={() => void start('library')}
          />
        </View>
      )}
      <FormError message={error} />
      <AppText variant="caption" tone="muted">
        Videos up to 3 minutes; you can trim before posting. Photos are stripped of location data
        automatically.
      </AppText>
    </Screen>
  );
}

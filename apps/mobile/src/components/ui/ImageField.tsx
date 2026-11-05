import type { UploadPurpose } from '@muso/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { pickImage, uploadImage } from '@/features/uploads/upload-image';
import { errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export interface ImageFieldProps {
  label: string;
  purpose: UploadPurpose;
  /** Current image to show (existing URL or freshly uploaded). */
  url: string | null;
  /** Called with the storage key once the upload succeeds. */
  onUploaded: (key: string, publicUrl: string) => void;
  aspect?: [number, number];
  round?: boolean;
}

/** Pick → upload → preview, with progress and error states. */
export function ImageField({
  label,
  purpose,
  url,
  onUploaded,
  aspect = [16, 9],
  round,
}: ImageFieldProps) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? url;
  const size = round ? 112 : undefined;

  const choose = async () => {
    setError(null);
    try {
      const picked = await pickImage(aspect);
      if (!picked) return;
      setPreview(picked.uri);
      setBusy(true);
      const { key, publicUrl } = await uploadImage(picked.uri, purpose);
      onUploaded(key, publicUrl);
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: t.space.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        accessibilityState={{ busy }}
        onPress={choose}
        disabled={busy}
        style={({ pressed }) => ({
          width: size ?? '100%',
          height: size,
          aspectRatio: round ? 1 : aspect[0] / aspect[1],
          borderRadius: round ? 999 : t.radius.lg,
          overflow: 'hidden',
          backgroundColor: t.c.surfaceMuted,
          borderWidth: shown ? 0 : 1.5,
          borderStyle: 'dashed',
          borderColor: t.c.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {shown ? (
          <Image
            source={{ uri: shown }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
          />
        ) : null}
        {busy ? (
          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.45)',
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color="#fff" />
          </View>
        ) : !shown ? (
          <AppText variant="caption" tone="muted">
            Tap to choose
          </AppText>
        ) : null}
      </Pressable>
      {shown && !busy ? (
        <AppText variant="caption" tone="muted">
          Tap to change
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

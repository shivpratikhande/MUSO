import { Image } from 'expo-image';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export function Avatar({
  url,
  name,
  size = 48,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const t = useTheme();
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name}’s photo` : 'Profile photo'}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: t.c.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <AppText variant="heading" tone="onAccent" style={{ fontSize: size * 0.36 }}>
          {initials || '?'}
        </AppText>
      )}
    </View>
  );
}

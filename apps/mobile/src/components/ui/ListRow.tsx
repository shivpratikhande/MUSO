import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

/** Tappable row with a title, optional subtitle and trailing chevron. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingVertical: t.space.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <AppText tone="muted">›</AppText> : null)}
    </Pressable>
  );
}

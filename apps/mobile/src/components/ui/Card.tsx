import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

export function Card({
  children,
  style,
  inverse,
}: {
  children: ReactNode;
  style?: ViewStyle;
  inverse?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: inverse ? t.c.inverseBackground : t.c.surface,
          borderRadius: t.radius.lg,
          padding: t.space.lg,
          gap: t.space.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

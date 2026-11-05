import { Text, type TextProps } from 'react-native';
import { useTheme, type TypeVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: 'default' | 'muted' | 'danger' | 'inverse' | 'onAccent';
  align?: 'left' | 'center' | 'right';
}

export function AppText({
  variant = 'body',
  tone = 'default',
  align,
  style,
  ...rest
}: AppTextProps) {
  const t = useTheme();
  const color = {
    default: t.c.text,
    muted: t.c.textMuted,
    danger: t.c.danger,
    inverse: t.c.inverseText,
    onAccent: t.c.onAccent,
  }[tone];
  return <Text {...rest} style={[t.type[variant], { color, textAlign: align }, style]} />;
}

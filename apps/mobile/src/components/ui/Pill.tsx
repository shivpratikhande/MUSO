import { View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'danger';
}) {
  const t = useTheme();
  const bg = { neutral: t.c.surfaceMuted, accent: t.c.accent, danger: t.c.danger }[tone];
  const fg = { neutral: t.c.text, accent: t.c.onAccent, danger: t.c.onDanger }[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <AppText variant="label" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

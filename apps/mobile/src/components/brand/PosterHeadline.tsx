import { Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

/**
 * Big slanted Anton headline, one line per entry. Each line gets its own Text with a full
 * line height (Anton's tall caps clip below ~1.3× on iOS) and is pulled up to stay tight.
 */
export function PosterHeadline({
  lines,
  size,
  style,
}: {
  lines: readonly string[];
  size: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={lines.join(' ')}
      style={[{ alignItems: 'flex-start' }, style]}
    >
      {lines.map((line, i) => (
        <Text
          key={line}
          style={{
            fontFamily: t.fonts.poster,
            fontSize: size,
            lineHeight: size * 1.32,
            marginTop: i === 0 ? 0 : -size * 0.3,
            color: t.palette.ink,
            letterSpacing: -0.5,
            includeFontPadding: false,
            transform: [{ skewX: '-8deg' }],
          }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

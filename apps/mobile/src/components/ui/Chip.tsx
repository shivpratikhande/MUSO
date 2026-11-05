import { Pressable } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

/** Selectable pill used for genres, roles and filters. */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: t.radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? t.c.text : t.c.border,
        backgroundColor: selected ? t.c.inverseBackground : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? t.c.inverseText : t.c.text, fontFamily: t.fonts.bodyMedium }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

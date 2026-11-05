import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.c.surfaceMuted,
        borderRadius: t.radius.pill,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: t.radius.pill,
              alignItems: 'center',
              backgroundColor: active ? t.c.inverseBackground : 'transparent',
            }}
          >
            <AppText
              variant="caption"
              style={{
                fontFamily: t.fonts.bodySemiBold,
                color: active ? t.c.inverseText : t.c.text,
              }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

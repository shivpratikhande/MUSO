import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

const fmt = (d: Date) =>
  d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Native date + time picker. Value is a Date; renders the platform-native control. */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  minimumDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  error?: string;
  minimumDate?: Date;
}) {
  const t = useTheme();

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onValueChange: (_e, date) => {
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onValueChange: (_e2, time) => onChange(time),
        });
      },
    });
  };

  return (
    <View style={{ gap: t.space.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="compact"
            minimumDate={minimumDate}
            minuteInterval={5}
            themeVariant={t.scheme}
            accentColor={t.c.text}
            onValueChange={(_e, d) => onChange(d)}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${fmt(value)}`}
          onPress={openAndroid}
          style={{
            borderWidth: 1.5,
            borderColor: t.c.border,
            borderRadius: t.radius.md,
            padding: 14,
            backgroundColor: t.c.surface,
          }}
        >
          <AppText>{fmt(value)}</AppText>
        </Pressable>
      )}
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

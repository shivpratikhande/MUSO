import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /** Shows a show/hide toggle for passwords. */
  secure?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  secure,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const borderColor = error ? t.c.danger : focused ? t.c.text : t.c.border;

  return (
    <View style={{ gap: t.space.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          { borderColor, borderRadius: t.radius.md, backgroundColor: t.c.surface },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={t.c.textMuted}
          selectionColor={t.c.text}
          secureTextEntry={secure ? hidden : false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, t.type.body, { color: t.c.text }, style]}
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            style={styles.toggle}
          >
            <AppText variant="caption" tone="muted">
              {hidden ? 'Show' : 'Hide'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, minHeight: 52 },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  toggle: { paddingHorizontal: 16, paddingVertical: 14 },
});

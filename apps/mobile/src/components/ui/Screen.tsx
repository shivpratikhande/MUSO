import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens usually omit 'bottom' (the tab bar handles it). */
  edges?: Edge[];
  contentStyle?: ViewStyle;
  keyboard?: boolean;
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  keyboard = false,
}: ScreenProps) {
  const t = useTheme();
  const padding = { paddingHorizontal: t.space.xl, paddingVertical: t.space.lg, gap: t.space.lg };

  const body = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[padding, styles.grow, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[padding, styles.fill, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: t.c.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.fill}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
});

import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

/** Standard loading / empty / error states. Every data screen uses these. */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ paddingVertical: t.space.xxl, alignItems: 'center', gap: t.space.md }}
    >
      <ActivityIndicator color={t.c.text} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: t.space.xxl, gap: t.space.sm }}>
      {eyebrow ? (
        <AppText variant="label" tone="muted">
          {eyebrow}
        </AppText>
      ) : null}
      <AppText variant="title">{title}</AppText>
      {body ? <AppText tone="muted">{body}</AppText> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={{ paddingVertical: t.space.xl, gap: t.space.md }}>
      <AppText variant="heading">Something went wrong</AppText>
      <AppText tone="muted">{message}</AppText>
      {onRetry ? (
        <Button label="Try again" variant="ghost" fullWidth={false} onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function FormError({ message }: { message?: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: t.c.surfaceMuted,
        borderLeftWidth: 3,
        borderLeftColor: t.c.danger,
        borderRadius: t.radius.sm,
        padding: t.space.md,
      }}
    >
      <AppText variant="caption">{message}</AppText>
    </View>
  );
}

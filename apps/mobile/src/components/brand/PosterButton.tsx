import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme';

/** Offset of the hard "neobrutalist" shadow, shared by every poster surface. */
export const POSTER_SHADOW = 5;

export interface PosterButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'lime' | 'white';
  arrow?: boolean;
  loading?: boolean;
}

/** Chunky outlined button with a hard offset shadow; presses "into" the shadow. */
export function PosterButton({
  label,
  variant = 'lime',
  arrow = false,
  loading = false,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PosterButtonProps) {
  const t = useTheme();
  const isDisabled = !!disabled || loading;
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: press.value * POSTER_SHADOW },
      { translateY: press.value * POSTER_SHADOW },
    ],
  }));

  return (
    <Pressable
      // Spread first so <Link asChild> can't override our styling.
      {...rest}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPressIn={(e) => {
        press.value = withSpring(1, { damping: 15, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.value = withSpring(0, { damping: 12, stiffness: 300 });
        onPressOut?.(e);
      }}
      style={[styles.wrap, isDisabled && !loading && styles.disabled]}
    >
      <View style={[styles.shadow, { backgroundColor: t.palette.ink }]} />
      <Animated.View
        style={[
          styles.face,
          {
            backgroundColor: variant === 'lime' ? t.palette.lime : t.palette.white,
            borderColor: t.palette.ink,
          },
          faceStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={t.palette.ink} />
        ) : (
          <Text style={[styles.label, { fontFamily: t.fonts.bodySemiBold, color: t.palette.ink }]}>
            {label}
          </Text>
        )}
        {arrow && !loading ? (
          <Text style={[styles.arrow, { color: t.palette.ink }]} importantForAccessibility="no">
            →
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginRight: POSTER_SHADOW, marginBottom: POSTER_SHADOW },
  disabled: { opacity: 0.45 },
  shadow: {
    position: 'absolute',
    top: POSTER_SHADOW,
    left: POSTER_SHADOW,
    right: -POSTER_SHADOW,
    bottom: -POSTER_SHADOW,
    borderRadius: 14,
  },
  face: {
    height: 58,
    borderRadius: 14,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 19 },
  arrow: { position: 'absolute', right: 20, fontSize: 26, lineHeight: 30 },
});

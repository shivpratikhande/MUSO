import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme';

const SHADOW = 5;

export interface PosterButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'lime' | 'white';
  arrow?: boolean;
}

/** Chunky outlined button with a hard offset shadow; presses "into" the shadow. */
export function PosterButton({
  label,
  variant = 'lime',
  arrow = false,
  onPressIn,
  onPressOut,
  ...rest
}: PosterButtonProps) {
  const t = useTheme();
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: press.value * SHADOW }, { translateY: press.value * SHADOW }],
  }));

  return (
    <Pressable
      // Spread first so <Link asChild> can't override our styling.
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={(e) => {
        press.value = withSpring(1, { damping: 15, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.value = withSpring(0, { damping: 12, stiffness: 300 });
        onPressOut?.(e);
      }}
      style={styles.wrap}
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
        <Text style={[styles.label, { fontFamily: t.fonts.bodySemiBold, color: t.palette.ink }]}>
          {label}
        </Text>
        {arrow ? (
          <Text style={[styles.arrow, { color: t.palette.ink }]} importantForAccessibility="no">
            →
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginRight: SHADOW, marginBottom: SHADOW },
  shadow: {
    position: 'absolute',
    top: SHADOW,
    left: SHADOW,
    right: -SHADOW,
    bottom: -SHADOW,
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

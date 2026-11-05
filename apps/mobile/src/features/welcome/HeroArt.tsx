import { Image, type ImageSource } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Hero artwork. To use an artist photo, drop a transparent cut-out PNG (≈1000×1200,
 * subject facing left) at assets/images/welcome-hero.png and set:
 *   const HERO_SOURCE = require('../../../assets/images/welcome-hero.png');
 * Only use imagery you have the rights to (an artist's likeness needs their permission).
 */
const HERO_SOURCE: ImageSource | number | null = null;

export function HeroArt({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) enter.value = withDelay(350, withSpring(1, { damping: 13, stiffness: 120 }));
  }, [reduceMotion, enter]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * width * 0.5 }, { scale: 0.85 + enter.value * 0.15 }],
  }));

  return (
    <Animated.View style={style}>
      {HERO_SOURCE ? (
        <Image
          source={HERO_SOURCE}
          style={{ width, height: width * 1.2 }}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Vinyl size={width} />
      )}
    </Animated.View>
  );
}

/** Placeholder art: a spinning record with a white sticker outline. */
function Vinyl({ size }: { size: number }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    spin.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1);
  }, [reduceMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const r = size / 2;

  return (
    <View style={[styles.sticker, { width: size + 12, height: size + 12, borderRadius: r + 6 }]}>
      <Animated.View style={spinStyle}>
        <Svg width={size} height={size}>
          <Circle cx={r} cy={r} r={r} fill={t.palette.ink} />
          {[0.92, 0.82, 0.72, 0.62, 0.52].map((k) => (
            <Circle key={k} cx={r} cy={r} r={r * k} stroke="#34342F" strokeWidth={1.5} fill="none" />
          ))}
          {/* Light glint so the spin reads */}
          <Circle
            cx={r}
            cy={r}
            r={r * 0.77}
            stroke="#5E5B54"
            strokeWidth={r * 0.18}
            strokeDasharray={`${r * 0.6} ${r * 4.2}`}
            fill="none"
          />
          <Circle cx={r} cy={r} r={r * 0.34} fill={t.palette.lime} />
          <Circle cx={r} cy={r} r={r * 0.04} fill={t.palette.ink} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text
            style={{
              fontFamily: t.fonts.poster,
              fontSize: r * 0.2,
              color: t.palette.ink,
              marginTop: -r * 0.2,
            }}
          >
            MUSO
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

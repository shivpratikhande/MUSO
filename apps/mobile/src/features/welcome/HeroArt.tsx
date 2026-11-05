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

/** Transparent cut-out (1199×1312). Swap the file to change the hero. */
const HERO_SOURCE: ImageSource | number | null = require('../../../assets/images/welcome-hero.png');
export const HERO_ASPECT = 1312 / 1199;
/** Thickness of the white "sticker" outline around the cut-out. */
const OUTLINE = 5;
const OUTLINE_OFFSETS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return { x: Math.cos(a) * OUTLINE, y: Math.sin(a) * OUTLINE };
});

export function HeroArt({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) enter.value = withDelay(350, withSpring(1, { damping: 13, stiffness: 120 }));
  }, [reduceMotion, enter]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateX: (1 - enter.value) * width * 0.5 },
      { scale: 0.85 + enter.value * 0.15 },
    ],
  }));

  return (
    <Animated.View style={style}>
      {HERO_SOURCE ? (
        <View style={{ width, height: width * HERO_ASPECT }}>
          {/* White silhouette copies offset in a ring = sticker outline */}
          {OUTLINE_OFFSETS.map(({ x, y }, i) => (
            <Image
              key={i}
              source={HERO_SOURCE}
              tintColor="#FFFFFF"
              contentFit="contain"
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ translateX: x }, { translateY: y }] },
              ]}
            />
          ))}
          <Image
            source={HERO_SOURCE}
            contentFit="contain"
            style={StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        </View>
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
            <Circle
              key={k}
              cx={r}
              cy={r}
              r={r * k}
              stroke="#34342F"
              strokeWidth={1.5}
              fill="none"
            />
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

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme';

/** Shapes are drawn on a 390×844 canvas and stretched to the device. */
const VB = '0 0 390 844';

/** Lime poster block + violet burst + white lower panel. */
export function Backdrop() {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const burst = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) burst.value = withDelay(150, withSpring(1, { damping: 14 }));
  }, [reduceMotion, burst]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value,
    transform: [{ translateX: (1 - burst.value) * 160 }, { rotate: `${(1 - burst.value) * 8}deg` }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.palette.white }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox={VB} preserveAspectRatio="none">
        <Path d="M0 0 H390 V600 L250 610 L170 560 L0 590 Z" fill={t.palette.lime} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, burstStyle]}>
        <Svg style={StyleSheet.absoluteFill} viewBox={VB} preserveAspectRatio="none">
          <Path
            d="M200 165 L300 140 L390 120 V770 L330 730 L345 800 L260 745 L205 790 L215 700 L120 690 L180 625
               L60 590 L150 540 L95 470 L170 430 L120 330 L195 300 Z"
            fill={t.palette.violet}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Drawn above the hero: the white panel the tagline + buttons sit on. It also hides the
 * hard crop at the bottom of the cut-out photo.
 */
export function Foreground({
  width: w,
  height: h,
  edgeY: y,
}: {
  width: number;
  height: number;
  /** Where the photo's hard bottom crop is (px); the jagged edge always sits above it. */
  edgeY: number;
}) {
  const t = useTheme();
  const white = `M0 ${y - 44} L${w * 0.32} ${y - 22} L${w * 0.55} ${y - 34} L${w * 0.7} ${y - 4}
    L${w} ${y - 18} V${h} H0 Z`;
  const wedge = `M${w * 0.7} ${y - 4} L${w} ${y - 18} V${y + 120}
    C${w * 0.88} ${y + 96} ${w * 0.8} ${y + 52} ${w * 0.66} ${y + 34} Z`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={white} fill={t.palette.white} />
      <Path d={wedge} fill={t.palette.violet} />
      <Path
        d={`M0 ${h * 0.94} C${w * 0.2} ${h * 0.92} ${w * 0.46} ${h * 0.955} ${w * 0.62} ${h} H0 Z`}
        fill={t.palette.violet}
      />
    </Svg>
  );
}

/** Hand-drawn crown that wobbles. */
export function Crown({ size = 110 }: { size?: number }) {
  const t = useTheme();
  const wobble = useLoop(1800, 300);
  const style = useAnimatedStyle(() => ({
    opacity: wobble.intro.value,
    transform: [
      { scale: wobble.intro.value },
      { rotate: `${-8 + wobble.loop.value * 12}deg` },
      { translateY: -wobble.loop.value * 4 },
    ],
  }));
  return (
    <Animated.View style={style}>
      <Svg width={size} height={size * 0.62} viewBox="0 0 110 68">
        <Path
          d="M8 58 L4 14 L30 38 L50 6 L68 36 L96 10 L100 58 Z M10 64 L102 62"
          stroke={t.palette.ink}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** Three "action lines" that flicker like a comic-book shout. */
export function Sparks({
  size = 56,
  rotate = 0,
  delay = 0,
}: {
  size?: number;
  rotate?: number;
  delay?: number;
}) {
  const t = useTheme();
  const { intro, loop } = useLoop(900, delay);
  const style = useAnimatedStyle(() => ({
    opacity: intro.value * (0.55 + loop.value * 0.45),
    transform: [{ rotate: `${rotate}deg` }, { scale: intro.value * (0.92 + loop.value * 0.12) }],
  }));
  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 56 56">
        <Path
          d="M6 40 L22 30 M14 14 L28 26 M34 4 L36 22"
          stroke={t.palette.ink}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** Shared intro (0→1 spring) + endless ping-pong loop (0↔1). */
function useLoop(period: number, delay: number) {
  const reduceMotion = useReducedMotion();
  const intro = useSharedValue(reduceMotion ? 1 : 0);
  const loop = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    intro.value = withDelay(700 + delay, withSpring(1, { damping: 8 }));
    loop.value = withDelay(
      1200 + delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, intro, loop, period, delay]);
  return { intro, loop };
}

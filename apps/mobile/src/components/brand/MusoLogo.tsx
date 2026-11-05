import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { useTheme } from '@/theme';

const LETTERS = ['M', 'u', 's', 'o'] as const;
const STAGGER = 90;
/** Time between "beat" bounces once the intro has settled. */
const BEAT_EVERY = 2600;

/**
 * Animated wordmark: letters drop in one by one, the ™ pops, then the word
 * bounces like an equalizer on a loop.
 */
export function MusoLogo({ size = 40 }: { size?: number }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const tm = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    tm.value = withDelay(LETTERS.length * STAGGER + 250, withSpring(1, { damping: 7 }));
  }, [reduceMotion, tm]);

  const tmStyle = useAnimatedStyle(() => ({
    opacity: tm.value,
    transform: [{ scale: tm.value }, { rotate: `${(1 - tm.value) * -90}deg` }],
  }));

  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Muso" style={styles.row}>
      {LETTERS.map((letter, i) => (
        <Letter key={letter} letter={letter} index={i} size={size} reduceMotion={reduceMotion} />
      ))}
      <Animated.View style={[styles.tm, tmStyle]}>
        <Text
          style={{ fontFamily: t.fonts.bodySemiBold, fontSize: size * 0.22, color: t.palette.ink }}
        >
          TM
        </Text>
      </Animated.View>
    </View>
  );
}

function Letter({
  letter,
  index,
  size,
  reduceMotion,
}: {
  letter: string;
  index: number;
  size: number;
  reduceMotion: boolean;
}) {
  const t = useTheme();
  const drop = useSharedValue(reduceMotion ? 0 : -size * 1.4);
  const fade = useSharedValue(reduceMotion ? 1 : 0);
  const beat = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    const start = index * STAGGER;
    drop.value = withDelay(start, withSpring(0, { damping: 9, stiffness: 180 }));
    fade.value = withDelay(start, withTiming(1, { duration: 180 }));
    // Equalizer bounce: each letter hops slightly after the previous one.
    beat.value = withDelay(
      1400 + start,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.bounce }),
          withTiming(0, { duration: BEAT_EVERY - 420 }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, index, drop, fade, beat]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateY: drop.value - beat.value * size * 0.22 },
      { scaleY: 1 + beat.value * 0.12 },
      { rotate: `${beat.value * (index % 2 === 0 ? -6 : 6)}deg` },
    ],
  }));

  return (
    <Animated.View style={style}>
      <Text
        style={{
          fontFamily: t.fonts.poster,
          fontSize: size,
          lineHeight: size * 1.35,
          color: t.palette.ink,
          letterSpacing: -0.5,
        }}
      >
        {letter}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', transform: [{ skewX: '-10deg' }] },
  tm: { marginTop: 6, marginLeft: 1 },
});

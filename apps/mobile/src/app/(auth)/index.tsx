import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MusoLogo, PosterButton } from '@/components/brand';
import { Backdrop, Crown, Foreground, Sparks } from '@/features/welcome/Backdrop';
import { HERO_ASPECT, HeroArt } from '@/features/welcome/HeroArt';
import { useTheme } from '@/theme';

const HEADLINE = [
  { text: "I'M AN", bg: 'white', delay: 500 },
  { text: 'ARTIST', bg: 'white', delay: 650 },
  { text: 'BROO', bg: 'lime', delay: 820 },
] as const;

export default function WelcomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const headlineSize = Math.min(width * 0.19, 88);
  // Hero, per the mockup: sized by WIDTH (~95%), left edge at ~15% so it stays in the right
  // half beside the headline, right shoulder runs off-screen. Its bottom must stay above the
  // tagline (≈ buttons 136 + copy 72 + gaps 38 above the bottom inset) so text never sits on it.
  const heroTop = height * 0.16;
  const copyTop = height - insets.bottom - 256;
  const heroHeight = Math.min(width * 0.95 * HERO_ASPECT, copyTop - heroTop);
  const heroWidth = heroHeight / HERO_ASPECT;
  const heroLeft = width - heroWidth * 0.86;
  // Crown sits just above the right side of the turban; it tracks the photo, not the screen.
  const crownSize = width * 0.21;
  const crownLeft = Math.min(heroLeft + heroWidth * 0.58, width - crownSize - 12);
  const crownTop = heroTop + heroHeight * 0.03 - crownSize * 0.62;

  return (
    <View style={styles.fill}>
      <StatusBar style="dark" />
      <Backdrop />

      {/* Hero + doodles, positioned against the backdrop */}
      <View style={[styles.hero, { top: heroTop, left: heroLeft }]} pointerEvents="none">
        <HeroArt width={heroWidth} />
      </View>
      <Foreground width={width} height={height} edgeY={heroTop + heroHeight} />
      <View style={{ position: 'absolute', top: crownTop, left: crownLeft }} pointerEvents="none">
        <Crown size={crownSize} />
      </View>
      <View
        style={{ position: 'absolute', top: heroTop + heroHeight * 0.74, left: 18 }}
        pointerEvents="none"
      >
        <Sparks size={48} rotate={-150} delay={150} />
      </View>
      <View
        style={{ position: 'absolute', top: heroTop + heroHeight * 0.66, right: 12 }}
        pointerEvents="none"
      >
        <Sparks size={40} rotate={20} delay={400} />
      </View>

      <View
        style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.topBar}>
          <MusoLogo size={42} />
          <PageDots />
        </View>

        <View
          style={styles.headline}
          accessible
          accessibilityRole="header"
          accessibilityLabel="I'm an artist, broo"
        >
          {HEADLINE.map((line, i) => (
            <HeadlineSticker key={line.text} {...line} index={i} size={headlineSize} />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <Animated.View
          entering={FadeInDown.delay(1000).springify().damping(16)}
          style={styles.copy}
        >
          <Text style={{ fontFamily: t.fonts.bodySemiBold, fontSize: 20, color: t.palette.ink }}>
            Music. Artists. Live.
          </Text>
          <Text
            style={{
              fontFamily: t.fonts.body,
              fontSize: 16,
              lineHeight: 21,
              color: t.palette.stoneDark,
              marginTop: 4,
              maxWidth: width * 0.62,
            }}
          >
            Discover concerts, festivals and your favorite artists on Muso.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(1150).springify().damping(15)}
          style={styles.actions}
        >
          <Link href="/sign-up" asChild>
            <PosterButton label="Get Started" arrow />
          </Link>
          <Link href="/sign-in" asChild>
            <PosterButton label="Log In" variant="white" />
          </Link>
        </Animated.View>
      </View>
    </View>
  );
}

function HeadlineSticker({
  text,
  bg,
  delay,
  index,
  size,
}: {
  text: string;
  bg: 'white' | 'lime';
  delay: number;
  index: number;
  size: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const slam = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion)
      slam.value = withDelay(delay, withSpring(1, { damping: 10, stiffness: 160 }));
  }, [reduceMotion, slam, delay]);

  const tilt = [-6, -5, -7][index];
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, slam.value * 2),
    transform: [
      { scale: 1.8 - slam.value * 0.8 },
      { rotate: `${tilt - (1 - slam.value) * 10}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: bg === 'lime' ? t.palette.lime : t.palette.white,
          marginLeft: index === 2 ? size * 0.08 : 0,
          // Overlap the stickers slightly so the stack stays tight like a poster.
          marginTop: index === 0 ? 0 : -size * 0.1,
          zIndex: HEADLINE.length - index,
          paddingHorizontal: size * 0.12,
          paddingTop: size * 0.06,
          paddingBottom: size * 0.02,
          borderWidth: bg === 'lime' ? 3 : 0,
          borderColor: t.palette.ink,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: t.fonts.poster,
          fontSize: size,
          // Anton has tall ascenders: anything under ~1.3× clips the tops on iOS.
          lineHeight: size * 1.32,
          includeFontPadding: false,
          color: t.palette.ink,
          letterSpacing: -1,
          transform: [{ skewX: '-8deg' }],
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

/** Onboarding progress indicator — first page active. */
function PageDots() {
  const t = useTheme();
  return (
    <View style={styles.dots} accessibilityLabel="Page 1 of 3">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(300 + i * 80)}
          style={{
            width: 28,
            height: 5,
            borderRadius: 3,
            backgroundColor: i === 0 ? t.palette.ink : 'rgba(23,23,21,0.25)',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { position: 'absolute' },
  content: { flex: 1, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 },
  headline: { marginTop: 18, alignItems: 'flex-start' },
  copy: { marginBottom: 22 },
  actions: { gap: 10, paddingHorizontal: 18 },
});

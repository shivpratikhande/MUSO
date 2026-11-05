import { Link } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const t = useTheme();
  return (
    <Screen
      scroll={false}
      edges={['top', 'bottom']}
      contentStyle={{ justifyContent: 'space-between' }}
    >
      <View style={{ gap: t.space.md, marginTop: t.space.xxxl }}>
        <AppText variant="label" tone="muted">
          MUSO
        </AppText>
        <AppText variant="hero">
          Capture the moment.{'\n'}
          <AppText variant="hero" style={{ fontFamily: t.fonts.displayItalic }}>
            Share
          </AppText>{' '}
          the experience.{'\n'}
          Earn from it.
        </AppText>
        <View
          style={{
            height: 6,
            width: 72,
            backgroundColor: t.c.accent,
            borderRadius: 3,
            marginTop: t.space.sm,
          }}
        />
        <AppText tone="muted" style={{ maxWidth: 320 }}>
          The live-music network where the people in the crowd become creators — and every great
          moment can reward the person who captured it.
        </AppText>
      </View>
      <View style={{ gap: t.space.md }}>
        <Link href="/sign-up" asChild>
          <Button label="Create account" />
        </Link>
        <Link href="/sign-in" asChild>
          <Button label="I already have an account" variant="ghost" />
        </Link>
      </View>
    </Screen>
  );
}

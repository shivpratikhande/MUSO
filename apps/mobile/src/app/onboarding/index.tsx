import type { MyProfile } from '@muso/shared';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { MusoLogo, PosterButton, PosterHeadline } from '@/components/brand';
import { ErrorState, FormError, LoadingState } from '@/components/ui';
import { RoleCards, useRolesForm } from '@/features/profile/forms/RolesForm';
import { useOnboardingStep } from '@/features/profile/use-onboarding-step';
import { errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

/** Onboarding step 1 — "Who are you on Muso?" (neobrutalist poster style). */
export default function OnboardingRoles() {
  const t = useTheme();
  const { me, finish, onSaved } = useOnboardingStep('roles');

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.fill, { backgroundColor: t.palette.ivory }]}
    >
      <StatusBar style="dark" />
      <View style={styles.header}>
        {router.canGoBack() ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            style={styles.back}
          >
            <Svg width={26} height={26} viewBox="0 0 26 26">
              <Path
                d="M22 13 H5 M12 5 L4 13 L12 21"
                stroke={t.palette.ink}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Pressable>
        ) : null}
        <MusoLogo size={36} />
      </View>

      {me.isPending ? (
        <LoadingState />
      ) : me.isError ? (
        <View style={styles.pad}>
          <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
        </View>
      ) : (
        <RolesStep
          profile={me.data}
          onSaved={onSaved}
          finishError={finish.isError ? errorMessage(finish.error) : null}
          finishing={finish.isPending}
        />
      )}
    </SafeAreaView>
  );
}

function RolesStep({
  profile,
  onSaved,
  finishError,
  finishing,
}: {
  profile: MyProfile;
  onSaved: (p: MyProfile) => void;
  finishError: string | null;
  finishing: boolean;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { roles, toggle, save } = useRolesForm(profile.roles, onSaved);

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(150).springify().damping(15)}>
          <PosterHeadline lines={['WHO ARE YOU', 'ON MUSO?']} size={Math.min(width * 0.15, 64)} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(300).springify().damping(15)}>
          <RoleCards roles={roles} onToggle={toggle} />
        </Animated.View>
        <Text style={[styles.hint, { fontFamily: t.fonts.body, color: t.palette.stoneDark }]}>
          Pick all that fit. You can change this later.
        </Text>
      </ScrollView>
      <Animated.View entering={FadeInDown.delay(450).springify().damping(15)} style={styles.footer}>
        <FormError message={save.isError ? errorMessage(save.error) : finishError} />
        <PosterButton
          label="Continue"
          arrow
          disabled={roles.length === 0}
          loading={save.isPending || finishing}
          onPress={() => save.mutate()}
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 20 },
  header: { height: 56, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 20, top: 15 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 22 },
  hint: { fontSize: 13, marginTop: -6 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 8 },
});

import { SELF_ASSIGNABLE_ROLES, type MyProfile, type UserRole } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { POSTER_SHADOW, PosterButton } from '@/components/brand';
import { FormError } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { RoleIcon } from '../RoleIcon';
import { useApplyProfile } from '../use-me';

type SelfRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export const ROLE_COPY: Record<SelfRole, { title: string; body: string }> = {
  ARTIST: { title: 'Artist', body: 'Create, share and grow your music & work' },
  SUPPORTER: { title: 'Fan', body: 'Follow, support and discover artists' },
  CREATOR: { title: 'Creator', body: 'Shoot the show, post the moment, earn from it' },
  ORGANIZER: { title: 'Industry', body: 'Promoter, venue or label — publish events & lineups' },
};

const ORDER: SelfRole[] = ['ARTIST', 'SUPPORTER', 'CREATOR', 'ORGANIZER'];

/** Selection + save state for the roles step; shared by onboarding and profile editing. */
export function useRolesForm(initial: readonly UserRole[], onSaved: (p: MyProfile) => void) {
  const apply = useApplyProfile();
  const [roles, setRoles] = useState<SelfRole[]>(
    initial.filter((r): r is SelfRole => r !== 'ADMIN'),
  );
  const save = useMutation({
    mutationFn: () => api.me.setRoles({ roles }),
    onSuccess: (p) => {
      apply(p);
      onSaved(p);
    },
  });
  const toggle = (r: SelfRole) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  return { roles, toggle, save };
}

export function RoleCards({
  roles,
  onToggle,
}: {
  roles: readonly SelfRole[];
  onToggle: (r: SelfRole) => void;
}) {
  return (
    <View style={styles.cards}>
      {ORDER.map((r) => (
        <RoleCard key={r} role={r} selected={roles.includes(r)} onPress={() => onToggle(r)} />
      ))}
    </View>
  );
}

function RoleCard({
  role,
  selected,
  onPress,
}: {
  role: SelfRole;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const press = useSharedValue(0);
  const check = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    check.value = withSpring(selected ? 1 : 0, { damping: 9, stiffness: 260 });
  }, [selected, check]);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: press.value * POSTER_SHADOW },
      { translateY: press.value * POSTER_SHADOW },
    ],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: check.value }, { rotate: `${(1 - check.value) * -45}deg` }],
  }));

  const { title, body } = ROLE_COPY[role];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 15, stiffness: 400 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 12, stiffness: 300 });
      }}
      style={styles.cardWrap}
    >
      <View style={[styles.shadow, { backgroundColor: t.palette.ink }]} />
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: selected ? t.palette.lime : t.palette.white,
            borderColor: t.palette.ink,
          },
          faceStyle,
        ]}
      >
        <RoleIcon role={role} size={42} />
        <View style={styles.cardText}>
          <Text style={[styles.title, { fontFamily: t.fonts.bodySemiBold, color: t.palette.ink }]}>
            {title}
          </Text>
          <Text style={[styles.body, { fontFamily: t.fonts.body, color: t.palette.ink }]}>
            {body}
          </Text>
        </View>
        <Animated.View style={[styles.check, { backgroundColor: t.palette.ink }, checkStyle]}>
          <Svg width={16} height={16} viewBox="0 0 16 16">
            <Path
              d="M3 8.5 L6.5 12 L13 4.5"
              stroke={t.palette.white}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** Cards + inline save button (profile → edit roles). */
export function RolesForm({
  initial,
  submitLabel,
  onSaved,
}: {
  initial: readonly UserRole[];
  submitLabel: string;
  onSaved: (p: MyProfile) => void;
}) {
  const t = useTheme();
  const { roles, toggle, save } = useRolesForm(initial, onSaved);
  return (
    <View style={{ gap: t.space.lg }}>
      <RoleCards roles={roles} onToggle={toggle} />
      <Text style={{ fontFamily: t.fonts.body, fontSize: 13, color: t.c.textMuted }}>
        Pick all that fit. You can change this later.
      </Text>
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <PosterButton
        label={submitLabel}
        arrow
        disabled={roles.length === 0}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: 14 },
  cardWrap: { marginRight: POSTER_SHADOW, marginBottom: POSTER_SHADOW },
  shadow: {
    position: 'absolute',
    top: POSTER_SHADOW,
    left: POSTER_SHADOW,
    right: -POSTER_SHADOW,
    bottom: -POSTER_SHADOW,
    borderRadius: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 92,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 46,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  cardText: { flex: 1, gap: 2 },
  title: { fontSize: 22, lineHeight: 28 },
  body: { fontSize: 15, lineHeight: 20 },
  check: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

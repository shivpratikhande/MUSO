import { SELF_ASSIGNABLE_ROLES, type MyProfile, type UserRole } from '@muso/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Button, FormError } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import { useTheme } from '@/theme';
import { useApplyProfile } from '../use-me';

type SelfRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export const ROLE_COPY: Record<SelfRole, { title: string; body: string }> = {
  SUPPORTER: { title: 'Fan', body: 'Discover events, watch and back the people who capture them.' },
  CREATOR: { title: 'Creator', body: 'Shoot photos and video at shows and earn from them.' },
  ARTIST: {
    title: 'Artist',
    body: 'Build your page, find fan footage of your sets, reward creators.',
  },
  ORGANIZER: {
    title: 'Organizer',
    body: 'Publish events, line up artists and fund creator rewards.',
  },
};

const ORDER: SelfRole[] = ['SUPPORTER', 'CREATOR', 'ARTIST', 'ORGANIZER'];

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

  return (
    <View style={{ gap: t.space.md }}>
      {ORDER.map((r) => {
        const on = roles.includes(r);
        return (
          <Pressable
            key={r}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${ROLE_COPY[r].title}. ${ROLE_COPY[r].body}`}
            onPress={() => toggle(r)}
            style={({ pressed }) => ({
              borderRadius: t.radius.lg,
              padding: t.space.lg,
              gap: t.space.xs,
              borderWidth: 1.5,
              borderColor: on ? t.c.text : t.c.border,
              backgroundColor: on ? t.c.inverseBackground : t.c.surface,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <AppText variant="title" style={{ color: on ? t.c.inverseText : t.c.text }}>
                {ROLE_COPY[r].title}
              </AppText>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: on ? t.c.accent : t.c.border,
                  backgroundColor: on ? t.c.accent : 'transparent',
                }}
              />
            </View>
            <AppText variant="caption" style={{ color: on ? t.c.inverseText : t.c.textMuted }}>
              {ROLE_COPY[r].body}
            </AppText>
          </Pressable>
        );
      })}
      <AppText variant="caption" tone="muted">
        Pick as many as fit. You can change this later.
      </AppText>
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <Button
        label={submitLabel}
        disabled={roles.length === 0}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

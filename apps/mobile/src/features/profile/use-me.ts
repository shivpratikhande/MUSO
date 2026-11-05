import type { MyProfile } from '@muso/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session-store';
import { api } from '@/services/api';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => api.me.get() });
}

/** Stores a fresh profile in the cache and mirrors the basics into the session user. */
export function useApplyProfile() {
  const qc = useQueryClient();
  return (p: MyProfile) => {
    qc.setQueryData(meKey, p);
    const { user, setUser } = useSession.getState();
    if (user) {
      setUser({
        ...user,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        roles: p.roles,
        onboarded: p.onboarded,
      });
    }
  };
}

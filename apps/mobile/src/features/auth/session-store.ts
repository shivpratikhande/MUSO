import type { AuthSession, AuthUser } from '@muso/shared';
import { create } from 'zustand';
import { tokenStorage } from './token-storage';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn' | 'offline';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  /** Stores a fresh session (sign-in, sign-up, refresh). */
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: AuthUser) => void;
  setStatus: (status: SessionStatus) => void;
  /** Clears all local auth state. */
  clear: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  user: null,
  accessToken: null,
  accessTokenExpiresAt: null,

  setSession: async ({ user, tokens }) => {
    await tokenStorage.set(tokens.refreshToken);
    set({
      status: 'signedIn',
      user,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: Date.parse(tokens.accessTokenExpiresAt),
    });
  },
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: async () => {
    await tokenStorage.clear();
    set({ status: 'signedOut', user: null, accessToken: null, accessTokenExpiresAt: null });
  },
}));

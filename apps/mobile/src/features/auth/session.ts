import { ApiError } from '@muso/api-client';
import { api, refreshSession } from '@/services/api';
import { useSession } from './session-store';
import { tokenStorage } from './token-storage';

/**
 * Called once at launch. Restores the session from the stored refresh token.
 * - no token            → signedOut
 * - server rejects (401) → signedOut (token cleared)
 * - network failure     → offline (token kept; user can retry)
 */
export async function restoreSession(): Promise<void> {
  const { setStatus, clear } = useSession.getState();
  setStatus('restoring');
  const stored = await tokenStorage.get();
  if (!stored) {
    setStatus('signedOut');
    return;
  }
  try {
    await refreshSession();
  } catch (err) {
    if (err instanceof ApiError && err.isNetworkError) setStatus('offline');
    else await clear();
  }
}

/** Revokes the session on the server (best effort) and always clears it locally. */
export async function signOut(): Promise<void> {
  const stored = await tokenStorage.get();
  if (stored) await api.auth.signOut(stored).catch(() => undefined);
  await useSession.getState().clear();
}

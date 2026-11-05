import { ApiError, createApiClient } from '@muso/api-client';
import type { AuthSession } from '@muso/shared';
import { useSession } from '@/features/auth/session-store';
import { tokenStorage } from '@/features/auth/token-storage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env',
  );
}

/** Unauthenticated client used for the refresh call itself (avoids recursion). */
const bare = createApiClient({ baseUrl });

let refreshInFlight: Promise<AuthSession> | null = null;

/**
 * Exchanges the stored refresh token for a new session. Concurrent callers share one
 * request — important because refresh tokens are single-use on the server.
 */
export function refreshSession(): Promise<AuthSession> {
  refreshInFlight ??= (async () => {
    try {
      const stored = await tokenStorage.get();
      if (!stored) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
      const session = await bare.auth.refresh(stored);
      await useSession.getState().setSession(session);
      return session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function getAccessToken(): Promise<string | null> {
  const { accessToken, accessTokenExpiresAt, status } = useSession.getState();
  if (status !== 'signedIn' || !accessToken) return null;
  // Refresh proactively when the token expires within 30s.
  if (accessTokenExpiresAt && accessTokenExpiresAt - Date.now() < 30_000) {
    return (await refreshSession()).tokens.accessToken;
  }
  return accessToken;
}

/** On a 401: refresh once and retry. If the refresh itself is rejected, sign out locally. */
async function onUnauthorized(): Promise<boolean> {
  try {
    await refreshSession();
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) await useSession.getState().clear();
    return false;
  }
}

/** App-wide API surface. Screens never call fetch directly. */
export const api = createApiClient({ baseUrl, getAccessToken, onUnauthorized });

/** Human-readable message for any thrown error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

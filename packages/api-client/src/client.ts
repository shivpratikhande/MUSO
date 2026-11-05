import {
  ERROR_CODES,
  isApiFailure,
  type ApiResponse,
  type ArtistDetail,
  type ArtistProfileInput,
  type ArtistSummary,
  type AuthSession,
  type AuthUser,
  type CreateEventInput,
  type CreatorProfileInput,
  type EventDetail,
  type EventSummary,
  type Genre,
  type MyProfile,
  type OrganizerProfileInput,
  type Paginated,
  type PresignUploadInput,
  type PresignedUpload,
  type ReviewEventInput,
  type SetLineupInput,
  type SetRolesInput,
  type SetScheduleInput,
  type UpdateEventInput,
  type UpdateMeInput,
  type ForgotPasswordInput,
  type Health,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@muso/shared';

/** Error thrown for any non-2xx response or network failure. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the failed request carried an access token. */
  authenticated = false;

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, if signed in. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Called once when an authenticated request gets a 401. Return true if the session was
   * refreshed; the request is then retried once with the new token.
   */
  onUnauthorized?: () => Promise<boolean>;
  /** Request timeout in ms (default 15s). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function createApiClient(opts: ApiClientOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: HttpMethod, path: string, ro: RequestOptions = {}): Promise<T> {
    try {
      return await send<T>(method, path, ro);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        err.authenticated &&
        opts.onUnauthorized
      ) {
        if (await opts.onUnauthorized()) return send<T>(method, path, ro);
      }
      throw err;
    }
  }

  async function send<T>(method: HttpMethod, path: string, ro: RequestOptions): Promise<T> {
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(ro.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...ro.headers };
    if (ro.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await opts.getAccessToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    ro.signal?.addEventListener('abort', () => controller.abort());

    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method,
        headers,
        body: ro.body === undefined ? undefined : JSON.stringify(ro.body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError(
        'NETWORK_ERROR',
        'Could not reach the server. Check your connection.',
        0,
        err,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;

    let json: ApiResponse<T> | undefined;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = undefined;
    }

    if (json && isApiFailure(json)) {
      const e = new ApiError(json.error.code, json.error.message, res.status, json.error.details);
      e.authenticated = !!token;
      throw e;
    }
    if (!res.ok || !json) {
      throw new ApiError(ERROR_CODES.INTERNAL, `Unexpected response (${res.status})`, res.status);
    }
    return json.data;
  }

  return {
    request,
    health: {
      get: (signal?: AbortSignal) => request<Health>('GET', '/health', { signal }),
    },
    auth: {
      signUp: (body: SignUpInput) => request<AuthSession>('POST', '/auth/sign-up', { body }),
      signIn: (body: SignInInput) => request<AuthSession>('POST', '/auth/sign-in', { body }),
      refresh: (refreshToken: string) =>
        request<AuthSession>('POST', '/auth/refresh', { body: { refreshToken } }),
      signOut: (refreshToken: string) =>
        request<void>('POST', '/auth/sign-out', { body: { refreshToken } }),
      me: () => request<AuthUser>('GET', '/auth/me'),
      verifyEmail: (code: string) =>
        request<AuthUser>('POST', '/auth/verify-email', { body: { code } }),
      resendVerification: () => request<void>('POST', '/auth/verify-email/resend'),
      forgotPassword: (body: ForgotPasswordInput) =>
        request<void>('POST', '/auth/password/forgot', { body }),
      resetPassword: (body: ResetPasswordInput) =>
        request<void>('POST', '/auth/password/reset', { body }),
    },
    me: {
      get: () => request<MyProfile>('GET', '/me'),
      update: (body: UpdateMeInput) => request<MyProfile>('PATCH', '/me', { body }),
      setRoles: (body: SetRolesInput) => request<MyProfile>('PUT', '/me/roles', { body }),
      saveArtist: (body: ArtistProfileInput) =>
        request<MyProfile>('PUT', '/me/artist-profile', { body }),
      saveCreator: (body: CreatorProfileInput) =>
        request<MyProfile>('PUT', '/me/creator-profile', { body }),
      saveOrganizer: (body: OrganizerProfileInput) =>
        request<MyProfile>('PUT', '/me/organizer-profile', { body }),
      completeOnboarding: () => request<MyProfile>('POST', '/me/onboarding/complete'),
    },
    uploads: {
      presign: (body: PresignUploadInput) =>
        request<PresignedUpload>('POST', '/uploads/presign', { body }),
    },
    genres: {
      list: () => request<Genre[]>('GET', '/genres'),
    },
    artists: {
      search: (q?: string, limit = 20) =>
        request<ArtistSummary[]>('GET', '/artists', { query: { q, limit } }),
      get: (id: string) => request<ArtistDetail>('GET', `/artists/${id}`),
    },
    events: {
      list: (query: {
        when?: 'upcoming' | 'live' | 'past';
        city?: string;
        q?: string;
        cursor?: string;
        limit?: number;
      }) => request<Paginated<EventSummary>>('GET', '/events', { query }),
      mine: () => request<EventSummary[]>('GET', '/events/mine'),
      following: () => request<EventSummary[]>('GET', '/events/following'),
      get: (id: string) => request<EventDetail>('GET', `/events/${id}`),
      create: (body: CreateEventInput) => request<EventDetail>('POST', '/events', { body }),
      update: (id: string, body: UpdateEventInput) =>
        request<EventDetail>('PATCH', `/events/${id}`, { body }),
      cancel: (id: string) => request<EventDetail>('POST', `/events/${id}/cancel`),
      setLineup: (id: string, body: SetLineupInput) =>
        request<EventDetail>('PUT', `/events/${id}/lineup`, { body }),
      setSchedule: (id: string, body: SetScheduleInput) =>
        request<EventDetail>('PUT', `/events/${id}/schedule`, { body }),
      follow: (id: string) => request<EventDetail>('PUT', `/events/${id}/follow`),
      unfollow: (id: string) => request<EventDetail>('DELETE', `/events/${id}/follow`),
    },
    admin: {
      pendingEvents: () => request<EventSummary[]>('GET', '/admin/events/pending'),
      reviewEvent: (id: string, body: ReviewEventInput) =>
        request<EventDetail>('POST', `/admin/events/${id}/review`, { body }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

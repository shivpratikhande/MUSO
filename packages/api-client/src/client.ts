import {
  ERROR_CODES,
  isApiFailure,
  type ApiResponse,
  type AuthSession,
  type AuthUser,
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

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, if signed in. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
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
      throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

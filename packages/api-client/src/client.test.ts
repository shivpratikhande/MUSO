import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  it('unwraps the data envelope and sends the bearer token', async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: { ok: true } }));
    const api = createApiClient({
      baseUrl: 'http://x/v1/',
      fetchImpl,
      getAccessToken: () => 't0k',
    });
    await expect(api.request('GET', '/thing', { query: { a: 1, b: undefined } })).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/v1/thing?a=1');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer t0k');
  });

  it('throws ApiError with the server error code', async () => {
    const fetchImpl = vi.fn(async () => json(409, { error: { code: 'CONFLICT', message: 'dup' } }));
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl });
    await expect(api.request('POST', '/y', { body: {} })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('maps network failures to a friendly ApiError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl });
    const err = await api.health.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetworkError).toBe(true);
  });
});

describe('api client 204 handling', () => {
  it('resolves undefined for 204 No Content', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl });
    await expect(api.auth.signOut('a'.repeat(43))).resolves.toBeUndefined();
  });
});

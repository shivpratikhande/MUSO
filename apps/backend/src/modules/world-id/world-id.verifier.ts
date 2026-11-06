/** Injection token for the World ID verifier (World's Developer Portal; faked in tests). */
export const WORLD_ID_VERIFIER = Symbol('WORLD_ID_VERIFIER');

export interface WorldIdVerifyResponse {
  success?: boolean;
  action?: string;
  nullifier?: string;
  environment?: string;
  code?: string;
  detail?: string;
  results?: {
    identifier?: string;
    success?: boolean;
    nullifier?: string;
    code?: string;
    detail?: string;
  }[];
}

export interface WorldIdVerifier {
  /** POST {verifyUrl}/{rpId} with the IDKit result, unchanged. */
  verify(rpId: string, body: unknown): Promise<{ status: number; json: WorldIdVerifyResponse }>;
}

export class HttpWorldIdVerifier implements WorldIdVerifier {
  constructor(private readonly baseUrl: string) {}

  async verify(rpId: string, body: unknown) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(rpId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as WorldIdVerifyResponse;
    return { status: res.status, json };
  }
}

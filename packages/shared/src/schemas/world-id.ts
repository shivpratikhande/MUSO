import { z } from 'zod';

/** World ID (IDKit v4, World ID 4.0): one verified human per MUSO account, required to earn
 *  from "verified humans only" reward pools (all Arc-funded pools). */

/** What the app needs to start an IDKit request. The RP signature is made on the server. */
export interface WorldIdContext {
  app_id: string;
  action: string;
  /** `sandbox` = World's [SANDBOX] test app, `staging` = web Simulator, `production` = World App. */
  environment: 'production' | 'staging' | 'sandbox';
  /** Bound into the proof; the server checks it matches the signed-in account. */
  signal: string;
  rp_context: {
    rp_id: string;
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;
  };
}

export interface HumanStatus {
  /** World ID is configured on this server. */
  enabled: boolean;
  verified: boolean;
  verifiedAt: string | null;
}

/** The IDKit result, forwarded to World's verifier exactly as IDKit returned it. */
export const VerifyHumanSchema = z.object({
  result: z
    .object({
      protocol_version: z.string(),
      nonce: z.string(),
      environment: z.string(),
      responses: z.array(z.record(z.string(), z.unknown())).min(1),
    })
    .loose(),
});
export type VerifyHumanInput = z.infer<typeof VerifyHumanSchema>;

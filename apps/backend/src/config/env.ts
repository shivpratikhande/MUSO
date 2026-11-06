import { z } from 'zod';

/**
 * All backend configuration is validated at boot. The process refuses to start
 * with missing or malformed values instead of failing later at request time.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Comma-separated list of allowed browser origins. Native apps do not send Origin. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** HMAC secret for access tokens. Generate with `openssl rand -base64 48`. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** S3-compatible object storage (MinIO locally, S3/R2 in production). */
  S3_ENDPOINT: z.url().optional(),
  /** Host the *phone* uses for uploads and image URLs (LAN IP in dev, CDN in prod). */
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PUBLIC: z.string().min(3).default('muso-public'),
  /** Originals and fan-media derivatives. Never publicly readable; served via signed URLs. */
  S3_BUCKET_PRIVATE: z.string().min(3).default('muso-private'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Create buckets + public-read policy on boot (dev/test only). */
  /** Run the media-processing worker in this process (disable on API-only replicas). */
  MEDIA_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** Payment provider. `sandbox` simulates a hosted checkout (no real money) and is refused in production. */
  PAYMENTS_PROVIDER: z.enum(['sandbox']).default('sandbox'),
  /** HMAC secret for signed checkout links. Generate with `openssl rand -base64 48`. */
  PAYMENTS_SIGNING_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Base URL the phone uses to reach this API (for hosted checkout pages). */
  PUBLIC_API_URL: z.url(),
  /** Platform fee in basis points (1000 = 10%). */
  PLATFORM_FEE_BPS_SALES: z.coerce.number().int().min(0).max(5000).default(1000),
  PLATFORM_FEE_BPS_TIPS: z.coerce.number().int().min(0).max(5000).default(500),
  /** Hold window before pending earnings become available (refund/chargeback buffer). */
  EARNINGS_HOLD_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 60)
    .default(7 * 24 * 60),
  /** x402: lets AI agents buy paid content per request, settled on Hedera (USDC). */
  X402_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  X402_NETWORK: z.enum(['hedera:testnet', 'hedera:mainnet']).default('hedera:testnet'),
  X402_FACILITATOR_URL: z.url().default('https://x402.org/facilitator'),
  /** Hedera account that receives agent payments (MUSO treasury; creators are credited via the ledger). */
  X402_PAY_TO: z
    .string()
    .regex(/^0\.0\.\d+$/, 'Hedera account id like 0.0.12345')
    .optional(),
  /** Fixed demo FX rate for quoting INR prices in USDC. */
  X402_INR_PER_USD: z.coerce.number().positive().default(84),
  /** Arc: sponsor-funded USDC reward campaigns (RewardCampaigns contract, built in Arc Studio). */
  ARC_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ARC_RPC_URL: z.url().default('https://rpc.testnet.arc.network'),
  ARC_CHAIN_ID: z.coerce.number().int().positive().default(5042002),
  ARC_EXPLORER_URL: z.url().default('https://testnet.arcscan.app'),
  ARC_REWARD_CAMPAIGNS_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
    .optional(),
  /** Allocator + relayer key: awards creators and submits their claims (pays gas in USDC). */
  ARC_ALLOCATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, '0x-prefixed 32-byte hex key')
    .optional(),
  /** Run payment reconciliation + earnings release timers in this process. */
  PAYMENTS_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  S3_AUTO_CREATE_BUCKETS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Cross-field rules. */
function checkEnv(env: Env): string[] {
  const problems: string[] = [];
  if (env.X402_ENABLED && !env.X402_PAY_TO) {
    problems.push('  - X402_PAY_TO: required when X402_ENABLED=true');
  }
  if (env.ARC_ENABLED && (!env.ARC_REWARD_CAMPAIGNS_ADDRESS || !env.ARC_ALLOCATOR_PRIVATE_KEY)) {
    problems.push(
      '  - ARC_REWARD_CAMPAIGNS_ADDRESS, ARC_ALLOCATOR_PRIVATE_KEY: required when ARC_ENABLED=true',
    );
  }
  if (env.NODE_ENV === 'production' && env.PAYMENTS_PROVIDER === 'sandbox') {
    problems.push('  - PAYMENTS_PROVIDER: the sandbox provider cannot be used in production');
  }
  return problems;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const problems = checkEnv(result.data);
  if (problems.length)
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  return result.data;
}

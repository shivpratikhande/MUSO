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
  /**
   * Public read URL of the public bucket when it differs from `<S3_PUBLIC_ENDPOINT>/<bucket>`,
   * e.g. Cloudflare R2's `https://pub-xxxx.r2.dev` (uploads still go to S3_PUBLIC_ENDPOINT).
   */
  S3_PUBLIC_BASE_URL: z.url().optional(),
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
  /** Demo deployments only: lets the simulated (no real money) provider run with NODE_ENV=production. */
  ALLOW_SANDBOX_PAYMENTS_IN_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
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
  /**
   * Public https base for MUSO's wallet page (wallet apps like MetaMask only open https).
   * Defaults to PUBLIC_API_URL; in dev point it at a tunnel, e.g. `ngrok http 4000`.
   */
  ARC_PUBLIC_URL: z.url().optional(),
  /** USDC's ERC-20 interface on Arc (6 decimals). */
  ARC_USDC_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
    .default('0x3600000000000000000000000000000000000000'),
  ARC_REWARD_CAMPAIGNS_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
    .optional(),
  /** Allocator + relayer key: awards creators and submits their claims (pays gas in USDC). */
  ARC_ALLOCATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, '0x-prefixed 32-byte hex key')
    .optional(),
  /**
   * Predictions: a testnet prediction game on any event (PredictionPools on Arc). Uses the Arc
   * RPC and ARC_ALLOCATOR_PRIVATE_KEY, which acts as resolver (settles) and gatekeeper (signs pick tickets).
   */
  PREDICTIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PREDICTIONS_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
    .optional(),
  /** World ID (IDKit v4): one verified human per account, required to earn from human-only pools. */
  WORLD_ID_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** From the World Developer Portal (developer.world.org). */
  WORLD_ID_APP_ID: z
    .string()
    .regex(/^app_[A-Za-z0-9_]+$/, 'app_… id')
    .optional(),
  WORLD_ID_RP_ID: z
    .string()
    .regex(/^rp_[A-Za-z0-9_]+$/, 'rp_… id')
    .optional(),
  /** RP signing key (secret, server only). Signs each proof request. */
  WORLD_ID_SIGNING_KEY: z
    .string()
    .regex(/^(0x)?[0-9a-fA-F]{64}$/, '32-byte hex key')
    .optional(),
  WORLD_ID_ACTION: z.string().min(1).max(100).default('muso-creator-rewards'),
  /**
   * `sandbox`: World's [SANDBOX] World ID test app (mocked proofs). `staging`: the web Simulator.
   * `production`: the real World App.
   */
  WORLD_ID_ENVIRONMENT: z.enum(['production', 'staging', 'sandbox']).default('staging'),
  WORLD_ID_VERIFY_URL: z.url().default('https://developer.world.org/api/v4/verify'),
  /** Arkiv: public, queryable record of events, clips and sponsored pools' attention reports. */
  ARKIV_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** MUSO's writer wallet on Arkiv (testnet; pays fees in tGLM). Server only. */
  ARKIV_WRITER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, '0x-prefixed 32-byte hex key')
    .optional(),
  /** Free key from hub.arkiv.network/access-keys (the public RPC is heavily rate limited). */
  ARKIV_ACCESS_KEY: z.string().default(''),
  ARKIV_EXPLORER_URL: z.url().default('https://rabdi.explorer.arkiv.network'),
  /** ENS: free `<username>.<parent>` subnames for creators, served by MUSO's CCIP-Read gateway. */
  ENS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Parent name MUSO owns on ENS and points at the OffchainResolver. */
  ENS_PARENT_NAME: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9-]+\.)+[a-z]+$/, 'a name like muso.eth')
    .default('muso.eth'),
  /** Ethereum network where the parent name lives (Sepolia for testing). */
  ENS_CHAIN: z.enum(['mainnet', 'sepolia']).default('sepolia'),
  /** Ethereum RPC used to read other people's ENS names (not needed for MUSO subnames). */
  ENS_RPC_URL: z.url().default('https://ethereum-sepolia-rpc.publicnode.com'),
  /** Gateway signing key (secret, server only). The resolver contract trusts its address. */
  ENS_SIGNER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, '0x-prefixed 32-byte hex key')
    .optional(),
  /** Deployed OffchainResolver (informational: shown in /v1/ens/status). */
  ENS_RESOLVER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
    .optional(),
  /** How long a signed gateway answer stays valid on-chain. */
  ENS_RESPONSE_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),
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
  if (
    env.PREDICTIONS_ENABLED &&
    (!env.PREDICTIONS_CONTRACT_ADDRESS || !env.ARC_ALLOCATOR_PRIVATE_KEY)
  ) {
    problems.push(
      '  - PREDICTIONS_CONTRACT_ADDRESS, ARC_ALLOCATOR_PRIVATE_KEY: required when PREDICTIONS_ENABLED=true',
    );
  }
  if (
    env.WORLD_ID_ENABLED &&
    (!env.WORLD_ID_APP_ID || !env.WORLD_ID_RP_ID || !env.WORLD_ID_SIGNING_KEY)
  ) {
    problems.push(
      '  - WORLD_ID_APP_ID, WORLD_ID_RP_ID, WORLD_ID_SIGNING_KEY: required when WORLD_ID_ENABLED=true',
    );
  }
  if (env.ARKIV_ENABLED && !env.ARKIV_WRITER_PRIVATE_KEY) {
    problems.push('  - ARKIV_WRITER_PRIVATE_KEY: required when ARKIV_ENABLED=true');
  }
  if (env.ENS_ENABLED && !env.ENS_SIGNER_PRIVATE_KEY) {
    problems.push('  - ENS_SIGNER_PRIVATE_KEY: required when ENS_ENABLED=true');
  }
  if (
    env.NODE_ENV === 'production' &&
    env.PAYMENTS_PROVIDER === 'sandbox' &&
    !env.ALLOW_SANDBOX_PAYMENTS_IN_PRODUCTION
  ) {
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

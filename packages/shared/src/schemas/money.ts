import { z } from 'zod';
import { UuidSchema } from './common.js';

/**
 * All money is integer minor units: paise for INR (₹1 = 100), cents for USD. On MUSO, USD
 * always means USDC on Arc (1 USDC = 100 minor units; USDC base units = minor × 10⁴).
 */
export const MIN_PRICE_MINOR = 1_000; // ₹10
export const MAX_PRICE_MINOR = 500_000; // ₹5,000
export const MIN_TIP_MINOR = 1_000; // ₹10
export const MAX_TIP_MINOR = 1_000_000; // ₹10,000
export const TIP_PRESETS_MINOR = [1_000, 2_000, 5_000, 10_000] as const;
export const PRICE_PRESETS_MINOR = [2_000, 4_900, 9_900, 19_900] as const;

export interface MoneyRules {
  minPrice: number;
  maxPrice: number;
  minTip: number;
  maxTip: number;
  defaultPrice: number;
  tipPresets: readonly number[];
  pricePresets: readonly number[];
}

/** Price and tip limits per currency. The server enforces these for the post's currency. */
export const MONEY_RULES: Record<'INR' | 'USD', MoneyRules> = {
  INR: {
    minPrice: MIN_PRICE_MINOR,
    maxPrice: MAX_PRICE_MINOR,
    minTip: MIN_TIP_MINOR,
    maxTip: MAX_TIP_MINOR,
    defaultPrice: 4_900,
    tipPresets: TIP_PRESETS_MINOR,
    pricePresets: PRICE_PRESETS_MINOR,
  },
  USD: {
    minPrice: 50, // 0.50 USDC
    maxPrice: 10_000, // 100 USDC
    minTip: 50,
    maxTip: 20_000,
    defaultPrice: 100,
    tipPresets: [50, 100, 200, 500],
    pricePresets: [100, 200, 500, 1_000],
  },
};
export const moneyRules = (currency: string): MoneyRules =>
  MONEY_RULES[currency as keyof typeof MONEY_RULES] ?? MONEY_RULES.INR;

/** Display unit for amount inputs, e.g. "₹" or "USDC". */
export const currencyUnit = (currency: string) =>
  currency === 'INR' ? '₹' : currency === 'USD' ? 'USDC' : currency;

export function formatMoney(minor: number, currency = 'INR'): string {
  const major = minor / 100;
  const digits = { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 };
  if (currency === 'USD') return `${major.toLocaleString('en-US', digits)} USDC`;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${major.toLocaleString('en-IN', digits)}`;
}

/** Fee in minor units for a gross amount at `bps` basis points, rounded half-up. */
export const feeFor = (grossMinor: number, bps: number) =>
  Math.floor((grossMinor * bps + 5_000) / 10_000);

// Widest bounds of any currency; the exact limits for the post's currency are checked server-side.
const priceMinor = z
  .number()
  .int()
  .min(MONEY_RULES.USD.minPrice, 'That price is too low')
  .max(MAX_PRICE_MINOR, 'That price is too high');

export const PricingSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('FREE'), tipsEnabled: z.boolean().default(true) }),
    z.object({
      mode: z.literal('PAY_TO_UNLOCK'),
      priceMinor,
      tipsEnabled: z.boolean().default(true),
    }),
    z.object({
      mode: z.literal('PAY_WHAT_YOU_WANT'),
      suggestedMinor: priceMinor,
      minimumMinor: priceMinor.nullable().optional(),
      /** true: contribute to view. false: public, contributions optional. */
      gated: z.boolean().default(true),
      tipsEnabled: z.boolean().default(true),
    }),
  ])
  .refine(
    (p) => p.mode !== 'PAY_WHAT_YOU_WANT' || !p.minimumMinor || p.minimumMinor <= p.suggestedMinor,
    {
      message: 'Minimum can’t be more than the suggested amount',
      path: ['minimumMinor'],
    },
  );
export type PricingInput = z.input<typeof PricingSchema>;

export const CreateCheckoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('UNLOCK'),
    postId: UuidSchema,
    /** Required for pay-what-you-want; ignored for fixed prices (server uses the current price). */
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(MAX_PRICE_MINOR * 4)
      .optional(),
    idempotencyKey: UuidSchema,
    returnUrl: z.string().max(500),
  }),
  z.object({
    kind: z.literal('POOL_FUNDING'),
    poolId: UuidSchema,
    idempotencyKey: UuidSchema,
    returnUrl: z.string().max(500),
  }),
  z.object({
    kind: z.literal('TIP'),
    postId: UuidSchema,
    amountMinor: z
      .number()
      .int()
      .min(MONEY_RULES.USD.minTip, 'That tip is too small')
      .max(MAX_TIP_MINOR, 'That tip is too big'),
    message: z.string().trim().max(140).optional(),
    idempotencyKey: UuidSchema,
    returnUrl: z.string().max(500),
  }),
]);
export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;

// ───────────── Response shapes ─────────────

export type MonetizationModeDto = 'FREE' | 'PAY_TO_UNLOCK' | 'PAY_WHAT_YOU_WANT';

export interface PostMonetization {
  mode: MonetizationModeDto;
  priceMinor: number | null;
  suggestedMinor: number | null;
  minimumMinor: number | null;
  gated: boolean;
  tipsEnabled: boolean;
  currency: string;
}

export type PaymentStatusDto =
  'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

export interface PaymentDto {
  id: string;
  kind: 'UNLOCK' | 'TIP' | 'POOL_FUNDING';
  status: PaymentStatusDto;
  amountMinor: number;
  currency: string;
  /** Platform fee deducted from the creator's share. */
  feeMinor: number;
  creatorReceivesMinor: number;
  checkoutUrl: string | null;
  provider: string;
  /** True for the sandbox provider: no real money moves. */
  testMode: boolean;
  failureReason: string | null;
  post: { id: string; thumbUrl: string | null; caption: string } | null;
  /** Null for pool funding (money goes to the pool's escrow). */
  payee: { id: string; displayName: string | null; username: string | null } | null;
  pool: { id: string; title: string } | null;
  createdAt: string;
  succeededAt: string | null;
  /** USDC payments: the Arc transaction that paid the creator. */
  txUrl: string | null;
}

export type EarningStatusDto =
  'ESTIMATED' | 'PENDING' | 'CONFIRMED' | 'AVAILABLE' | 'PAID' | 'REVERSED';
export type EarningSourceDto = 'TIP' | 'PHOTO_SALE' | 'VIDEO_SALE' | 'WATCH_REWARD';

export interface EarningDto {
  id: string;
  source: EarningSourceDto;
  status: EarningStatusDto;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  availableAt: string;
  createdAt: string;
  currency: string;
  /** USDC payments: the Arc transaction that paid the creator directly. */
  txUrl: string | null;
  post: { id: string; thumbUrl: string | null } | null;
  from: { displayName: string | null; username: string | null } | null;
}

/** GET /payments/config. */
export interface PaymentsConfig {
  feeBpsSales: number;
  feeBpsTips: number;
  testMode: boolean;
  provider: string;
  /** Currency of new posts and of the Earnings screen. USD = USDC on Arc. */
  currency: string;
  /** True when USD posts are paid in USDC on Arc, wallet to wallet. */
  usdcOnArc: boolean;
  /** Fee on USDC payments (creators receive the rest straight to their wallet). */
  feeBpsUsdc: number;
}

export interface EarningsSummary {
  currency: string;
  /** Net amounts by status. Only `available` is withdrawable. */
  byStatus: Record<EarningStatusDto, number>;
  /** Gross by source, plus totals. */
  bySource: Record<EarningSourceDto, number>;
  grossMinor: number;
  feesMinor: number;
  netMinor: number;
  topPosts: { postId: string; thumbUrl: string | null; netMinor: number; count: number }[];
  recent: EarningDto[];
  /** Hold window before pending earnings become available. */
  holdHours: number;
}

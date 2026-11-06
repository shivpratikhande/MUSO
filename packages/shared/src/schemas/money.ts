import { z } from 'zod';
import { UuidSchema } from './common.js';

/** All money is integer minor units (paise). ₹1 = 100. */
export const MIN_PRICE_MINOR = 1_000; // ₹10
export const MAX_PRICE_MINOR = 500_000; // ₹5,000
export const MIN_TIP_MINOR = 1_000; // ₹10
export const MAX_TIP_MINOR = 1_000_000; // ₹10,000
export const TIP_PRESETS_MINOR = [1_000, 2_000, 5_000, 10_000] as const;
export const PRICE_PRESETS_MINOR = [2_000, 4_900, 9_900, 19_900] as const;

export function formatMoney(minor: number, currency = 'INR'): string {
  const major = minor / 100;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${major.toLocaleString('en-IN', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Fee in minor units for a gross amount at `bps` basis points, rounded half-up. */
export const feeFor = (grossMinor: number, bps: number) =>
  Math.floor((grossMinor * bps + 5_000) / 10_000);

const priceMinor = z
  .number()
  .int()
  .min(MIN_PRICE_MINOR, 'Minimum is ₹10')
  .max(MAX_PRICE_MINOR, 'Maximum is ₹5,000');

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
      .min(MIN_TIP_MINOR, 'Minimum tip is ₹10')
      .max(MAX_TIP_MINOR, 'Maximum tip is ₹10,000'),
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
  post: { id: string; thumbUrl: string | null } | null;
  from: { displayName: string | null; username: string | null } | null;
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

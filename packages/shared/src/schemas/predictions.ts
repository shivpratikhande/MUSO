import { z } from 'zod';
import { UuidSchema } from './common.js';

/**
 * Prediction game on any MUSO event, played with test USDC on Arc (PredictionPools contract).
 * Testnet only: a "prediction game", never real-money betting.
 */

export const PREDICTION_TEMPLATES = [
  'MATCH_WINNER',
  'BATTLE',
  'SETLIST',
  'BEST_CLIP',
  'CUSTOM',
] as const;
export type PredictionTemplateDto = (typeof PREDICTION_TEMPLATES)[number];

export type PredictionResolutionDto = 'MANUAL' | 'DATA';
/** LOCKED is derived (open on-chain but past `locksAt`). */
export type PredictionStatusDto = 'PENDING' | 'OPEN' | 'LOCKED' | 'SETTLED' | 'REFUNDING';
export type PredictionPickStatusDto = 'TICKETED' | 'CONFIRMED' | 'PAID' | 'LOST';

/** Contract limits (PredictionPools.sol). */
export const PREDICTION_MAX_OPTIONS = 16;
export const PREDICTION_MAX_CREATOR_BPS = 2_000;

/** What each template means, for the organizer's picker. */
export const PREDICTION_TEMPLATE_INFO: Record<
  PredictionTemplateDto,
  { label: string; question: string; resolution: PredictionResolutionDto }
> = {
  MATCH_WINNER: { label: 'Match winner', question: 'Who wins the match?', resolution: 'MANUAL' },
  BATTLE: {
    label: 'Battle of the bands',
    question: 'Who wins tonight’s battle?',
    resolution: 'MANUAL',
  },
  SETLIST: { label: 'Setlist', question: 'What’s the encore song?', resolution: 'MANUAL' },
  BEST_CLIP: {
    label: 'Best clip',
    question: 'Whose clip gets the most real watch time tonight?',
    resolution: 'DATA',
  },
  CUSTOM: { label: 'Custom question', question: '', resolution: 'MANUAL' },
};

const usdc = (max: number) =>
  z
    .number()
    .min(0.01)
    .max(max)
    .refine((v) => Math.round(v * 1e6) === Math.round(v * 100) * 1e4, 'At most 2 decimals');

export const CreatePredictionSchema = z
  .object({
    template: z.enum(PREDICTION_TEMPLATES),
    question: z.string().trim().min(5).max(140),
    /** Labels for MANUAL markets (players, bands, songs…). */
    options: z
      .array(z.string().trim().min(1).max(60))
      .min(2)
      .max(PREDICTION_MAX_OPTIONS)
      .optional(),
    /** BEST_CLIP: the creators to pick between (their usernames become the options). */
    creatorIds: z.array(UuidSchema).min(2).max(PREDICTION_MAX_OPTIONS).optional(),
    /** Picks close at this time. Defaults to the event start (or now + 1h if it already started). */
    locksAt: z.iso.datetime().optional(),
    /** BEST_CLIP only: when watch time stops counting and the market settles. Defaults to event end + 1h. */
    settlesAt: z.iso.datetime().optional(),
    minStakeUsdc: usdc(1_000).default(1),
    maxStakeUsdc: usdc(10_000).default(50),
    /** BEST_CLIP: % of the pool paid to the winning creator (0–20). */
    creatorSharePct: z.number().int().min(0).max(20).default(10),
    humanOnly: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.template === 'BEST_CLIP' && !p.creatorIds)
      ctx.addIssue({ code: 'custom', path: ['creatorIds'], message: 'Choose at least 2 creators' });
    if (p.template !== 'BEST_CLIP' && !p.options)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least 2 options' });
    const list = p.template === 'BEST_CLIP' ? p.creatorIds : p.options;
    if (list && new Set(list.map((o) => o.toLowerCase())).size !== list.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different' });
    if (p.maxStakeUsdc < p.minStakeUsdc)
      ctx.addIssue({ code: 'custom', path: ['maxStakeUsdc'], message: 'Max must be at least min' });
  });
export type CreatePredictionInput = z.input<typeof CreatePredictionSchema>;

export const PickLinkSchema = z.object({
  option: z
    .number()
    .int()
    .min(0)
    .max(PREDICTION_MAX_OPTIONS - 1),
  stakeUsdc: usdc(10_000),
  returnUrl: z
    .string()
    .max(500)
    .regex(/^(muso|exp|exps):\/\//, 'Invalid return URL'),
});
export type PickLinkInput = z.infer<typeof PickLinkSchema>;

export const SettlePredictionSchema = z.object({
  option: z
    .number()
    .int()
    .min(0)
    .max(PREDICTION_MAX_OPTIONS - 1),
});
export type SettlePredictionInput = z.infer<typeof SettlePredictionSchema>;

// ───────────── Response shapes ─────────────

export interface PredictionOptionDto {
  index: number;
  label: string;
  /** BEST_CLIP: the creator this option stands for. */
  creatorId: string | null;
  /** USDC base units staked on this option (confirmed picks), as a string. */
  totalMicro: string;
  pickers: number;
  /** Payout per 1 USDC staked if this option wins (after the creator share); null if nobody picked it. */
  multiplier: number | null;
  /** BEST_CLIP: verified watch time so far (seconds), for the live leaderboard. */
  watchSeconds: number | null;
}

export interface MyPredictionPickDto {
  option: number;
  stakeMicro: string;
  status: PredictionPickStatusDto;
  payoutMicro: string | null;
  pickTxUrl: string | null;
  payoutTxUrl: string | null;
}

export interface PredictionDto {
  id: string;
  eventId: string;
  question: string;
  template: PredictionTemplateDto;
  resolution: PredictionResolutionDto;
  status: PredictionStatusDto;
  options: PredictionOptionDto[];
  locksAt: string;
  settlesAt: string | null;
  resolveBy: string;
  minStakeMicro: string;
  maxStakeMicro: string;
  creatorSharePct: number;
  humanOnly: boolean;
  totalMicro: string;
  pickers: number;
  winningOption: number | null;
  note: string | null;
  /** Arc explorer links. */
  contractUrl: string | null;
  createTxUrl: string | null;
  settleTxUrl: string | null;
  chainMarketId: number | null;
  /** The signed-in user's pick, if any. */
  myPick: MyPredictionPickDto | null;
  /** The signed-in user organizes this event (can settle / cancel). */
  canManage: boolean;
}

/** Who can be an option, for the organizer's form. */
export interface PredictionSuggestions {
  lineup: string[];
  /** Creators who posted at this event (for BEST_CLIP). */
  creators: { id: string; username: string; displayName: string | null; posts: number }[];
}

/** What the wallet page needs to send a pick (from MUSO's signed ticket). */
export interface PickTicketDto {
  contract: string;
  usdc: string;
  marketId: number;
  option: number;
  optionLabel: string;
  question: string;
  stakeMicro: string;
  /** Full calldata for PredictionPools.pick(…) including MUSO's ticket. */
  pickData: string;
  deadline: number;
}

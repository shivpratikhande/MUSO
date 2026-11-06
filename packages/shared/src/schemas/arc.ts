import { z } from 'zod';

/** On-chain USDC reward payouts on Arc (RewardCampaigns contract, built in Arc Studio). */

export const EvmAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Enter a 0x… wallet address');

const HexSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]+$/, 'Invalid signature');

/** How long a wallet-link challenge stays valid. */
export const WALLET_CHALLENGE_TTL_MS = 15 * 60_000;

/**
 * The exact text a creator signs to prove they control a wallet. The server rebuilds it from the
 * signed-in account, so a signature can't be replayed for a different MUSO account.
 */
export function walletLinkMessage(p: {
  userId: string;
  address: string;
  chainId: number;
  issuedAt: string;
}): string {
  return [
    'MUSO: link this wallet to receive USDC rewards.',
    '',
    `Account: ${p.userId}`,
    `Wallet: ${p.address}`,
    `Chain: ${p.chainId}`,
    `Issued: ${p.issuedAt}`,
  ].join('\n');
}

export const WalletChallengeQuerySchema = z.object({ address: EvmAddressSchema });

export const LinkWalletSchema = z.object({
  address: EvmAddressSchema,
  issuedAt: z.iso.datetime({ message: 'Invalid date' }),
  signature: HexSchema,
});
export type LinkWalletInput = z.infer<typeof LinkWalletSchema>;

export const LinkArcCampaignSchema = z.object({
  campaignId: z.number().int().min(1),
});
export type LinkArcCampaignInput = z.infer<typeof LinkArcCampaignSchema>;

export interface WalletChallenge {
  message: string;
  issuedAt: string;
  address: string;
  chainId: number;
}

export interface MyWallet {
  address: string | null;
  linkedAt: string | null;
}

/** On-chain funding of a pool (shown to everyone; the chain is the source of truth). */
export interface ArcPoolInfo {
  campaignId: number;
  contract: string;
  sponsor: string;
  chainId: number;
  /** Explorer link to the contract. */
  contractUrl: string;
}

export type ArcPayoutStatusDto = 'WAITING_WALLET' | 'AWARDED' | 'CLAIMED' | 'SKIPPED';

export interface ArcPayoutDto {
  creatorId: string;
  /** USDC base units (6 decimals), as a string. */
  amountMicro: string;
  wallet: string | null;
  status: ArcPayoutStatusDto;
  awardTxUrl: string | null;
  claimTxUrl: string | null;
  note: string | null;
}

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WALLET_CHALLENGE_TTL_MS,
  walletLinkMessage,
  walletLinkTypedData,
  type LinkWalletInput,
  type MyWallet,
  type RewardPoolDetail,
  type WalletChallenge,
} from '@muso/shared';
import { getAddress, type Address, type Hex } from 'viem';
import type { Env } from '../../config/env.js';
import {
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { RewardsService } from '../rewards/rewards.service.js';
import { ARC_CHAIN, type ArcChain } from './arc.chain.js';

/** One awardMany transaction carries at most this many creators (the contract allows 500). */
const AWARD_BATCH = 200;
/** USD cents → USDC base units (6 decimals). */
export const CENT_MICRO = 10_000n;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

@Injectable()
export class ArcService {
  private readonly logger = new Logger(ArcService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(ARC_CHAIN) private readonly chain: ArcChain | null,
  ) {}

  private requireChain(): ArcChain {
    if (!this.chain) throw badRequest('On-chain rewards (Arc) are not enabled on this server');
    return this.chain;
  }

  private get chainId(): number {
    return this.config.get('ARC_CHAIN_ID', { infer: true });
  }

  // ─────────── Creator wallets ───────────

  async wallet(user: RequestUser): Promise<MyWallet> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { walletAddress: true, walletLinkedAt: true },
    });
    return {
      address: u.walletAddress ? getAddress(u.walletAddress) : null,
      linkedAt: u.walletLinkedAt?.toISOString() ?? null,
    };
  }

  /** The message the creator signs. Stateless: the server rebuilds it from the signed-in account. */
  challenge(user: RequestUser, address: string): WalletChallenge {
    this.requireChain();
    const a = getAddress(address);
    const issuedAt = new Date().toISOString();
    const message = walletLinkMessage({
      userId: user.id,
      address: a,
      chainId: this.chainId,
      issuedAt,
    });
    return {
      address: a,
      chainId: this.chainId,
      issuedAt,
      message,
      typedData: walletLinkTypedData(message, this.chainId),
    };
  }

  async linkWallet(user: RequestUser, input: LinkWalletInput): Promise<MyWallet> {
    const chain = this.requireChain();
    const issued = new Date(input.issuedAt).getTime();
    const age = Date.now() - issued;
    if (age > WALLET_CHALLENGE_TTL_MS || age < -60_000)
      throw badRequest('That signature request expired. Please sign again.');
    const address = getAddress(input.address);
    const message = walletLinkMessage({
      userId: user.id,
      address,
      chainId: this.chainId,
      issuedAt: input.issuedAt,
    });
    let ok = false;
    try {
      ok = await chain.verifySignature(address, message, input.signature as Hex);
    } catch {
      ok = false;
    }
    if (!ok) throw badRequest('The signature does not match this wallet');
    if (same(address, chain.allocator)) throw badRequest('This wallet cannot receive rewards');
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { walletAddress: address.toLowerCase(), walletLinkedAt: new Date() },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('This wallet is linked to another MUSO account');
      throw err;
    }
    return this.wallet(user);
  }

  async unlinkWallet(user: RequestUser): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { walletAddress: null, walletLinkedAt: null },
    });
  }

  // ─────────── Funding a pool on-chain ───────────

  /**
   * Links a draft pool to a sponsor-funded on-chain campaign. The chain is the source of truth:
   * the campaign must name MUSO's allocator, be untouched, end no later than the pool (so awards
   * are open when the pool distributes) and be sponsored by the organizer's own linked wallet.
   */
  async linkCampaign(
    poolId: string,
    campaignId: number,
    user: RequestUser,
  ): Promise<RewardPoolDetail> {
    const chain = this.requireChain();
    const pool = await this.prisma.rewardPool.findUnique({ where: { id: poolId } });
    if (!pool) throw notFound('That reward pool');
    if (pool.creatorId !== user.id) throw forbidden('Only the pool’s creator can fund it');
    if (pool.status !== 'DRAFT' || pool.arcCampaignId)
      throw conflict('This pool is already funded or closed');

    const c = await chain.getCampaign(campaignId);
    if (!c) throw badRequest(`Campaign #${campaignId} does not exist on Arc`);
    if (!same(c.allocator, chain.allocator))
      throw badRequest(`The campaign’s allocator must be MUSO (${chain.allocator})`);
    if (c.reclaimed || c.awardedTotal > 0n) throw badRequest('This campaign has already been used');
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { walletAddress: true },
    });
    if (!same(me.walletAddress, c.sponsor))
      throw forbidden('Link the wallet that funded this campaign to your account first');
    const poolEnd = Math.floor(pool.endsAt.getTime() / 1000);
    if (c.endsAt > poolEnd) throw badRequest('The campaign must end no later than the reward pool');
    if (c.awardWindowEnd < poolEnd + 3600)
      throw badRequest('The campaign’s award window closes too soon after the pool ends');
    const cents = c.budget / CENT_MICRO;
    if (cents < 1n || cents > 2_000_000_000n) throw badRequest('Unsupported campaign budget');

    try {
      const r = await this.prisma.rewardPool.updateMany({
        where: { id: poolId, status: 'DRAFT', arcCampaignId: null },
        data: {
          status: 'FUNDED',
          fundedAt: new Date(),
          currency: 'USD',
          budgetMinor: Number(cents),
          arcCampaignId: campaignId,
          arcSponsor: c.sponsor.toLowerCase(),
          // On-chain USDC goes only to verified humans when World ID is on.
          humanOnly: this.config.get('WORLD_ID_ENABLED', { infer: true }) ? true : undefined,
        },
      });
      if (r.count !== 1) throw conflict('This pool is already funded or closed');
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('That campaign already funds another pool');
      throw err;
    }
    this.logger.log(`Pool ${poolId} funded by Arc campaign #${campaignId} (${cents} cents)`);
    return this.rewards.get(poolId, user);
  }

  // ─────────── Paying creators on-chain ───────────

  /**
   * Awards distributed Arc pools to creators with linked wallets (awardMany from the allocator),
   * then relays each creator's claim (claimFor). Safe to re-run: every step first checks the
   * chain, and the contract itself refuses double awards and double claims.
   */
  async processPayouts(now = new Date()): Promise<{ awarded: number; claimed: number }> {
    const totals = { awarded: 0, claimed: 0 };
    if (!this.chain || this.running) return totals;
    this.running = true;
    try {
      const pools = await this.prisma.rewardPool.findMany({
        where: {
          arcCampaignId: { not: null },
          status: 'DISTRIBUTED',
          arcPayouts: { some: { status: { in: ['WAITING_WALLET', 'AWARDED'] } } },
        },
        select: { id: true, arcCampaignId: true },
      });
      for (const p of pools) {
        try {
          const r = await this.payPool(this.chain, p.id, p.arcCampaignId!, now);
          totals.awarded += r.awarded;
          totals.claimed += r.claimed;
        } catch (err) {
          this.logger.warn(`Arc payout for pool ${p.id} failed: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
    return totals;
  }

  private async payPool(chain: ArcChain, poolId: string, campaignId: number, now: Date) {
    const c = await chain.getCampaign(campaignId);
    if (!c) throw new Error(`campaign #${campaignId} not found`);
    const nowSec = Math.floor(now.getTime() / 1000);
    let awarded = 0;
    let claimed = 0;

    // 1) Award creators who have a wallet.
    const waiting = await this.prisma.arcPayout.findMany({
      where: { poolId, status: 'WAITING_WALLET', creator: { walletAddress: { not: null } } },
      include: { creator: { select: { walletAddress: true } } },
      orderBy: { amountMicro: 'desc' },
    });
    if (waiting.length) {
      const used = new Set(
        (
          await this.prisma.arcPayout.findMany({
            where: { poolId, wallet: { not: null } },
            select: { wallet: true },
          })
        ).map((x) => x.wallet!.toLowerCase()),
      );
      let remaining = c.budget - c.awardedTotal;
      const batch: { id: string; wallet: Address; amount: bigint; note: string | null }[] = [];
      for (const p of waiting) {
        const wallet = getAddress(p.creator.walletAddress!);
        const skip = (note: string) =>
          this.prisma.arcPayout.update({ where: { id: p.id }, data: { status: 'SKIPPED', note } });
        if (nowSec > c.awardWindowEnd) {
          await skip('The award window closed before a wallet was linked');
          continue;
        }
        if (used.has(wallet.toLowerCase())) {
          await skip('This wallet was already paid in this campaign');
          continue;
        }
        if (same(wallet, c.sponsor) || same(wallet, c.allocator)) {
          await skip('The sponsor’s or MUSO’s wallet cannot receive rewards');
          continue;
        }
        used.add(wallet.toLowerCase());
        // Recover from a crash between sending a transaction and recording it.
        const onChain = await chain.awardOf(campaignId, wallet);
        if (onChain > 0n) {
          await this.prisma.arcPayout.update({
            where: { id: p.id },
            data: { status: 'AWARDED', wallet: wallet.toLowerCase(), amountMicro: onChain },
          });
          continue;
        }
        let amount = p.amountMicro;
        let note: string | null = null;
        if (amount > c.maxPerRecipient) {
          amount = c.maxPerRecipient;
          note = 'Limited by the campaign’s per-creator cap';
        }
        if (amount > remaining) amount = remaining;
        if (amount <= 0n) {
          await skip('The campaign budget is used up');
          continue;
        }
        remaining -= amount;
        batch.push({ id: p.id, wallet, amount, note });
      }
      for (let i = 0; i < batch.length; i += AWARD_BATCH) {
        const chunk = batch.slice(i, i + AWARD_BATCH);
        const tx = await chain.awardMany(
          campaignId,
          chunk.map((b) => b.wallet),
          chunk.map((b) => b.amount),
        );
        for (const b of chunk) {
          await this.prisma.arcPayout.update({
            where: { id: b.id },
            data: {
              status: 'AWARDED',
              wallet: b.wallet.toLowerCase(),
              amountMicro: b.amount,
              awardTx: tx,
              note: b.note,
            },
          });
        }
        awarded += chunk.length;
        this.logger.log(`Arc campaign #${campaignId}: awarded ${chunk.length} creators (${tx})`);
      }
    }

    // 2) Relay claims so creators never need gas.
    const toClaim = await this.prisma.arcPayout.findMany({ where: { poolId, status: 'AWARDED' } });
    for (const p of toClaim) {
      const wallet = getAddress(p.wallet!);
      if (await chain.hasClaimed(campaignId, wallet)) {
        await this.prisma.arcPayout.update({ where: { id: p.id }, data: { status: 'CLAIMED' } });
        continue;
      }
      const tx = await chain.claimFor(campaignId, wallet);
      await this.prisma.arcPayout.update({
        where: { id: p.id },
        data: { status: 'CLAIMED', claimTx: tx },
      });
      claimed++;
    }
    if (claimed) this.logger.log(`Arc campaign #${campaignId}: relayed ${claimed} claims`);
    return { awarded, claimed };
  }
}

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ArcLink, LinkWalletInput, WalletChallenge } from '@muso/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAddress } from 'viem';
import type { Env } from '../../config/env.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { ARC_CHAIN, type ArcChain } from './arc.chain.js';
import { ArcService } from './arc.service.js';

/** Signed links to the browser wallet page expire after this long. */
const LINK_TTL_MS = 30 * 60_000;

export type ArcSessionPurpose = 'wallet' | 'fund';
interface SessionToken {
  u: string;
  p: ArcSessionPurpose;
  pool?: string;
  r: string;
  exp: number;
}

/** What the browser page needs to talk to the wallet and the chain. */
export interface ArcSessionInfo {
  purpose: ArcSessionPurpose;
  returnUrl: string;
  chain: { id: number; name: string; rpcUrl: string; explorerUrl: string };
  contract: string;
  usdc: string;
  allocator: string;
  linkedWallet: string | null;
  pool: { id: string; title: string; endsAt: number; suggestedUsdc: number } | null;
}

/**
 * The phone can't sign with a crypto wallet itself, so the app opens MUSO's wallet page in the
 * browser (or a wallet's in-app browser) with a short-lived HMAC-signed link that stands in for
 * the user's session. The page can only do what the link's purpose allows.
 */
@Injectable()
export class ArcSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arc: ArcService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(ARC_CHAIN) private readonly chain: ArcChain | null,
  ) {}

  private sign(payload: string): string {
    return createHmac('sha256', this.config.get('PAYMENTS_SIGNING_SECRET', { infer: true }))
      .update(`arc-session:${payload}`)
      .digest('base64url');
  }

  async createLink(
    user: RequestUser,
    purpose: ArcSessionPurpose,
    returnUrl: string,
    poolId?: string,
  ): Promise<ArcLink> {
    if (!this.chain) throw badRequest('On-chain rewards (Arc) are not enabled on this server');
    if (purpose === 'fund') {
      const pool = await this.prisma.rewardPool.findUnique({ where: { id: poolId } });
      if (!pool) throw notFound('That reward pool');
      if (pool.creatorId !== user.id) throw forbidden('Only the pool’s creator can fund it');
      if (pool.status !== 'DRAFT' || pool.arcCampaignId)
        throw conflict('This pool is already funded or closed');
    }
    const token: SessionToken = {
      u: user.id,
      p: purpose,
      r: returnUrl,
      exp: Date.now() + LINK_TTL_MS,
    };
    if (poolId) token.pool = poolId;
    const payload = Buffer.from(JSON.stringify(token)).toString('base64url');
    const base = (
      this.config.get('ARC_PUBLIC_URL', { infer: true }) ??
      this.config.get('PUBLIC_API_URL', { infer: true })
    ).replace(/\/$/, '');
    return { url: `${base}/v1/arc/connect?t=${payload}.${this.sign(payload)}` };
  }

  /** Verifies a link token. Throws a user-facing error when it's invalid or expired. */
  parse(t: string | undefined, purpose?: ArcSessionPurpose): SessionToken {
    const [payload, sig] = (t ?? '').split('.');
    const fail = () => forbidden('This link is invalid or has expired. Start again from the app.');
    if (!payload || !sig) throw fail();
    const a = Buffer.from(this.sign(payload));
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail();
    let token: SessionToken;
    try {
      token = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionToken;
    } catch {
      throw fail();
    }
    if (token.exp < Date.now() || (purpose && token.p !== purpose)) throw fail();
    return token;
  }

  private async user(token: SessionToken): Promise<RequestUser> {
    const u = await this.prisma.user.findFirst({
      where: { id: token.u, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true, roles: { select: { role: true } } },
    });
    if (!u) throw forbidden('This account is no longer available');
    return {
      id: u.id,
      email: u.email,
      emailVerified: !!u.emailVerifiedAt,
      roles: u.roles.map((r) => r.role),
    };
  }

  async info(t: string | undefined): Promise<ArcSessionInfo> {
    const token = this.parse(t);
    if (!this.chain) throw badRequest('On-chain rewards (Arc) are not enabled on this server');
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: token.u },
      select: { walletAddress: true },
    });
    let pool: ArcSessionInfo['pool'] = null;
    if (token.p === 'fund') {
      const p = await this.prisma.rewardPool.findUnique({ where: { id: token.pool } });
      if (!p) throw notFound('That reward pool');
      pool = {
        id: p.id,
        title: p.title,
        endsAt: Math.floor(p.endsAt.getTime() / 1000),
        // Pools are created in INR; suggest the same budget in USDC at the demo rate.
        suggestedUsdc:
          p.currency === 'INR'
            ? Math.max(
                1,
                Math.round(
                  p.budgetMinor / 100 / this.config.get('X402_INR_PER_USD', { infer: true }),
                ),
              )
            : p.budgetMinor / 100,
      };
    }
    return {
      purpose: token.p,
      returnUrl: token.r,
      chain: {
        id: this.config.get('ARC_CHAIN_ID', { infer: true }),
        name: 'Arc Testnet',
        rpcUrl: this.config.get('ARC_RPC_URL', { infer: true }),
        explorerUrl: this.chain.explorerUrl,
      },
      contract: this.chain.contract,
      usdc: getAddress(this.config.get('ARC_USDC_ADDRESS', { infer: true })),
      allocator: this.chain.allocator,
      linkedWallet: u.walletAddress ? getAddress(u.walletAddress) : null,
      pool,
    };
  }

  async challenge(t: string | undefined, address: string): Promise<WalletChallenge> {
    return this.arc.challenge(await this.user(this.parse(t)), address);
  }

  async linkWallet(t: string | undefined, input: LinkWalletInput) {
    return this.arc.linkWallet(await this.user(this.parse(t)), input);
  }

  async fund(t: string | undefined, campaignId: number): Promise<{ poolId: string }> {
    const token = this.parse(t, 'fund');
    await this.arc.linkCampaign(token.pool!, campaignId, await this.user(token));
    return { poolId: token.pool! };
  }
}

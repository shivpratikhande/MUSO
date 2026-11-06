import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PredictionMarket, type PredictionPick } from '@muso/database';
import {
  PREDICTION_TEMPLATE_INFO,
  type ArcLink,
  type MyPredictionPickDto,
  type PickLinkInput,
  type PickTicketDto,
  type PredictionDto,
  type PredictionOptionDto,
  type PredictionStatusDto,
  type PredictionSuggestions,
} from '@muso/shared';
import { getAddress, keccak256, toHex, type Address, type Hex } from 'viem';
import type { z } from 'zod';
import type { CreatePredictionSchema } from '@muso/shared';
import type { Env } from '../../config/env.js';
import {
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ArcSessionService } from '../arc/arc.session.js';
import type { RequestUser } from '../auth/auth.types.js';
import { PREDICTION_CHAIN, type PredictionChain } from './predictions.chain.js';

type CreateInput = z.output<typeof CreatePredictionSchema>;
interface StoredOption {
  label: string;
  creatorId: string | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Contract bounds on resolveBy - locksAt. */
const MIN_RESOLVE_WINDOW = HOUR;
const MAX_RESOLVE_WINDOW = 30 * DAY;
/** A pick ticket is valid this long (and never past the lock). */
const TICKET_TTL_MS = 20 * MIN;
/** Picks need to land before the lock; stop issuing tickets just before it. */
const LOCK_MARGIN_MS = 30_000;

const micro = (usdc: number) => BigInt(Math.round(usdc * 100)) * 10_000n;
/** MUSO market id (uuid) as the contract's bytes32 externalRef. */
const externalRef = (id: string) => `0x${id.replace(/-/g, '').padEnd(64, '0')}` as Hex;

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);
  /** Markets with an on-chain write in flight in this process (publish / settle / cancel). */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ArcSessionService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(PREDICTION_CHAIN) private readonly chain: PredictionChain | null,
  ) {}

  private requireChain(): PredictionChain {
    if (!this.chain) throw badRequest('Predictions are not enabled on this server');
    return this.chain;
  }

  private explorer(path: string | null): string | null {
    if (!path) return null;
    const base = (
      this.chain?.explorerUrl ?? this.config.get('ARC_EXPLORER_URL', { infer: true })
    ).replace(/\/$/, '');
    return `${base}/${path}`;
  }

  private canManage(user: RequestUser, organizerId: string): boolean {
    return user.id === organizerId || user.roles.includes('ADMIN');
  }

  // ─────────── Create ───────────

  async create(user: RequestUser, eventId: string, input: CreateInput): Promise<PredictionDto> {
    const chain = this.requireChain();
    if (!user.emailVerified) throw forbidden('Verify your email first');
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw notFound('That event');
    if (!this.canManage(user, event.organizerId))
      throw forbidden('Only the event’s organizer can add predictions');
    if (event.reviewStatus !== 'APPROVED') throw badRequest('The event must be approved first');
    if (event.cancelledAt) throw badRequest('This event was cancelled');
    const now = Date.now();
    if (event.endsAt.getTime() <= now) throw badRequest('This event has already ended');

    const info = PREDICTION_TEMPLATE_INFO[input.template];
    const resolution = info.resolution;

    let options: StoredOption[];
    if (input.template === 'BEST_CLIP') {
      const users = await this.prisma.user.findMany({
        where: { id: { in: input.creatorIds! }, deletedAt: null },
        select: { id: true, username: true, displayName: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      options = input.creatorIds!.map((id) => {
        const u = byId.get(id);
        if (!u) throw badRequest('One of those creators doesn’t exist');
        return { label: u.displayName ?? u.username ?? 'Creator', creatorId: u.id };
      });
    } else {
      options = input.options!.map((label) => ({ label, creatorId: null }));
    }

    const startsSoon = event.startsAt.getTime() > now + 15 * MIN;
    const locksAt = input.locksAt
      ? new Date(input.locksAt)
      : new Date(startsSoon ? event.startsAt.getTime() : now + HOUR);
    if (locksAt.getTime() < now + 5 * MIN)
      throw badRequest('Picks must stay open for at least 5 minutes');
    if (locksAt > event.endsAt) throw badRequest('Picks must close before the event ends');

    let settlesAt: Date | null = null;
    let resolveBy: Date;
    if (resolution === 'DATA') {
      settlesAt = input.settlesAt
        ? new Date(input.settlesAt)
        : new Date(event.endsAt.getTime() + HOUR);
      if (settlesAt <= locksAt) throw badRequest('The result time must be after picks close');
      resolveBy = new Date(settlesAt.getTime() + DAY);
    } else {
      resolveBy = new Date(Math.max(locksAt.getTime(), event.endsAt.getTime()) + 3 * DAY);
    }
    const window = resolveBy.getTime() - locksAt.getTime();
    if (window < MIN_RESOLVE_WINDOW || window > MAX_RESOLVE_WINDOW)
      throw badRequest('The result must be due within 30 days of picks closing');

    const market = await this.prisma.predictionMarket.create({
      data: {
        eventId,
        creatorId: user.id,
        question: input.question,
        template: input.template,
        resolution,
        options: options as unknown as Prisma.InputJsonValue,
        locksAt,
        settlesAt,
        resolveBy,
        minStakeMicro: micro(input.minStakeUsdc),
        maxStakeMicro: micro(input.maxStakeUsdc),
        creatorBps: input.template === 'BEST_CLIP' ? input.creatorSharePct * 100 : 0,
        humanOnly: input.humanOnly,
      },
    });
    // Put it on-chain now; if Arc is slow or down, the worker retries.
    await this.publish(market, chain);
    return this.get(user, market.id);
  }

  /** Creates the market on-chain (PENDING → OPEN). Safe to call repeatedly. */
  private async publish(market: PredictionMarket, chain: PredictionChain): Promise<void> {
    if (market.status !== 'PENDING' || market.chainMarketId || this.busy.has(market.id)) return;
    this.busy.add(market.id);
    try {
      if (market.locksAt.getTime() < Date.now() + MIN) {
        await this.prisma.predictionMarket.update({
          where: { id: market.id },
          data: { status: 'REFUNDING', note: 'Couldn’t open on Arc before picks closed.' },
        });
        return;
      }
      const { marketId, tx } = await chain.createMarket({
        optionCount: (market.options as unknown as StoredOption[]).length,
        locksAt: Math.floor(market.locksAt.getTime() / 1000),
        resolveBy: Math.floor(market.resolveBy.getTime() / 1000),
        minStake: market.minStakeMicro,
        maxStake: market.maxStakeMicro,
        creatorBps: market.creatorBps,
        externalRef: externalRef(market.id),
      });
      await this.prisma.predictionMarket.update({
        where: { id: market.id },
        data: { status: 'OPEN', chainMarketId: marketId, createTx: tx, note: null },
      });
    } catch (err) {
      this.logger.warn(`Publishing prediction ${market.id} failed: ${(err as Error).message}`);
      await this.prisma.predictionMarket.update({
        where: { id: market.id },
        data: { note: 'Setting up on Arc… (retrying)' },
      });
    } finally {
      this.busy.delete(market.id);
    }
  }

  // ─────────── Read ───────────

  async list(user: RequestUser, eventId: string): Promise<PredictionDto[]> {
    const markets = await this.prisma.predictionMarket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { organizerId: true, startsAt: true } } },
    });
    return Promise.all(markets.map((m) => this.toDto(user, m)));
  }

  async get(user: RequestUser, id: string): Promise<PredictionDto> {
    const m = await this.prisma.predictionMarket.findUnique({
      where: { id },
      include: { event: { select: { organizerId: true, startsAt: true } } },
    });
    if (!m) throw notFound('That prediction');
    return this.toDto(user, m);
  }

  private status(m: PredictionMarket): PredictionStatusDto {
    if (m.status === 'OPEN' && m.locksAt.getTime() <= Date.now()) return 'LOCKED';
    return m.status;
  }

  private async toDto(
    user: RequestUser,
    m: PredictionMarket & { event: { organizerId: string; startsAt: Date } },
  ): Promise<PredictionDto> {
    const stored = m.options as unknown as StoredOption[];
    const picks = await this.prisma.predictionPick.groupBy({
      by: ['option'],
      where: { marketId: m.id, status: { in: ['CONFIRMED', 'PAID', 'LOST'] } },
      _sum: { stakeMicro: true },
      _count: { _all: true },
    });
    const totals = new Map(picks.map((p) => [p.option, p]));
    const total = picks.reduce((a, p) => a + (p._sum.stakeMicro ?? 0n), 0n);
    const afterShare = Number(total) * (1 - m.creatorBps / 10_000);
    const watch =
      m.template === 'BEST_CLIP' ? await this.watchByCreator(m, m.event.startsAt) : null;

    const options: PredictionOptionDto[] = stored.map((o, index) => {
      const t = totals.get(index);
      const optTotal = Number(t?._sum.stakeMicro ?? 0n);
      return {
        index,
        label: o.label,
        creatorId: o.creatorId,
        totalMicro: String(t?._sum.stakeMicro ?? 0n),
        pickers: t?._count._all ?? 0,
        multiplier: optTotal > 0 ? Math.round((afterShare / optTotal) * 100) / 100 : null,
        watchSeconds: watch ? Math.round((watch.get(o.creatorId ?? '') ?? 0) / 1000) : null,
      };
    });

    const mine = await this.prisma.predictionPick.findUnique({
      where: { marketId_userId: { marketId: m.id, userId: user.id } },
    });
    const myPick: MyPredictionPickDto | null =
      mine && mine.status !== 'TICKETED'
        ? {
            option: mine.option,
            stakeMicro: mine.stakeMicro.toString(),
            status: mine.status,
            payoutMicro: mine.payoutMicro?.toString() ?? null,
            pickTxUrl: this.explorer(mine.pickTx && `tx/${mine.pickTx}`),
            payoutTxUrl: this.explorer(mine.payoutTx && `tx/${mine.payoutTx}`),
          }
        : null;

    return {
      id: m.id,
      eventId: m.eventId,
      question: m.question,
      template: m.template,
      resolution: m.resolution,
      status: this.status(m),
      options,
      locksAt: m.locksAt.toISOString(),
      settlesAt: m.settlesAt?.toISOString() ?? null,
      resolveBy: m.resolveBy.toISOString(),
      minStakeMicro: m.minStakeMicro.toString(),
      maxStakeMicro: m.maxStakeMicro.toString(),
      creatorSharePct: m.creatorBps / 100,
      humanOnly: m.humanOnly,
      totalMicro: total.toString(),
      pickers: picks.reduce((a, p) => a + p._count._all, 0),
      winningOption: m.winningOption,
      note: m.note,
      contractUrl: this.chain ? this.explorer(`address/${this.chain.contract}`) : null,
      createTxUrl: this.explorer(m.createTx && `tx/${m.createTx}`),
      settleTxUrl: this.explorer(m.settleTx && `tx/${m.settleTx}`),
      chainMarketId: m.chainMarketId,
      myPick,
      canManage: this.canManage(user, m.event.organizerId),
    };
  }

  /**
   * Verified watch time (ms) per creator on their event videos, from server heartbeats only
   * (same rules as reward pools: qualifying, not flagged, not self-views; human-only markets
   * count World ID–verified viewers only), from the event start until the result time.
   */
  private async watchByCreator(m: PredictionMarket, from: Date): Promise<Map<string, number>> {
    const creatorIds = (m.options as unknown as StoredOption[])
      .map((o) => o.creatorId)
      .filter((x): x is string => !!x);
    if (!creatorIds.length) return new Map();
    const until = m.settlesAt && m.settlesAt.getTime() < Date.now() ? m.settlesAt : new Date();
    const rows = await this.prisma.$queryRaw<{ author_id: string; ms: bigint }[]>(Prisma.sql`
      SELECT p.author_id, COALESCE(SUM(h.credited_ms), 0)::bigint AS ms
      FROM posts p
      JOIN watch_sessions s ON s.post_id = p.id
      JOIN watch_heartbeats h ON h.session_id = s.id
      WHERE p.event_id = ${m.eventId}::uuid AND p.type = 'VIDEO' AND p.status = 'PUBLISHED'
        AND p.moderation_status = 'VISIBLE' AND p.deleted_at IS NULL
        AND p.author_id = ANY(${creatorIds}::uuid[])
        AND s.qualifying AND s.status <> 'FLAGGED' AND s.viewer_id <> p.author_id
        AND h.credited_ms > 0 AND h.received_at >= ${from} AND h.received_at < ${until}
        ${
          m.humanOnly
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM users v WHERE v.id = s.viewer_id AND v.human_verified_at IS NOT NULL)`
            : Prisma.empty
        }
      GROUP BY p.author_id`);
    return new Map(rows.map((r) => [r.author_id, Number(r.ms)]));
  }

  async suggestions(user: RequestUser, eventId: string): Promise<PredictionSuggestions> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        artists: { orderBy: { position: 'asc' }, include: { artist: true } },
      },
    });
    if (!event) throw notFound('That event');
    if (!this.canManage(user, event.organizerId))
      throw forbidden('Only the event’s organizer can add predictions');
    const posts = await this.prisma.post.groupBy({
      by: ['authorId'],
      where: {
        eventId,
        deletedAt: null,
        status: 'PUBLISHED',
        authorId: { not: event.organizerId },
      },
      _count: { _all: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: posts.map((p) => p.authorId) }, deletedAt: null },
      select: { id: true, username: true, displayName: true },
    });
    const count = new Map(posts.map((p) => [p.authorId, p._count._all]));
    return {
      lineup: event.artists.map((a) => a.artist.stageName),
      creators: users
        .filter((u) => u.username)
        .map((u) => ({
          id: u.id,
          username: u.username!,
          displayName: u.displayName,
          posts: count.get(u.id) ?? 0,
        }))
        .sort((a, b) => b.posts - a.posts),
    };
  }

  // ─────────── Picks (wallet page) ───────────

  private async openMarket(id: string): Promise<PredictionMarket> {
    const m = await this.prisma.predictionMarket.findUnique({ where: { id } });
    if (!m) throw notFound('That prediction');
    if (m.status !== 'OPEN' || !m.chainMarketId)
      throw conflict(
        m.status === 'PENDING' ? 'This prediction is still being set up' : 'Picks are closed',
      );
    if (m.locksAt.getTime() - LOCK_MARGIN_MS <= Date.now()) throw conflict('Picks are closed');
    return m;
  }

  private checkPick(m: PredictionMarket, option: number, stake: bigint): void {
    if (option >= (m.options as unknown as StoredOption[]).length)
      throw badRequest('That option doesn’t exist');
    if (stake < m.minStakeMicro || stake > m.maxStakeMicro)
      throw badRequest(
        `Stake between ${Number(m.minStakeMicro) / 1e6} and ${Number(m.maxStakeMicro) / 1e6} USDC`,
      );
  }

  /**
   * One pick per human per market, enforced on-chain. The id is a hash of the World ID
   * nullifier when the account is verified (one person, many accounts → one pick), otherwise
   * of the account id.
   */
  private async humanIdFor(userId: string, humanOnly: boolean): Promise<Hex> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        humanVerifiedAt: true,
        humanVerification: { select: { action: true, nullifier: true } },
      },
    });
    if (humanOnly && !u.humanVerifiedAt)
      throw forbidden('This prediction is for verified humans. Verify with World ID first.');
    const v = u.humanVerification;
    return keccak256(
      toHex(v ? `world:${v.action}:${v.nullifier.toFixed()}` : `muso-account:${userId}`),
    );
  }

  async pickLink(user: RequestUser, id: string, input: PickLinkInput): Promise<ArcLink> {
    this.requireChain();
    const m = await this.openMarket(id);
    const stake = micro(input.stakeUsdc);
    this.checkPick(m, input.option, stake);
    await this.humanIdFor(user.id, m.humanOnly);
    const existing = await this.prisma.predictionPick.findUnique({
      where: { marketId_userId: { marketId: id, userId: user.id } },
    });
    if (existing && existing.status !== 'TICKETED') throw conflict('You already picked');
    return this.sessions.createLink(user, 'pick', input.returnUrl, undefined, {
      market: id,
      option: input.option,
      stakeMicro: stake,
    });
  }

  /** Wallet page: signs a pick ticket for the connected (linked) wallet. */
  async ticket(t: string | undefined, address: string): Promise<PickTicketDto> {
    const chain = this.requireChain();
    const token = this.sessions.parse(t, 'pick');
    const user = await this.sessions.userFor(token);
    const m = await this.openMarket(token.m!);
    const stake = BigInt(token.s ?? '0');
    const option = token.o ?? 0;
    this.checkPick(m, option, stake);

    const wallet = getAddress(address);
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { walletAddress: true },
    });
    if (me.walletAddress?.toLowerCase() !== wallet.toLowerCase())
      throw badRequest('Link this wallet to your MUSO account first');

    const humanId = await this.humanIdFor(user.id, m.humanOnly);
    const deadline = Math.floor(
      Math.min(m.locksAt.getTime() - LOCK_MARGIN_MS, Date.now() + TICKET_TTL_MS) / 1000,
    );
    const ticket = await chain.signTicket(m.chainMarketId!, wallet, humanId, deadline);

    const data = {
      wallet: wallet.toLowerCase(),
      option,
      stakeMicro: stake,
      humanId,
      ticketDeadline: new Date(deadline * 1000),
    };
    try {
      const existing = await this.prisma.predictionPick.findUnique({
        where: { marketId_userId: { marketId: m.id, userId: user.id } },
      });
      if (existing && existing.status !== 'TICKETED') throw conflict('You already picked');
      if (existing) await this.prisma.predictionPick.update({ where: { id: existing.id }, data });
      else
        await this.prisma.predictionPick.create({
          data: { ...data, marketId: m.id, userId: user.id },
        });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('This person already picked with another account');
      throw err;
    }

    const label = (m.options as unknown as StoredOption[])[option]!.label;
    return {
      contract: chain.contract,
      usdc: chain.usdc,
      marketId: m.chainMarketId!,
      option,
      optionLabel: label,
      question: m.question,
      stakeMicro: stake.toString(),
      pickData: chain.pickData(m.chainMarketId!, option, stake, humanId, deadline, ticket),
      deadline,
    };
  }

  /** Wallet page: the pick transaction landed. The chain is the source of truth. */
  async confirm(t: string | undefined, txHash: string): Promise<MyPredictionPickDto> {
    const token = this.sessions.parse(t, 'pick');
    const user = await this.sessions.userFor(token);
    const pick = await this.prisma.predictionPick.findUnique({
      where: { marketId_userId: { marketId: token.m!, userId: user.id } },
      include: { market: true },
    });
    if (!pick) throw notFound('That pick');
    const ok = await this.syncPick(
      pick,
      pick.market,
      /^0x[0-9a-fA-F]{64}$/.test(txHash) ? txHash : null,
    );
    if (!ok) throw badRequest('Your pick isn’t on-chain yet. Wait a few seconds and try again.');
    const fresh = await this.prisma.predictionPick.findUniqueOrThrow({ where: { id: pick.id } });
    return {
      option: fresh.option,
      stakeMicro: fresh.stakeMicro.toString(),
      status: fresh.status,
      payoutMicro: null,
      pickTxUrl: this.explorer(fresh.pickTx && `tx/${fresh.pickTx}`),
      payoutTxUrl: null,
    };
  }

  /** TICKETED → CONFIRMED when the chain shows the position. Returns whether it's on-chain. */
  private async syncPick(
    pick: PredictionPick,
    market: PredictionMarket,
    txHash: string | null,
  ): Promise<boolean> {
    if (pick.status !== 'TICKETED') return true;
    const chain = this.requireChain();
    const pos = await chain.positionOf(market.chainMarketId!, getAddress(pick.wallet));
    if (pos.stake === 0n) return false;
    await this.prisma.predictionPick.update({
      where: { id: pick.id },
      data: {
        status: 'CONFIRMED',
        option: pos.option,
        stakeMicro: pos.stake,
        ...(txHash ? { pickTx: txHash } : {}),
      },
    });
    return true;
  }

  // ─────────── Result ───────────

  async settle(user: RequestUser, id: string, option: number): Promise<PredictionDto> {
    const chain = this.requireChain();
    const m = await this.manageable(user, id);
    if (m.resolution !== 'MANUAL')
      throw badRequest('This prediction settles automatically from verified watch time');
    if (m.status !== 'OPEN') throw conflict('This prediction is already closed');
    if (m.locksAt.getTime() > Date.now()) throw badRequest('Wait until picks close');
    if (m.resolveBy.getTime() < Date.now())
      throw badRequest('Too late: everyone can now take their stake back');
    if (option >= (m.options as unknown as StoredOption[]).length)
      throw badRequest('That option doesn’t exist');
    await this.doSettle(m, option, chain);
    return this.get(user, id);
  }

  async cancel(user: RequestUser, id: string): Promise<PredictionDto> {
    const m = await this.manageable(user, id);
    if (m.status !== 'OPEN' && m.status !== 'PENDING')
      throw conflict('This prediction is already closed');
    if (this.busy.has(m.id)) throw conflict('Try again in a moment');
    this.busy.add(m.id);
    try {
      if (m.chainMarketId) await this.requireChain().cancel(m.chainMarketId);
      await this.prisma.predictionMarket.update({
        where: { id: m.id },
        data: { status: 'REFUNDING', note: 'Cancelled by the organizer. Every stake is returned.' },
      });
    } finally {
      this.busy.delete(m.id);
    }
    return this.get(user, id);
  }

  private async manageable(user: RequestUser, id: string): Promise<PredictionMarket> {
    const m = await this.prisma.predictionMarket.findUnique({
      where: { id },
      include: { event: { select: { organizerId: true } } },
    });
    if (!m) throw notFound('That prediction');
    if (!this.canManage(user, m.event.organizerId))
      throw forbidden('Only the event’s organizer can do this');
    return m;
  }

  private async doSettle(
    m: PredictionMarket,
    option: number,
    chain: PredictionChain,
  ): Promise<void> {
    if (this.busy.has(m.id)) throw conflict('Already settling');
    this.busy.add(m.id);
    try {
      // Picks that landed on-chain but weren't reported yet must count before the result.
      await this.syncTicketed(m);
      const opt = (m.options as unknown as StoredOption[])[option]!;
      let creator: Address | null = null;
      if (m.creatorBps > 0 && opt.creatorId) {
        const u = await this.prisma.user.findUnique({
          where: { id: opt.creatorId },
          select: { walletAddress: true },
        });
        creator = u?.walletAddress ? getAddress(u.walletAddress) : null;
      }
      const { tx, status } = await chain.settle(m.chainMarketId!, option, creator);
      await this.prisma.predictionMarket.update({
        where: { id: m.id },
        data: {
          status: status === 'SETTLED' ? 'SETTLED' : 'REFUNDING',
          winningOption: option,
          settleTx: tx,
          settledAt: new Date(),
          note:
            status === 'SETTLED'
              ? null
              : 'Nobody picked the winning option, so every stake is returned.',
        },
      });
    } finally {
      this.busy.delete(m.id);
    }
  }

  private async syncTicketed(m: PredictionMarket): Promise<void> {
    const ticketed = await this.prisma.predictionPick.findMany({
      where: { marketId: m.id, status: 'TICKETED' },
    });
    for (const p of ticketed) await this.syncPick(p, m, null).catch(() => false);
  }

  // ─────────── Worker ───────────

  /** One pass: publish, confirm picks, auto-settle, expire and pay out. Idempotent. */
  async process(now = new Date()): Promise<void> {
    const chain = this.chain;
    if (!chain) return;

    for (const m of await this.prisma.predictionMarket.findMany({
      where: { status: 'PENDING', chainMarketId: null },
      take: 20,
    }))
      await this.publish(m, chain);

    // Picks sent on-chain while the wallet page was closed before it reported back.
    for (const p of await this.prisma.predictionPick.findMany({
      where: {
        status: 'TICKETED',
        ticketDeadline: { gt: new Date(now.getTime() - 10 * MIN) },
        market: { status: 'OPEN' },
      },
      include: { market: true },
      take: 50,
    }))
      await this.syncPick(p, p.market, null).catch(() => false);

    // DATA markets: settle from verified watch time.
    for (const m of await this.prisma.predictionMarket.findMany({
      where: {
        status: 'OPEN',
        resolution: 'DATA',
        settlesAt: { lte: now },
        resolveBy: { gt: now },
      },
      include: { event: { select: { startsAt: true } } },
      take: 20,
    })) {
      try {
        const watch = await this.watchByCreator(m, m.event.startsAt);
        const options = m.options as unknown as StoredOption[];
        let best = -1;
        let bestMs = 0;
        options.forEach((o, i) => {
          const ms = watch.get(o.creatorId ?? '') ?? 0;
          if (ms > bestMs) {
            best = i;
            bestMs = ms;
          }
        });
        if (best < 0) {
          await chain.cancel(m.chainMarketId!);
          await this.prisma.predictionMarket.update({
            where: { id: m.id },
            data: {
              status: 'REFUNDING',
              note: 'No verified watch time on any option, so every stake is returned.',
            },
          });
        } else {
          await this.doSettle(m, best, chain);
        }
      } catch (err) {
        this.logger.warn(`Auto-settling prediction ${m.id} failed: ${(err as Error).message}`);
      }
    }

    // Not settled in time: the contract lets everyone take their stake back.
    await this.prisma.predictionMarket.updateMany({
      where: { status: 'OPEN', resolveBy: { lt: now } },
      data: { status: 'REFUNDING', note: 'Not settled in time, so every stake is returned.' },
    });

    await this.payOut(chain);
  }

  /** Relays claims (winners) and refunds; MUSO pays the gas, USDC goes to the picker. */
  private async payOut(chain: PredictionChain): Promise<void> {
    const picks = await this.prisma.predictionPick.findMany({
      where: { status: 'CONFIRMED', market: { status: { in: ['SETTLED', 'REFUNDING'] } } },
      include: { market: true },
      take: 50,
    });
    for (const p of picks) {
      try {
        const m = p.market;
        const wallet = getAddress(p.wallet);
        if (m.status === 'SETTLED' && p.option !== m.winningOption) {
          await this.prisma.predictionPick.update({
            where: { id: p.id },
            data: { status: 'LOST', payoutMicro: 0n },
          });
          continue;
        }
        const pos = await chain.positionOf(m.chainMarketId!, wallet);
        if (pos.paid) {
          // Someone (e.g. the picker) already relayed it.
          await this.prisma.predictionPick.update({
            where: { id: p.id },
            data: { status: 'PAID' },
          });
          continue;
        }
        const amount = await chain.payoutOf(m.chainMarketId!, wallet);
        if (amount === 0n) continue;
        const tx =
          m.status === 'SETTLED'
            ? await chain.claim(m.chainMarketId!, wallet)
            : await chain.refund(m.chainMarketId!, wallet);
        await this.prisma.predictionPick.update({
          where: { id: p.id },
          data: { status: 'PAID', payoutMicro: amount, payoutTx: tx },
        });
      } catch (err) {
        this.logger.warn(`Prediction payout ${p.id} failed: ${(err as Error).message}`);
      }
    }
  }
}

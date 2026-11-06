import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type RewardPool } from '@muso/database';
import {
  eventStatus,
  type CreateRewardPoolSchema,
  type EventLeaderboards,
  type LeaderboardEntry,
  type RewardPoolDetail,
  type RewardPoolDto,
  type RewardPoolStatusDto,
} from '@muso/shared';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LedgerService, accounts } from '../payments/ledger.service.js';
import { RewardStandings, type Standing } from './reward-standings.service.js';

type CreatePool = z.output<typeof CreateRewardPoolSchema>;
const WEEK = 7 * 86_400_000;

export function poolStatus(
  p: Pick<RewardPool, 'status' | 'startsAt' | 'endsAt'>,
  now = new Date(),
): RewardPoolStatusDto {
  if (p.status !== 'FUNDED') return p.status;
  if (now < p.startsAt) return 'FUNDED';
  if (now < p.endsAt) return 'ACTIVE';
  return 'COMPLETED';
}

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ledger: LedgerService,
    private readonly standings: RewardStandings,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Event organizers (or admins) create pools for their approved events. Funding is a separate step. */
  async create(input: CreatePool, user: RequestUser): Promise<RewardPoolDetail> {
    if (!user.emailVerified) throw forbidden('Verify your email first');
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
    });
    if (!event) throw notFound('That event');
    if (event.organizerId !== user.id && !user.roles.includes('ADMIN'))
      throw forbidden('Only the event’s organizer can create reward pools');
    if (event.reviewStatus !== 'APPROVED') throw badRequest('The event must be approved first');
    const st = eventStatus(event);
    if (st === 'CANCELLED' || st === 'COMPLETED')
      throw badRequest('This event is no longer running');

    const startsAt = input.startsAt ? new Date(input.startsAt) : event.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : new Date(event.endsAt.getTime() + WEEK);
    if (endsAt <= new Date()) throw badRequest('The reward window must end in the future');
    if (endsAt.getTime() - startsAt.getTime() > 60 * 86_400_000)
      throw badRequest('Reward windows can last at most 60 days');

    const pool = await this.prisma.rewardPool.create({
      data: {
        eventId: event.id,
        creatorId: user.id,
        title: input.title,
        sponsorName: input.sponsorName,
        rules: input.rules,
        budgetMinor: input.budgetMinor,
        perVideoCapBps: input.perVideoCapBps,
        minQualifiedViewers: input.minQualifiedViewers,
        startsAt,
        endsAt,
      },
    });
    return this.get(pool.id, user);
  }

  async cancel(id: string, user: RequestUser): Promise<RewardPoolDetail> {
    const pool = await this.prisma.rewardPool.findUnique({ where: { id } });
    if (!pool) throw notFound('That reward pool');
    if (pool.creatorId !== user.id && !user.roles.includes('ADMIN')) throw forbidden();
    // Funded pools hold real (escrowed) money: cancelling them needs refunds (Milestone 7).
    const r = await this.prisma.rewardPool.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
    if (r.count !== 1) throw conflict('Only unfunded pools can be cancelled');
    return this.get(id, user);
  }

  async listForEvent(eventId: string, user: RequestUser): Promise<RewardPoolDto[]> {
    const pools = await this.prisma.rewardPool.findMany({
      where: {
        eventId,
        OR: [{ status: { in: ['FUNDED', 'DISTRIBUTED'] } }, { creatorId: user.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { id: true, title: true } } },
    });
    return Promise.all(pools.map((p) => this.toDto(p, user, null)));
  }

  /** Detail with leaderboard: final allocations once distributed, otherwise a live estimate. */
  async get(id: string, user: RequestUser): Promise<RewardPoolDetail> {
    const pool = await this.prisma.rewardPool.findUnique({
      where: { id },
      include: { event: { select: { id: true, title: true } } },
    });
    if (!pool) throw notFound('That reward pool');
    const canManage = pool.creatorId === user.id || user.roles.includes('ADMIN');
    if ((pool.status === 'DRAFT' || pool.status === 'CANCELLED') && !canManage)
      throw notFound('That reward pool');

    let rows: (Standing & { capped: boolean })[] = [];
    let estimated = false;
    if (pool.status === 'DISTRIBUTED') {
      const allocs = await this.prisma.rewardAllocation.findMany({ where: { poolId: id } });
      rows = allocs
        .map((a) => ({
          postId: a.postId,
          creatorId: a.creatorId,
          qualifiedMs: Number(a.qualifiedMs),
          qualifiedViewers: a.qualifiedViewers,
          eligible: a.qualifiedViewers >= pool.minQualifiedViewers && a.qualifiedMs > 0n,
          shareMinor: a.shareMinor,
          capped: a.capped,
        }))
        .sort((a, b) => b.shareMinor - a.shareMinor || b.qualifiedMs - a.qualifiedMs);
    } else if (pool.status === 'FUNDED' && new Date() >= pool.startsAt) {
      rows = (await this.standings.compute(pool, new Date())).standings;
      estimated = true;
    }

    const leaderboard = await this.toLeaderboard(rows.slice(0, 50));
    const base = await this.toDto(pool, user, rows);
    let stats: RewardPoolDetail['stats'] = null;
    if (canManage) {
      const flagged = await this.prisma.watchSession.count({
        where: {
          status: 'FLAGGED',
          post: { eventId: pool.eventId },
          startedAt: { gte: pool.startsAt, lt: pool.endsAt },
        },
      });
      stats = {
        qualifiedSeconds: Math.round(rows.reduce((a, r) => a + r.qualifiedMs, 0) / 1000),
        qualifiedViewers: rows.reduce((a, r) => a + r.qualifiedViewers, 0),
        eligibleVideos: rows.filter((r) => r.eligible).length,
        flaggedSessions: flagged,
      };
    }
    return { ...base, leaderboard, estimated, stats };
  }

  /** Distributes every pool whose window ended. Safe to run repeatedly / concurrently. */
  async distributeDue(now = new Date()): Promise<number> {
    const due = await this.prisma.rewardPool.findMany({
      where: { status: 'FUNDED', endsAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const p of due) if (await this.distribute(p.id, now)) n++;
    return n;
  }

  /**
   * Final split. Claims FUNDED→DISTRIBUTED inside the same transaction that writes allocations,
   * earnings and the balanced ledger journal, so it happens exactly once.
   */
  async distribute(poolId: string, now = new Date()): Promise<boolean> {
    const pool = await this.prisma.rewardPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.status !== 'FUNDED' || pool.endsAt > now) return false;
    const { standings, unallocated } = await this.standings.compute(pool);
    const holdMs = this.config.get('EARNINGS_HOLD_MINUTES', { infer: true }) * 60_000;

    const done = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.rewardPool.updateMany({
        where: { id: poolId, status: 'FUNDED' },
        data: { status: 'DISTRIBUTED', distributedAt: new Date(), unallocatedMinor: unallocated },
      });
      if (claim.count !== 1) return false;

      await tx.rewardAllocation.createMany({
        data: standings.map((s) => ({
          poolId,
          postId: s.postId,
          creatorId: s.creatorId,
          qualifiedMs: BigInt(s.qualifiedMs),
          qualifiedViewers: s.qualifiedViewers,
          shareMinor: s.shareMinor,
          capped: s.capped,
        })),
      });

      const paid = standings.filter((s) => s.shareMinor > 0);
      const lines: { account: string; amountMinor: number; userId?: string }[] = [];
      for (const s of paid) {
        await tx.earning.create({
          data: {
            creatorId: s.creatorId,
            source: 'WATCH_REWARD',
            rewardPoolId: poolId,
            postId: s.postId,
            grossMinor: s.shareMinor,
            feeMinor: 0,
            netMinor: s.shareMinor,
            currency: pool.currency,
            status: 'PENDING',
            availableAt: new Date(Date.now() + holdMs),
          },
        });
        lines.push({
          account: accounts.creatorPending(s.creatorId),
          amountMinor: s.shareMinor,
          userId: s.creatorId,
        });
      }
      const total = paid.reduce((a, s) => a + s.shareMinor, 0);
      if (total > 0) {
        await this.ledger.post(tx, 'POOL_DISTRIBUTED', pool.currency, [
          { account: accounts.poolEscrow(poolId), amountMinor: -total },
          ...lines,
        ]);
      }
      return true;
    });

    if (done) {
      const creators = [
        ...new Set(standings.filter((s) => s.shareMinor > 0).map((s) => s.creatorId)),
      ];
      await this.notifications.notifyMany(
        creators.map((userId) => ({ userId, type: 'REWARD_EARNED' as const })),
      );
      this.logger.log(
        `Distributed pool ${poolId}: ${standings.filter((s) => s.shareMinor > 0).length} videos, unallocated ${unallocated}`,
      );
    }
    return done;
  }

  /** Verified-data leaderboards for an event (not "who posted most"). */
  async eventLeaderboards(eventId: string): Promise<EventLeaderboards> {
    const watch = await this.prisma.$queryRaw<{ creator_id: string; ms: bigint }[]>(Prisma.sql`
      SELECT p.author_id AS creator_id, SUM(q.qualified_ms)::bigint AS ms
      FROM qualified_watch_time q JOIN posts p ON p.id = q.post_id
      WHERE p.event_id = ${eventId}::uuid AND p.deleted_at IS NULL AND p.moderation_status = 'VISIBLE' AND q.viewer_id <> p.author_id
      GROUP BY p.author_id ORDER BY ms DESC LIMIT 10`);
    const support = await this.prisma.$queryRaw<
      { creator_id: string; supporters: number }[]
    >(Prisma.sql`
      SELECT pi.payee_id AS creator_id, COUNT(DISTINCT pi.payer_id)::int AS supporters
      FROM payment_intents pi JOIN posts p ON p.id = pi.post_id
      WHERE p.event_id = ${eventId}::uuid AND pi.status = 'SUCCEEDED' AND pi.kind IN ('UNLOCK','TIP')
      GROUP BY pi.payee_id ORDER BY supporters DESC LIMIT 10`);
    const loved = await this.prisma.post.findMany({
      where: {
        eventId,
        deletedAt: null,
        status: 'PUBLISHED',
        moderationStatus: 'VISIBLE',
        likeCount: { gt: 0 },
      },
      orderBy: [{ likeCount: 'desc' }, { publishedAt: 'asc' }],
      take: 10,
      include: { author: { select: { displayName: true, username: true } }, media: { take: 1 } },
    });
    const ids = [
      ...new Set([...watch.map((w) => w.creator_id), ...support.map((s) => s.creator_id)]),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, username: true, avatarKey: true },
    });
    const u = new Map(users.map((x) => [x.id, x]));
    const person = (id: string) => ({
      creatorId: id,
      displayName: u.get(id)?.displayName ?? null,
      username: u.get(id)?.username ?? null,
      avatarUrl: this.storage.publicUrl(u.get(id)?.avatarKey),
    });
    return {
      watchTime: watch.map((w) => ({
        ...person(w.creator_id),
        qualifiedSeconds: Math.round(Number(w.ms) / 1000),
      })),
      mostSupported: support.map((s) => ({ ...person(s.creator_id), supporters: s.supporters })),
      mostLoved: await Promise.all(
        loved.map(async (p) => ({
          postId: p.id,
          likes: p.likeCount,
          creatorName: p.author.displayName ?? p.author.username,
          // Paid posts show their blurred preview here, never the real media.
          thumbUrl: await this.storage.privateUrl(
            p.monetizationMode === 'FREE' ? p.media[0]?.thumbKey : (p.media[0]?.previewKey ?? null),
          ),
        })),
      ),
    };
  }

  private async toLeaderboard(
    rows: (Standing & { capped: boolean })[],
  ): Promise<LeaderboardEntry[]> {
    if (!rows.length) return [];
    const posts = await this.prisma.post.findMany({
      where: { id: { in: rows.map((r) => r.postId) } },
      include: {
        author: { select: { id: true, displayName: true, username: true, avatarKey: true } },
        media: { take: 1 },
      },
    });
    const byId = new Map(posts.map((p) => [p.id, p]));
    return Promise.all(
      rows.map(async (r, i) => {
        const p = byId.get(r.postId);
        const m = p?.media[0];
        return {
          rank: i + 1,
          postId: r.postId,
          thumbUrl: await this.storage.privateUrl(
            p?.monetizationMode === 'FREE' ? m?.thumbKey : (m?.previewKey ?? null),
          ),
          creator: {
            id: r.creatorId,
            displayName: p?.author.displayName ?? null,
            username: p?.author.username ?? null,
            avatarUrl: this.storage.publicUrl(p?.author.avatarKey),
          },
          qualifiedSeconds: Math.round(r.qualifiedMs / 1000),
          qualifiedViewers: r.qualifiedViewers,
          shareMinor: r.shareMinor,
          eligible: r.eligible,
          capped: r.capped,
        };
      }),
    );
  }

  private async toDto(
    p: RewardPool & { event: { id: string; title: string } },
    user: RequestUser,
    rows: Standing[] | null,
  ): Promise<RewardPoolDto> {
    const canManage = p.creatorId === user.id || user.roles.includes('ADMIN');
    let allocated = 0;
    if (p.status === 'DISTRIBUTED') allocated = p.budgetMinor - (p.unallocatedMinor ?? 0);
    else if (rows) allocated = rows.reduce((a, r) => a + r.shareMinor, 0);
    return {
      id: p.id,
      event: p.event,
      title: p.title,
      sponsorName: p.sponsorName,
      rules: p.rules,
      budgetMinor: p.budgetMinor,
      currency: p.currency,
      perVideoCapBps: p.perVideoCapBps,
      minQualifiedViewers: p.minQualifiedViewers,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      status: poolStatus(p),
      allocatedMinor: allocated,
      unallocatedMinor: p.unallocatedMinor,
      viewer: {
        canManage,
        canFund:
          canManage && p.status === 'DRAFT' && p.creatorId === user.id && p.endsAt > new Date(),
      },
    };
  }
}

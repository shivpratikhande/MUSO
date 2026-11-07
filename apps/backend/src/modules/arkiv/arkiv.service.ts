import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@muso/database';
import type { ArkivProofDto } from '@muso/shared';
import { addr, dec, key, u64 } from '@arkiv-network/sdk/schema';
import { getAddress, type Address, type Hex } from 'viem';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { RewardsService } from '../rewards/rewards.service.js';
import { ARKIV_GATEWAY, type ArkivCreate, type ArkivGateway } from './arkiv.gateway.js';
import {
  ArkivClips,
  ArkivEvents,
  ArkivReceipts,
  ArkivReports,
  ArkivShares,
} from './arkiv.schemas.js';

const DAY = 86_400_000;
/** Creates per transaction (keeps each batch well inside block limits). */
const BATCH = 20;

/** Arkiv `str` values hold at most 128 bytes: cut on a character boundary. */
export function clip128(s: string, max = 120): string {
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > max) break;
    out += ch;
  }
  return out;
}
const secs = (d: Date) => u64(BigInt(Math.floor(d.getTime() / 1000)));
const money = (minor: number) => dec((minor / 100).toFixed(2));

/**
 * Publishes MUSO's public record to Arkiv and reads it back:
 *  - events (until 30 days after they end) and clips (read-only, handed to the creator's wallet)
 *  - for every distributed pool, a read-only attention report + one share per clip
 *  - a payout receipt for every creator paid in USDC on Arc
 * The app's "Public proof on Arkiv" card reads the report from Arkiv, not from MUSO's database.
 * Idempotent: each row stores its entity key, so a re-run never writes twice.
 */
@Injectable()
export class ArkivService {
  private readonly logger = new Logger(ArkivService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(ARKIV_GATEWAY) private readonly arkiv: ArkivGateway | null,
  ) {}

  get enabled(): boolean {
    return !!this.arkiv;
  }

  /** One sync pass. Each step is independent; a failure is logged and retried next pass. */
  async sync(now = new Date()): Promise<Record<string, number>> {
    const done: Record<string, number> = {};
    if (!this.arkiv || this.running) return done;
    this.running = true;
    try {
      for (const [name, step] of [
        ['events', () => this.publishEvents(now)],
        ['clips', () => this.publishClips()],
        ['handovers', () => this.handOverClips()],
        ['removed', () => this.removeClips()],
        ['reports', () => this.publishReports()],
        ['receipts', () => this.publishReceipts()],
      ] as const) {
        try {
          const n = await step();
          if (n) done[name] = n;
        } catch (err) {
          this.logger.warn(`Arkiv ${name} failed: ${(err as Error).message}`);
        }
      }
      if (Object.keys(done).length) this.logger.log(`Arkiv sync: ${JSON.stringify(done)}`);
    } finally {
      this.running = false;
    }
    return done;
  }

  private async createAll(
    rows: { id: string; create: ArkivCreate }[],
    save: (id: string, key: string) => Promise<unknown>,
  ): Promise<number> {
    let n = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { createdEntities } = await this.arkiv!.execute({
        creates: chunk.map((r) => r.create),
      });
      for (const [j, r] of chunk.entries()) {
        const k = createdEntities[j];
        if (k) {
          await save(r.id, k);
          n++;
        }
      }
    }
    return n;
  }

  private async publishEvents(now: Date): Promise<number> {
    const events = await this.prisma.event.findMany({
      where: {
        reviewStatus: 'APPROVED',
        deletedAt: null,
        arkivKey: null,
        endsAt: { gt: new Date(now.getTime() - 25 * DAY) },
      },
      include: {
        artists: {
          include: { artist: { select: { stageName: true } } },
          orderBy: { position: 'asc' },
        },
      },
      take: 100,
    });
    return this.createAll(
      events.map((e) => ({
        id: e.id,
        create: {
          schema: ArkivEvents,
          lifetime: { kind: 'until', date: new Date(e.endsAt.getTime() + 30 * DAY) },
          values: {
            eventId: e.id,
            title: clip128(e.title),
            city: clip128(e.city.toLowerCase(), 64),
            country: e.country.toLowerCase(),
            startsAt: secs(e.startsAt),
            endsAt: secs(e.endsAt),
            ...(e.artists.length
              ? { artists: clip128(e.artists.map((a) => a.artist.stageName).join(', ')) }
              : {}),
          },
        },
      })),
      (id, k) => this.prisma.event.update({ where: { id }, data: { arkivKey: k } }),
    );
  }

  private async publishClips(): Promise<number> {
    const posts = await this.prisma.post.findMany({
      where: {
        arkivKey: null,
        status: 'PUBLISHED',
        moderationStatus: 'VISIBLE',
        deletedAt: null,
        event: { arkivKey: { not: null } },
      },
      include: {
        event: { select: { arkivKey: true } },
        author: { select: { displayName: true, username: true } },
      },
      orderBy: { publishedAt: 'asc' },
      take: 100,
    });
    return this.createAll(
      posts.map((p) => ({
        id: p.id,
        create: {
          schema: ArkivClips,
          lifetime: { kind: 'max' },
          readonly: true,
          values: {
            postId: p.id,
            event: key(p.event!.arkivKey as Hex),
            kind: p.type.toLowerCase(),
            license: p.monetizationMode === 'FREE' ? 'free' : 'paid',
            priceMinor: p.priceMinor ?? 0,
            currency: p.currency,
            creatorName: clip128(p.author.displayName ?? p.author.username ?? 'creator', 64),
            postedAt: secs(p.publishedAt ?? p.createdAt),
          },
        },
      })),
      (id, k) => this.prisma.post.update({ where: { id }, data: { arkivKey: k } }),
    );
  }

  /** A clip's public record belongs to its creator once they link a wallet. */
  private async handOverClips(): Promise<number> {
    const posts = await this.prisma.post.findMany({
      where: {
        arkivKey: { not: null },
        arkivOwner: null,
        author: { walletAddress: { not: null } },
      },
      select: { id: true, arkivKey: true, author: { select: { walletAddress: true } } },
      take: BATCH,
    });
    if (!posts.length) return 0;
    await this.arkiv!.execute({
      ownershipChanges: posts.map((p) => ({
        entityKey: p.arkivKey as Hex,
        newOwner: getAddress(p.author.walletAddress!),
      })),
    });
    for (const p of posts)
      await this.prisma.post.update({
        where: { id: p.id },
        data: { arkivOwner: p.author.walletAddress!.toLowerCase() },
      });
    return posts.length;
  }

  /** Clips taken down or deleted leave Arkiv too (while MUSO still owns the record). */
  private async removeClips(): Promise<number> {
    const posts = await this.prisma.post.findMany({
      where: {
        arkivKey: { not: null },
        arkivOwner: null,
        OR: [{ deletedAt: { not: null } }, { moderationStatus: { not: 'VISIBLE' } }],
      },
      select: { id: true, arkivKey: true },
      take: BATCH,
    });
    if (!posts.length) return 0;
    await this.arkiv!.execute({ deletes: posts.map((p) => ({ entityKey: p.arkivKey as Hex })) });
    await this.prisma.post.updateMany({
      where: { id: { in: posts.map((p) => p.id) } },
      data: { arkivKey: null },
    });
    return posts.length;
  }

  /** Distinct viewers whose time counted (verified humans only, in human-only pools). */
  private async countedViewers(pool: {
    eventId: string;
    creatorId: string;
    startsAt: Date;
    endsAt: Date;
    humanOnly: boolean;
  }): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT s.viewer_id)::int AS n
      FROM watch_heartbeats h
      JOIN watch_sessions s ON s.id = h.session_id
      JOIN posts p ON p.id = s.post_id
      WHERE p.event_id = ${pool.eventId}::uuid AND p.type = 'VIDEO' AND p.author_id <> ${pool.creatorId}::uuid
        AND s.qualifying AND s.status <> 'FLAGGED' AND h.credited_ms > 0 AND s.viewer_id <> p.author_id
        AND h.received_at >= ${pool.startsAt} AND h.received_at < ${pool.endsAt}
        ${
          pool.humanOnly && this.config.get('WORLD_ID_ENABLED', { infer: true })
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM users v WHERE v.id = s.viewer_id AND v.human_verified_at IS NOT NULL)`
            : Prisma.empty
        }`);
    return row?.n ?? 0;
  }

  /** Final reports are read-only: once published, MUSO can't change the numbers. */
  private async publishReports(): Promise<number> {
    const pools = await this.prisma.rewardPool.findMany({
      where: { status: 'DISTRIBUTED', OR: [{ arkivReportKey: null }, { arkivSharesAt: null }] },
      include: { event: { select: { id: true, title: true, arkivKey: true } } },
      take: 5,
    });
    let n = 0;
    for (const pool of pools) {
      const allocs = await this.prisma.rewardAllocation.findMany({
        where: { poolId: pool.id },
        include: { post: { select: { arkivKey: true } } },
        orderBy: [{ shareMinor: 'desc' }, { qualifiedMs: 'desc' }],
      });
      let reportKey = pool.arkivReportKey;
      if (!reportKey) {
        const paid = allocs.reduce((a, r) => a + r.shareMinor, 0);
        const arcContract = this.config.get('ARC_REWARD_CAMPAIGNS_ADDRESS', { infer: true });
        const { createdEntities } = await this.arkiv!.execute({
          creates: [
            {
              schema: ArkivReports,
              lifetime: { kind: 'max' },
              readonly: true,
              values: {
                poolId: pool.id,
                ...(pool.event.arkivKey ? { event: key(pool.event.arkivKey as Hex) } : {}),
                eventId: pool.eventId,
                title: clip128(`${pool.title} · ${pool.event.title}`),
                sponsor: clip128(pool.sponsorName, 64),
                currency: pool.currency,
                budget: money(pool.budgetMinor),
                paid: money(paid),
                verifiedViewers: await this.countedViewers(pool),
                watchSeconds: u64(
                  BigInt(Math.round(allocs.reduce((a, r) => a + Number(r.qualifiedMs), 0) / 1000)),
                ),
                clips: allocs.filter((r) => r.shareMinor > 0).length,
                humanOnly: pool.humanOnly && this.config.get('WORLD_ID_ENABLED', { infer: true }),
                ...(pool.arcCampaignId ? { arcCampaign: pool.arcCampaignId } : {}),
                ...(pool.arcCampaignId && arcContract
                  ? { arcContract: addr(getAddress(arcContract)) }
                  : {}),
                windowStart: secs(pool.startsAt),
                windowEnd: secs(pool.endsAt),
              },
            },
          ],
        });
        reportKey = createdEntities[0] ?? null;
        if (!reportKey) continue;
        await this.prisma.rewardPool.update({
          where: { id: pool.id },
          data: { arkivReportKey: reportKey },
        });
      }
      await this.createAll(
        allocs.map((r, i) => ({
          id: r.id,
          create: {
            schema: ArkivShares,
            lifetime: { kind: 'max' },
            readonly: true,
            values: {
              report: key(reportKey as Hex),
              poolId: pool.id,
              postId: r.postId,
              ...(r.post.arkivKey ? { clip: key(r.post.arkivKey as Hex) } : {}),
              rank: i + 1,
              watchSeconds: u64(BigInt(Math.round(Number(r.qualifiedMs) / 1000))),
              viewers: r.qualifiedViewers,
              share: money(r.shareMinor),
              capped: r.capped,
            },
          },
        })),
        async () => undefined,
      );
      await this.prisma.rewardPool.update({
        where: { id: pool.id },
        data: { arkivSharesAt: new Date() },
      });
      n++;
    }
    return n;
  }

  private async publishReceipts(): Promise<number> {
    const payouts = await this.prisma.arcPayout.findMany({
      where: { status: 'CLAIMED', claimTx: { not: null }, arkivKey: null, wallet: { not: null } },
      include: { pool: { select: { arkivReportKey: true, arcCampaignId: true } } },
      take: 100,
    });
    return this.createAll(
      payouts.map((p) => ({
        id: p.id,
        create: {
          schema: ArkivReceipts,
          lifetime: { kind: 'max' },
          readonly: true,
          values: {
            poolId: p.poolId,
            ...(p.pool.arkivReportKey ? { report: key(p.pool.arkivReportKey as Hex) } : {}),
            creator: addr(getAddress(p.wallet!)),
            amount: dec((Number(p.amountMicro) / 1e6).toFixed(6)),
            arcCampaign: p.pool.arcCampaignId ?? 0,
            claimTx: p.claimTx!,
            arcChainId: this.config.get('ARC_CHAIN_ID', { infer: true }),
          },
        },
      })),
      (id, k) => this.prisma.arcPayout.update({ where: { id }, data: { arkivKey: k } }),
    );
  }

  /** The pool's attention report, read from Arkiv (not from MUSO's database). */
  async proof(poolId: string, user: RequestUser): Promise<ArkivProofDto> {
    await this.rewards.get(poolId, user); // same visibility rules as the pool itself
    if (!this.arkiv)
      return {
        enabled: false,
        writer: null,
        writerUrl: null,
        query: null,
        report: null,
        shares: [],
        receipts: [],
      };
    const a = this.arkiv;
    const entityUrl = (k: string) => `${a.explorerUrl}/entity/${k}`;
    const [report] = await a.reportsForPool(poolId);
    const shares = report ? await a.sharesForReport(report.$key) : [];
    const receipts = await a.receiptsForPool(poolId);
    const arcExplorer = this.config.get('ARC_EXPLORER_URL', { infer: true }).replace(/\/$/, '');
    return {
      enabled: true,
      writer: a.writer,
      writerUrl: `${a.explorerUrl}/address/${a.writer}`,
      query: a.describeReportQuery(poolId),
      report: report
        ? {
            key: report.$key,
            url: entityUrl(report.$key),
            expiresAtBlock: report.$expiresAt,
            currency: String(report['currency']),
            budget: String(report['budget']),
            paid: String(report['paid']),
            verifiedViewers: Number(report['verifiedViewers']),
            watchSeconds: Number(report['watchSeconds']),
            clips: Number(report['clips']),
            humanOnly: Boolean(report['humanOnly']),
            arcCampaign: report['arcCampaign'] === null ? null : Number(report['arcCampaign']),
          }
        : null,
      shares: shares
        .map((s) => ({
          key: s.$key,
          url: entityUrl(s.$key),
          postId: String(s['postId']),
          rank: Number(s['rank']),
          watchSeconds: Number(s['watchSeconds']),
          viewers: Number(s['viewers']),
          share: String(s['share']),
        }))
        .sort((x, y) => x.rank - y.rank),
      receipts: receipts.map((r) => ({
        key: r.$key,
        url: entityUrl(r.$key),
        creator: String(r['creator']) as Address,
        amount: String(r['amount']),
        claimTxUrl: `${arcExplorer}/tx/${String(r['claimTx'])}`,
      })),
    };
  }
}

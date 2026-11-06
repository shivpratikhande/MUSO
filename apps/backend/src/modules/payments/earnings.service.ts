import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EarningDto, EarningsSummary, EarningSourceDto, EarningStatusDto } from '@muso/shared';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { RewardStandings } from '../rewards/reward-standings.service.js';
import { LedgerService, accounts } from './ledger.service.js';

const STATUSES: EarningStatusDto[] = [
  'ESTIMATED',
  'PENDING',
  'CONFIRMED',
  'AVAILABLE',
  'PAID',
  'REVERSED',
];
const SOURCES: EarningSourceDto[] = ['TIP', 'PHOTO_SALE', 'VIDEO_SALE', 'WATCH_REWARD'];

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService<Env, true>,
    private readonly standings: RewardStandings,
  ) {}

  /** Moves earnings whose hold window has passed from PENDING to AVAILABLE (idempotent). */
  async releaseDue(now = new Date()): Promise<number> {
    const due = await this.prisma.earning.findMany({
      where: { status: 'PENDING', availableAt: { lte: now } },
      take: 500,
    });
    let released = 0;
    for (const e of due) {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.earning.updateMany({
          where: { id: e.id, status: 'PENDING' },
          data: { status: 'AVAILABLE' },
        });
        if (claim.count !== 1) return;
        await this.ledger.post(
          tx,
          'EARNING_RELEASED',
          e.currency,
          [
            {
              account: accounts.creatorPending(e.creatorId),
              amountMinor: -e.netMinor,
              userId: e.creatorId,
            },
            {
              account: accounts.creatorAvailable(e.creatorId),
              amountMinor: e.netMinor,
              userId: e.creatorId,
            },
          ],
          { earningId: e.id, paymentId: e.paymentId ?? undefined },
        );
        released++;
      });
    }
    if (released) this.logger.log(`Released ${released} earnings`);
    return released;
  }

  async summary(creatorId: string): Promise<EarningsSummary> {
    const [byStatus, bySource, totals, top, recent] = await Promise.all([
      this.prisma.earning.groupBy({
        by: ['status'],
        where: { creatorId },
        _sum: { netMinor: true },
      }),
      this.prisma.earning.groupBy({
        by: ['source'],
        where: { creatorId, status: { not: 'REVERSED' } },
        _sum: { grossMinor: true },
      }),
      this.prisma.earning.aggregate({
        where: { creatorId, status: { notIn: ['REVERSED', 'ESTIMATED'] } },
        _sum: { grossMinor: true, feeMinor: true, netMinor: true },
      }),
      this.prisma.earning.groupBy({
        by: ['postId'],
        where: { creatorId, postId: { not: null }, status: { notIn: ['REVERSED', 'ESTIMATED'] } },
        _sum: { netMinor: true },
        _count: { _all: true },
        orderBy: { _sum: { netMinor: 'desc' } },
        take: 5,
      }),
      this.list(creatorId, 20),
    ]);
    const topMedia = await this.prisma.postMedia.findMany({
      where: { postId: { in: top.map((t) => t.postId!) }, position: 0 },
      select: { postId: true, thumbKey: true },
    });
    const thumbs = new Map(topMedia.map((m) => [m.postId, m.thumbKey]));
    // Live, non-binding estimate from running reward pools (never stored, never withdrawable).
    const estimated = await this.standings.estimatedForCreator(creatorId);
    return {
      currency: 'INR',
      byStatus: Object.fromEntries(
        STATUSES.map((s) => [
          s,
          (byStatus.find((r) => r.status === s)?._sum.netMinor ?? 0) +
            (s === 'ESTIMATED' ? estimated : 0),
        ]),
      ) as EarningsSummary['byStatus'],
      bySource: Object.fromEntries(
        SOURCES.map((s) => [s, bySource.find((r) => r.source === s)?._sum.grossMinor ?? 0]),
      ) as EarningsSummary['bySource'],
      grossMinor: totals._sum.grossMinor ?? 0,
      feesMinor: totals._sum.feeMinor ?? 0,
      netMinor: totals._sum.netMinor ?? 0,
      topPosts: await Promise.all(
        top.map(async (t) => ({
          postId: t.postId!,
          netMinor: t._sum.netMinor ?? 0,
          count: t._count._all,
          thumbUrl: await this.storage.privateUrl(thumbs.get(t.postId!)),
        })),
      ),
      recent,
      holdHours:
        Math.round((this.config.get('EARNINGS_HOLD_MINUTES', { infer: true }) / 60) * 10) / 10,
    };
  }

  async list(creatorId: string, take: number): Promise<EarningDto[]> {
    const rows = await this.prisma.earning.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        post: { select: { id: true, media: { select: { thumbKey: true }, take: 1 } } },
        payment: { select: { payer: { select: { displayName: true, username: true } } } },
      },
    });
    return Promise.all(
      rows.map(async (e) => ({
        id: e.id,
        source: e.source,
        status: e.status,
        grossMinor: e.grossMinor,
        feeMinor: e.feeMinor,
        netMinor: e.netMinor,
        availableAt: e.availableAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        post: e.post
          ? { id: e.post.id, thumbUrl: await this.storage.privateUrl(e.post.media[0]?.thumbKey) }
          : null,
        from: e.payment?.payer ?? null,
      })),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, type RewardPool } from '@muso/database';
import { splitProportionally } from '@muso/shared';
import { PrismaService } from '../../database/prisma.service.js';

export interface Standing {
  postId: string;
  creatorId: string;
  qualifiedMs: number;
  qualifiedViewers: number;
  eligible: boolean;
  /** Human-only pool and the creator isn't World ID–verified yet (earns nothing). */
  needsHuman: boolean;
  shareMinor: number;
  capped: boolean;
}

/**
 * Computes a pool's standings from server-recorded heartbeats only:
 *  - eligible videos: published, visible, tagged to the pool's event, not posted by the funder
 *  - per (video, viewer): credited time inside the pool window, capped at the video length
 *  - sessions that were flagged or never qualified are excluded entirely
 *  - videos below the minimum number of distinct qualified viewers earn nothing
 *  - in human-only pools, only World ID–verified viewers count, and unverified creators earn nothing
 * Then splits the budget proportionally with the per-video cap (exact paise).
 */
@Injectable()
export class RewardStandings {
  constructor(private readonly prisma: PrismaService) {}

  async compute(
    pool: RewardPool,
    until: Date = pool.endsAt,
  ): Promise<{ standings: Standing[]; unallocated: number }> {
    const end = until < pool.endsAt ? until : pool.endsAt;
    const rows = await this.prisma.$queryRaw<
      {
        post_id: string;
        author_id: string;
        human: boolean;
        qualified_ms: bigint;
        viewers: number;
      }[]
    >(Prisma.sql`
      WITH eligible AS (
        SELECT p.id AS post_id, p.author_id, (u.human_verified_at IS NOT NULL) AS human,
               COALESCE(m.duration_ms, 0) AS duration_ms
        FROM posts p JOIN post_media m ON m.post_id = p.id AND m.position = 0
        JOIN users u ON u.id = p.author_id
        WHERE p.event_id = ${pool.eventId}::uuid AND p.type = 'VIDEO' AND p.status = 'PUBLISHED'
          AND p.moderation_status = 'VISIBLE' AND p.deleted_at IS NULL AND p.author_id <> ${pool.creatorId}::uuid
      ),
      per_viewer AS (
        SELECT s.post_id, s.viewer_id, LEAST(SUM(h.credited_ms), MAX(e.duration_ms)) AS ms
        FROM watch_heartbeats h
        JOIN watch_sessions s ON s.id = h.session_id
        JOIN eligible e ON e.post_id = s.post_id
        WHERE s.qualifying AND s.status <> 'FLAGGED' AND h.credited_ms > 0
          AND h.received_at >= ${pool.startsAt} AND h.received_at < ${end}
          AND s.viewer_id <> e.author_id
          ${
            // Human-only pools pay for verified human attention: only World ID–verified viewers count.
            pool.humanOnly
              ? Prisma.sql`AND EXISTS (SELECT 1 FROM users v WHERE v.id = s.viewer_id AND v.human_verified_at IS NOT NULL)`
              : Prisma.empty
          }
        GROUP BY s.post_id, s.viewer_id
      )
      SELECT e.post_id, e.author_id, e.human, COALESCE(SUM(pv.ms), 0)::bigint AS qualified_ms, COUNT(pv.viewer_id)::int AS viewers
      FROM eligible e LEFT JOIN per_viewer pv ON pv.post_id = e.post_id AND pv.ms > 0
      GROUP BY e.post_id, e.author_id, e.human`);

    const items = rows.map((r) => {
      const qualifiedMs = Number(r.qualified_ms);
      const needsHuman = pool.humanOnly && !r.human;
      const eligible = r.viewers >= pool.minQualifiedViewers && qualifiedMs > 0 && !needsHuman;
      return {
        needsHuman,
        postId: r.post_id,
        creatorId: r.author_id,
        qualifiedMs,
        qualifiedViewers: r.viewers,
        eligible,
      };
    });
    const cap = Math.floor((pool.budgetMinor * pool.perVideoCapBps) / 10_000);
    const split = splitProportionally(
      items.filter((i) => i.eligible).map((i) => ({ id: i.postId, weight: i.qualifiedMs })),
      pool.budgetMinor,
      cap,
    );
    const standings = items
      .map((i) => ({
        ...i,
        shareMinor: split.shares.get(i.postId) ?? 0,
        capped: split.capped.has(i.postId),
      }))
      .sort(
        (a, b) =>
          b.shareMinor - a.shareMinor ||
          b.qualifiedMs - a.qualifiedMs ||
          (a.postId < b.postId ? -1 : 1),
      );
    return { standings, unallocated: split.unallocated };
  }

  /** Sum of a creator's current estimated shares across running/completed, undistributed pools. */
  async estimatedForCreator(creatorId: string): Promise<number> {
    const now = new Date();
    const pools = await this.prisma.rewardPool.findMany({
      where: {
        status: 'FUNDED',
        // INR earnings only; Arc pools pay USDC on-chain and are shown on the pool itself.
        currency: 'INR',
        startsAt: { lte: now },
        event: { posts: { some: { authorId: creatorId, type: 'VIDEO', deletedAt: null } } },
      },
    });
    let total = 0;
    for (const pool of pools) {
      const { standings } = await this.compute(pool, now);
      total += standings
        .filter((s) => s.creatorId === creatorId)
        .reduce((a, s) => a + s.shareMinor, 0);
    }
    return total;
  }
}

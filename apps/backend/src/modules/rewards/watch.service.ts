import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HEARTBEAT_INTERVAL_MS,
  type HeartbeatInput,
  type StartWatchInput,
  type WatchSessionDto,
} from '@muso/shared';
import { createHash } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { canViewFullMedia } from '../posts/post-mapper.service.js';
import { PostsService } from '../posts/posts.service.js';

/** Anti-abuse thresholds (server-side; clients never send totals). */
export const WATCH_RULES = {
  /** Beats closer than this credit nothing and count as a strike. */
  minBeatMs: Math.round(HEARTBEAT_INTERVAL_MS * 0.6),
  /** One beat can never credit more than this, however long the gap. */
  maxCreditPerBeatMs: Math.round(HEARTBEAT_INTERVAL_MS * 1.5),
  /** Gaps longer than this start a new segment (no credit for the gap). */
  staleGapMs: 30_000,
  /** Strikes before the whole session is flagged and its credit reversed. */
  maxStrikes: 3,
  /** Accounts seen on one device in 24h before the device stops qualifying. */
  maxAccountsPerDevice: 3,
  /** Distinct accounts from one network on one video within 10 minutes before flagging. */
  maxViewersPerIpPerVideo: 5,
  /** Per-viewer daily qualified watch time across all videos. */
  dailyCapMs: 4 * 3_600_000,
};

@Injectable()
export class WatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(value: string): string {
    return createHash('sha256')
      .update(`${this.config.get('PAYMENTS_SIGNING_SECRET', { infer: true })}:${value}`)
      .digest('hex');
  }

  async start(
    input: StartWatchInput,
    viewer: RequestUser,
    ip: string | undefined,
  ): Promise<WatchSessionDto> {
    const post = await this.posts.loadVisible(input.postId, viewer);
    if (post.type !== 'VIDEO' || post.status !== 'PUBLISHED')
      throw conflict('Only published videos are tracked');
    const purchased = await this.prisma.contentEntitlement.findUnique({
      where: { userId_postId: { userId: viewer.id, postId: post.id } },
    });
    if (!canViewFullMedia(post, viewer, !!purchased))
      throw forbidden('Unlock this video to watch it');

    const deviceHash = this.hash(`device:${input.deviceId}`);
    const ipHash = ip ? this.hash(`ip:${ip}`) : null;

    // One crediting session at a time: playing several videos at once is a bot pattern.
    await this.prisma.watchSession.updateMany({
      where: { viewerId: viewer.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    let reason: string | null = null;
    if (post.authorId === viewer.id) reason = 'own_video';
    else if (!viewer.emailVerified) reason = 'unverified';
    else {
      const accounts = await this.prisma.watchSession.findMany({
        where: { deviceHash, startedAt: { gt: new Date(Date.now() - 86_400_000) } },
        distinct: ['viewerId'],
        select: { viewerId: true },
      });
      const ids = new Set([...accounts.map((a) => a.viewerId), viewer.id]);
      if (ids.size > WATCH_RULES.maxAccountsPerDevice) reason = 'shared_device';
    }

    const session = await this.prisma.watchSession.create({
      data: {
        postId: post.id,
        viewerId: viewer.id,
        deviceHash,
        ipHash,
        qualifying: reason === null,
        disqualifyReason: reason,
        lastBeatAt: new Date(),
        startedAt: new Date(),
      },
    });
    return {
      sessionId: session.id,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      qualifying: session.qualifying,
    };
  }

  /**
   * Credits server-measured time since the previous beat, within strict limits. The client's
   * reported position is only used as a plausibility check, never as a source of credit.
   */
  async heartbeat(
    sessionId: string,
    input: HeartbeatInput,
    viewer: RequestUser,
  ): Promise<{ status: string }> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.watchSession.findUnique({
        where: { id: sessionId },
        include: { post: { include: { media: { take: 1 } } } },
      });
      if (!s || s.viewerId !== viewer.id) throw notFound('That session');
      if (s.status !== 'ACTIVE') return { status: s.status };

      const elapsed = now.getTime() - s.lastBeatAt.getTime();
      const durationMs = s.post.media[0]?.durationMs ?? 0;
      const delta = input.positionMs - s.lastPositionMs;
      let credit = 0;
      let strike = false;
      let note: string | null = null;

      if (elapsed < WATCH_RULES.minBeatMs) {
        note = 'too_fast';
        strike = true;
      } else if (elapsed > WATCH_RULES.staleGapMs) {
        note = 'gap';
      } else if (!input.foreground) {
        note = 'background';
      } else if (!input.playing) {
        note = 'paused';
      } else if (delta > elapsed * 1.5 + 1_000) {
        note = 'position_jump';
        strike = true;
      } else if (delta < 0) {
        // Looped back to the start: plausible only if it restarted recently.
        if (input.positionMs <= elapsed + 1_000)
          credit = Math.min(elapsed, WATCH_RULES.maxCreditPerBeatMs, input.positionMs);
        else note = 'seek_back';
      } else {
        credit = Math.min(elapsed, WATCH_RULES.maxCreditPerBeatMs, delta);
      }

      const strikes = s.strikes + (strike ? 1 : 0);
      let status: 'ACTIVE' | 'FLAGGED' = 'ACTIVE';
      let flagReason: string | null = null;

      if (strikes >= WATCH_RULES.maxStrikes) {
        status = 'FLAGGED';
        flagReason = 'timing_anomalies';
      } else if (s.qualifying && s.ipHash) {
        const crowd = await tx.watchSession.findMany({
          where: {
            postId: s.postId,
            ipHash: s.ipHash,
            startedAt: { gt: new Date(now.getTime() - 600_000) },
          },
          distinct: ['viewerId'],
          select: { viewerId: true },
        });
        if (crowd.length > WATCH_RULES.maxViewersPerIpPerVideo) {
          status = 'FLAGGED';
          flagReason = 'network_cluster';
        }
      }

      // Qualifying credit: per (video, viewer) capped at one full view; daily cap per viewer.
      let qualifiedAdd = 0;
      if (status === 'ACTIVE' && s.qualifying && credit > 0) {
        const today = new Date(now);
        today.setUTCHours(0, 0, 0, 0);
        const used = await tx.watchHeartbeat.aggregate({
          where: { receivedAt: { gte: today }, session: { viewerId: viewer.id, qualifying: true } },
          _sum: { creditedMs: true },
        });
        const dailyLeft = Math.max(0, WATCH_RULES.dailyCapMs - (used._sum.creditedMs ?? 0));
        const q = await tx.qualifiedWatchTime.findUnique({
          where: { postId_viewerId: { postId: s.postId, viewerId: viewer.id } },
        });
        const perVideoLeft = Math.max(0, durationMs - (q?.qualifiedMs ?? 0));
        qualifiedAdd = Math.min(credit, dailyLeft, perVideoLeft);
        if (qualifiedAdd < credit) note = note ?? (dailyLeft < credit ? 'daily_cap' : 'view_cap');
        if (qualifiedAdd > 0) {
          await tx.qualifiedWatchTime.upsert({
            where: { postId_viewerId: { postId: s.postId, viewerId: viewer.id } },
            create: { postId: s.postId, viewerId: viewer.id, qualifiedMs: qualifiedAdd },
            update: { qualifiedMs: { increment: qualifiedAdd } },
          });
        }
      }
      const recorded = s.qualifying ? qualifiedAdd : status === 'ACTIVE' ? credit : 0;

      await tx.watchHeartbeat.create({
        data: {
          sessionId: s.id,
          receivedAt: now,
          positionMs: input.positionMs,
          playing: input.playing,
          foreground: input.foreground,
          creditedMs: recorded,
          note,
        },
      });

      if (status === 'FLAGGED') {
        // Reverse everything this session credited toward the per-video cap.
        if (s.qualifying && s.creditedMs > 0) {
          await tx.$executeRaw`UPDATE qualified_watch_time SET qualified_ms = GREATEST(qualified_ms - ${s.creditedMs}, 0), updated_at = now()
            WHERE post_id = ${s.postId}::uuid AND viewer_id = ${viewer.id}::uuid`;
        }
      }
      await tx.watchSession.update({
        where: { id: s.id },
        data: {
          lastBeatAt: now,
          lastPositionMs: input.positionMs,
          creditedMs: { increment: recorded },
          strikes,
          status,
          flagReason,
          ...(status === 'FLAGGED' ? { endedAt: now } : {}),
        },
      });
      return { status };
    });
  }

  async end(sessionId: string, viewer: RequestUser): Promise<void> {
    await this.prisma.watchSession.updateMany({
      where: { id: sessionId, viewerId: viewer.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  }
}

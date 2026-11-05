import { Injectable } from '@nestjs/common';
import { Prisma } from '@muso/database';
import { eventStatus, type PostDto } from '@muso/shared';
import { toUserSummary, userSummarySelect } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';

export const postInclude = {
  author: { select: userSummarySelect },
  event: { select: { id: true, title: true, startsAt: true, endsAt: true, cancelledAt: true } },
  artists: { select: { artist: { select: { id: true, stageName: true } } } },
  media: { orderBy: { position: 'asc' }, take: 1 },
} as const satisfies Prisma.PostInclude;

export type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

/** Turns post rows into DTOs with signed media URLs and per-viewer flags (batched). */
@Injectable()
export class PostMapper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async toDtos(rows: PostRow[], viewer: RequestUser): Promise<PostDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const authorIds = [...new Set(rows.map((r) => r.authorId))];
    const [likes, saves, follows] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId: viewer.id, postId: { in: ids } },
        select: { postId: true },
      }),
      this.prisma.savedPost.findMany({
        where: { userId: viewer.id, postId: { in: ids } },
        select: { postId: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: viewer.id, followeeId: { in: authorIds } },
        select: { followeeId: true },
      }),
    ]);
    const liked = new Set(likes.map((l) => l.postId));
    const saved = new Set(saves.map((s) => s.postId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const isAdmin = viewer.roles.includes('ADMIN');

    return Promise.all(
      rows.map(async (r): Promise<PostDto> => {
        const m = r.media[0];
        const isAuthor = r.authorId === viewer.id;
        return {
          id: r.id,
          type: r.type,
          status: r.status,
          failureReason: isAuthor ? r.failureReason : null,
          hidden: r.moderationStatus === 'HIDDEN',
          caption: r.caption,
          hashtags: r.hashtags,
          author: toUserSummary(r.author, this.storage),
          event: r.event
            ? { id: r.event.id, title: r.event.title, status: eventStatus(r.event) }
            : null,
          artists: r.artists.map((a) => a.artist),
          media: {
            type: r.type,
            url: await this.storage.privateUrl(m?.displayKey),
            thumbUrl: await this.storage.privateUrl(m?.thumbKey),
            width: m?.width ?? null,
            height: m?.height ?? null,
            durationMs: m?.durationMs ?? null,
          },
          isOfficial: r.isOfficial,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          saveCount: r.saveCount,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          viewer: {
            liked: liked.has(r.id),
            saved: saved.has(r.id),
            isAuthor,
            followingAuthor: followed.has(r.authorId),
            canDelete: isAuthor || isAdmin,
          },
        };
      }),
    );
  }
}

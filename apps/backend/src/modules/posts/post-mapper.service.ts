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

/**
 * Whether a viewer may see a post's full media. Free and public pay-what-you-want posts are
 * open; paid posts need an entitlement (authors and admins always see their content).
 */
export function canViewFullMedia(
  r: Pick<PostRow, 'monetizationMode' | 'pwywGated' | 'authorId'>,
  viewer: RequestUser,
  purchased: boolean,
): boolean {
  if (r.monetizationMode === 'FREE') return true;
  if (r.monetizationMode === 'PAY_WHAT_YOU_WANT' && !r.pwywGated) return true;
  return purchased || r.authorId === viewer.id || viewer.roles.includes('ADMIN');
}

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
    const [likes, saves, follows, ents] = await Promise.all([
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
      this.prisma.contentEntitlement.findMany({
        where: { userId: viewer.id, postId: { in: ids } },
        select: { postId: true },
      }),
    ]);
    const liked = new Set(likes.map((l) => l.postId));
    const saved = new Set(saves.map((s) => s.postId));
    const followed = new Set(follows.map((f) => f.followeeId));
    const purchased = new Set(ents.map((e) => e.postId));
    const isAdmin = viewer.roles.includes('ADMIN');

    return Promise.all(
      rows.map(async (r): Promise<PostDto> => {
        const m = r.media[0];
        const isAuthor = r.authorId === viewer.id;
        const unlocked = canViewFullMedia(r, viewer, purchased.has(r.id));
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
            // Locked: no URL to the real media at all, only the blurred preview.
            url: unlocked ? await this.storage.privateUrl(m?.displayKey) : null,
            thumbUrl: await this.storage.privateUrl(
              unlocked ? m?.thumbKey : (m?.previewKey ?? null),
            ),
            width: m?.width ?? null,
            height: m?.height ?? null,
            durationMs: m?.durationMs ?? null,
          },
          isOfficial: r.isOfficial,
          monetization: {
            mode: r.monetizationMode,
            priceMinor: r.priceMinor,
            suggestedMinor: r.suggestedMinor,
            minimumMinor: r.minimumMinor,
            gated: r.pwywGated,
            tipsEnabled: r.tipsEnabled,
            currency: r.currency,
          },
          unlocked,
          purchased: purchased.has(r.id),
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

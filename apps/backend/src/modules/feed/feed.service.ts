import { Injectable } from '@nestjs/common';
import { Prisma } from '@muso/database';
import type { FeedQuery, Paginated, PostDto } from '@muso/shared';
import { badRequest } from '../../common/errors.js';
import { blockedUserIds } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { PostMapper, postInclude } from '../posts/post-mapper.service.js';
import { PostsService, visiblePostsWhere } from '../posts/posts.service.js';

const TRENDING_WINDOW_MS = 7 * 86_400_000;

/**
 * Feed strategies. Deliberately simple and explainable (no ML yet); each tab is a filter over
 * visible posts, newest first, except Trending which ranks by recent engagement.
 * New strategies plug in here without touching controllers or the app.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly mapper: PostMapper,
  ) {}

  async feed(q: FeedQuery, viewer: RequestUser): Promise<Paginated<PostDto>> {
    switch (q.tab) {
      case 'trending':
        return this.trending(q, viewer);
      case 'for_you':
        return this.posts.list(await this.forYouWhere(viewer), viewer, q.cursor, q.limit);
      case 'live': {
        const now = new Date();
        return this.posts.list(
          { event: { startsAt: { lte: now }, endsAt: { gt: now }, cancelledAt: null } },
          viewer,
          q.cursor,
          q.limit,
        );
      }
      case 'around': {
        const me = await this.prisma.user.findUnique({
          where: { id: viewer.id },
          select: { city: true },
        });
        if (!me?.city) return { items: [], nextCursor: null };
        const city = { equals: me.city, mode: 'insensitive' as const };
        return this.posts.list(
          { OR: [{ event: { city } }, { author: { city, showLocation: true } }] },
          viewer,
          q.cursor,
          q.limit,
        );
      }
      case 'artists':
        return this.posts.list(
          { OR: [{ isOfficial: true }, { author: { artistProfile: { isNot: null } } }] },
          viewer,
          q.cursor,
          q.limit,
        );
      case 'photos':
        return this.posts.list({ type: 'PHOTO' }, viewer, q.cursor, q.limit);
      case 'videos':
        return this.posts.list({ type: 'VIDEO' }, viewer, q.cursor, q.limit);
    }
  }

  /**
   * For You: people you follow, events you follow, artists in your genres, and your city.
   * Falls back to everything when the viewer has no signals yet (new accounts still see content).
   */
  private async forYouWhere(viewer: RequestUser): Promise<Prisma.PostWhereInput> {
    const [follows, eventFollows, interests, me] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: viewer.id },
        select: { followeeId: true },
      }),
      this.prisma.eventFollow.findMany({ where: { userId: viewer.id }, select: { eventId: true } }),
      this.prisma.userInterest.findMany({
        where: { userId: viewer.id },
        select: { genreId: true },
      }),
      this.prisma.user.findUnique({ where: { id: viewer.id }, select: { city: true } }),
    ]);
    const or: Prisma.PostWhereInput[] = [{ authorId: viewer.id }];
    if (follows.length) or.push({ authorId: { in: follows.map((f) => f.followeeId) } });
    if (eventFollows.length) or.push({ eventId: { in: eventFollows.map((e) => e.eventId) } });
    if (interests.length) {
      or.push({
        artists: {
          some: {
            artist: { genres: { some: { genreId: { in: interests.map((i) => i.genreId) } } } },
          },
        },
      });
    }
    if (me?.city) or.push({ event: { city: { equals: me.city, mode: 'insensitive' } } });
    return or.length > 1 ? { OR: or } : {};
  }

  /** Engagement in the last 7 days: likes + 2×comments + 2×saves. Offset-paginated. */
  private async trending(q: FeedQuery, viewer: RequestUser): Promise<Paginated<PostDto>> {
    let offset = 0;
    if (q.cursor) {
      offset = Number(Buffer.from(q.cursor, 'base64url').toString('utf8'));
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000)
        throw badRequest('Invalid cursor');
    }
    const blocked = await blockedUserIds(this.prisma, viewer.id);
    const since = new Date(Date.now() - TRENDING_WINDOW_MS);
    const blockedSql = blocked.length
      ? Prisma.sql`AND p.author_id NOT IN (${Prisma.join(blocked.map((b) => Prisma.sql`${b}::uuid`))})`
      : Prisma.empty;
    const ranked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM posts p
      WHERE p.deleted_at IS NULL AND p.status = 'PUBLISHED' AND p.moderation_status = 'VISIBLE'
        AND p.published_at >= ${since} ${blockedSql}
      ORDER BY (p.like_count + 2 * p.comment_count + 2 * p.save_count) DESC, p.published_at DESC, p.id DESC
      OFFSET ${offset} LIMIT ${q.limit + 1}`;
    const ids = ranked.slice(0, q.limit).map((r) => r.id);
    const rows = await this.prisma.post.findMany({
      where: { id: { in: ids }, ...visiblePostsWhere(blocked) },
      include: postInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);
    return {
      items: await this.mapper.toDtos(ordered, viewer),
      nextCursor:
        ranked.length > q.limit
          ? Buffer.from(String(offset + q.limit)).toString('base64url')
          : null,
    };
  }
}

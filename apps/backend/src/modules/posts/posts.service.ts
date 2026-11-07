import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@muso/database';
import {
  eventStatus,
  formatMoney,
  moneyRules,
  parseHashtags,
  parseMentions,
  type CreatePostSchema,
  type Paginated,
  type PricingSchema,
  type PostDto,
  type PresignPostMediaInput,
  type PresignedPostMedia,
} from '@muso/shared';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import { decodeCursor, encodeCursor } from '../../common/cursor.js';
import {
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { blockedUserIds, isBlockedEitherWay } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { MediaDerivatives } from '../media/media-derivatives.service.js';
import { MediaQueue } from '../media/media.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostMapper, canViewFullMedia, postInclude } from './post-mapper.service.js';

type CreatePost = z.output<typeof CreatePostSchema>;
type Pricing = z.output<typeof PricingSchema>;

/** Maps validated pricing input to Post columns (unused fields cleared). */
export function pricingColumns(p: Pricing) {
  return {
    monetizationMode: p.mode,
    priceMinor: p.mode === 'PAY_TO_UNLOCK' ? p.priceMinor : null,
    suggestedMinor: p.mode === 'PAY_WHAT_YOU_WANT' ? p.suggestedMinor : null,
    minimumMinor: p.mode === 'PAY_WHAT_YOU_WANT' ? (p.minimumMinor ?? null) : null,
    pwywGated: p.mode === 'PAY_WHAT_YOU_WANT' ? p.gated : true,
    tipsEnabled: p.tipsEnabled,
  };
}

/**
 * Consent: a fan may only charge for a capture if every tagged artist (other than themselves)
 * allows fans to monetise captures of their shows.
 */
export function assertMaySell(
  pricing: Pricing,
  artists: { userId: string; stageName: string; contentUsagePolicy: string }[],
  authorId: string,
): void {
  if (pricing.mode === 'FREE') return;
  const blocking = artists.find(
    (a) => a.userId !== authorId && a.contentUsagePolicy !== 'FAN_MONETIZATION_ALLOWED',
  );
  if (blocking) {
    throw forbidden(
      `${blocking.stageName} hasn’t allowed fans to sell captures of their shows. Post it for free (tips still work).`,
    );
  }
}

/** Exact price limits for the post's currency (the schema only checks the widest bounds). */
export function assertPriceLimits(pricing: Pricing, currency: string): void {
  const r = moneyRules(currency);
  const amounts =
    pricing.mode === 'PAY_TO_UNLOCK'
      ? [pricing.priceMinor]
      : pricing.mode === 'PAY_WHAT_YOU_WANT'
        ? [pricing.suggestedMinor, pricing.minimumMinor ?? r.minPrice]
        : [];
  for (const a of amounts) {
    if (a < r.minPrice || a > r.maxPrice)
      throw badRequest(
        `Prices must be between ${formatMoney(r.minPrice, currency)} and ${formatMoney(r.maxPrice, currency)}`,
      );
  }
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/** Posts any viewer may see: published, not hidden, not deleted, not from blocked users. */
export function visiblePostsWhere(blocked: string[]): Prisma.PostWhereInput {
  return {
    deletedAt: null,
    status: 'PUBLISHED',
    moderationStatus: 'VISIBLE',
    ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
  };
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mapper: PostMapper,
    private readonly queue: MediaQueue,
    private readonly notifications: NotificationsService,
    private readonly derivatives: MediaDerivatives,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Changes a post's pricing. Recorded in pricing history; existing buyers keep access
   * because entitlements never depend on the current price.
   */
  async updatePricing(id: string, pricing: Pricing, viewer: RequestUser): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: {
        artists: {
          select: {
            artist: { select: { userId: true, stageName: true, contentUsagePolicy: true } },
          },
        },
      },
    });
    if (!post) throw notFound('That post');
    if (post.authorId !== viewer.id) throw forbidden('Only the creator can change the price');
    assertPriceLimits(pricing, post.currency);
    assertMaySell(
      pricing,
      post.artists.map((a) => a.artist),
      viewer.id,
    );
    const cols = pricingColumns(pricing);
    await this.prisma.$transaction([
      this.prisma.post.update({ where: { id }, data: cols }),
      this.prisma.contentPricingHistory.create({
        data: {
          postId: id,
          changedById: viewer.id,
          mode: cols.monetizationMode,
          priceMinor: cols.priceMinor,
          suggestedMinor: cols.suggestedMinor,
          minimumMinor: cols.minimumMinor,
          pwywGated: cols.pwywGated,
          tipsEnabled: cols.tipsEnabled,
        },
      }),
    ]);
    if (pricing.mode !== 'FREE' && post.status === 'PUBLISHED')
      await this.derivatives.ensurePreview(id);
    return this.get(id, viewer);
  }

  /** Full-resolution, metadata-free photo for people who can see the full media. */
  async downloadUrl(id: string, viewer: RequestUser): Promise<{ url: string }> {
    const post = await this.loadVisible(id, viewer);
    if (post.type !== 'PHOTO' || post.status !== 'PUBLISHED')
      throw badRequest('Only photos can be downloaded');
    const purchased = await this.prisma.contentEntitlement.findUnique({
      where: { userId_postId: { userId: viewer.id, postId: id } },
    });
    if (!canViewFullMedia(post, viewer, !!purchased))
      throw forbidden('Unlock this photo to download it');
    const key = await this.derivatives.ensureFull(id);
    const url = key ? await this.storage.privateUrl(key) : null;
    if (!url) throw notFound('That file');
    return { url };
  }

  presign(user: RequestUser, input: PresignPostMediaInput): Promise<PresignedPostMedia> {
    if (!user.emailVerified) throw forbidden('Verify your email before posting');
    return this.storage.presignOriginalUpload(
      user.id,
      input.contentType,
      input.sizeBytes,
      EXT[input.contentType]!,
    );
  }

  async create(user: RequestUser, input: CreatePost): Promise<PostDto> {
    if (!user.emailVerified) throw forbidden('Verify your email before posting');

    // Idempotency: a retried publish returns the post created by the first attempt.
    const existing = await this.prisma.post.findUnique({
      where: {
        authorId_clientRequestId: { authorId: user.id, clientRequestId: input.clientRequestId },
      },
      include: postInclude,
    });
    if (existing) return (await this.mapper.toDtos([existing], user))[0]!;

    // The media must be this user's own completed upload of the declared type.
    if (!input.mediaKey.startsWith(`originals/${user.id}/`) || input.mediaKey.includes('..')) {
      throw badRequest('That file doesn’t belong to you');
    }
    const head = await this.storage.headPrivate(input.mediaKey);
    if (!head) throw badRequest('That upload hasn’t finished. Please try again.');
    const isVideo = head.contentType?.startsWith('video/') ?? false;
    if ((input.type === 'VIDEO') !== isVideo)
      throw badRequest('The file type doesn’t match the post type');

    // Event: must be published, started, not cancelled, and allow this kind of capture.
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null, reviewStatus: 'APPROVED' },
      });
      if (!event) throw notFound('That event');
      const status = eventStatus(event);
      if (status === 'CANCELLED') throw badRequest('That event was cancelled');
      if (status === 'UPCOMING') throw badRequest('You can post to an event once it has started');
      if (event.recordingPolicy === 'NOT_ALLOWED')
        throw forbidden('The organizer doesn’t allow recordings at this event');
      if (event.recordingPolicy === 'PHOTOS_ONLY' && input.type === 'VIDEO') {
        throw forbidden('Only photos are allowed at this event');
      }
    }

    // Tagged artists must exist and must not have asked fans not to post recordings.
    const artistIds = [...new Set(input.artistIds)];
    const artists = await this.prisma.artistProfile.findMany({
      where: { id: { in: artistIds }, user: { deletedAt: null } },
      select: { id: true, userId: true, stageName: true, contentUsagePolicy: true },
    });
    if (artists.length !== artistIds.length)
      throw badRequest('One or more tagged artists could not be found');
    const objecting = artists.find(
      (a) => a.contentUsagePolicy === 'NO_RECORDINGS' && a.userId !== user.id,
    );
    if (objecting) throw forbidden(`${objecting.stageName} has asked fans not to post recordings`);
    // Fan captures are never "official"; only an artist posting a tag of themselves is.
    const isOfficial = artists.some((a) => a.userId === user.id);
    assertMaySell(input.pricing, artists, user.id);
    const currency = this.config.get('PAYMENTS_CURRENCY', { infer: true });
    assertPriceLimits(input.pricing, currency);

    let post;
    try {
      post = await this.prisma.post.create({
        data: {
          authorId: user.id,
          eventId: input.eventId ?? null,
          type: input.type,
          caption: input.caption,
          hashtags: parseHashtags(input.caption),
          ...pricingColumns(input.pricing),
          currency,
          isOfficial,
          rightsConfirmedAt: new Date(),
          clientRequestId: input.clientRequestId,
          media: {
            create: {
              type: input.type,
              originalKey: input.mediaKey,
              mimeType: head.contentType ?? 'application/octet-stream',
              sizeBytes: head.size,
            },
          },
          artists: { create: artistIds.map((artistId) => ({ artistId })) },
        },
        include: postInclude,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Either a concurrent retry with the same clientRequestId, or the file is already on another post.
        const again = await this.prisma.post.findUnique({
          where: {
            authorId_clientRequestId: { authorId: user.id, clientRequestId: input.clientRequestId },
          },
          include: postInclude,
        });
        if (again) return (await this.mapper.toDtos([again], user))[0]!;
        throw conflict('That file has already been posted');
      }
      throw err;
    }
    await this.queue.enqueue(post.id);
    return (await this.mapper.toDtos([post], user))[0]!;
  }

  /** Called by the media worker once derivatives exist. Sends tag and mention notifications. */
  async onPublished(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        authorId: true,
        caption: true,
        artists: { select: { artist: { select: { userId: true } } } },
      },
    });
    if (!post) return;
    const mentioned = await this.prisma.user.findMany({
      where: { username: { in: parseMentions(post.caption) }, deletedAt: null },
      select: { id: true },
    });
    const tagged = post.artists.map((a) => a.artist.userId);
    await this.notifications.notifyMany([
      ...tagged.map((userId) => ({
        userId,
        type: 'TAGGED_IN_POST' as const,
        actorId: post.authorId,
        postId,
      })),
      ...mentioned
        .filter((m) => !tagged.includes(m.id))
        .map((m) => ({ userId: m.id, type: 'MENTIONED' as const, actorId: post.authorId, postId })),
    ]);
  }

  async get(id: string, viewer: RequestUser): Promise<PostDto> {
    const row = await this.loadVisible(id, viewer);
    return (await this.mapper.toDtos([row], viewer))[0]!;
  }

  /** Authors can always see their own posts (processing, failed or hidden); admins see everything. */
  async loadVisible(id: string, viewer: RequestUser) {
    const row = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: postInclude,
    });
    if (!row) throw notFound('That post');
    const privileged = row.authorId === viewer.id || viewer.roles.includes('ADMIN');
    if (!privileged) {
      if (row.status !== 'PUBLISHED' || row.moderationStatus !== 'VISIBLE')
        throw notFound('That post');
      if (await isBlockedEitherWay(this.prisma, viewer.id, row.authorId))
        throw notFound('That post');
    }
    return row;
  }

  async delete(id: string, viewer: RequestUser): Promise<void> {
    const row = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: { authorId: true },
    });
    if (!row) throw notFound('That post');
    if (row.authorId !== viewer.id && !viewer.roles.includes('ADMIN')) throw forbidden();
    await this.prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async like(id: string, viewer: RequestUser, on: boolean): Promise<PostDto> {
    const post = await this.loadVisible(id, viewer);
    if (post.status !== 'PUBLISHED') throw conflict('This post isn’t published yet');
    if (on) {
      const created = await this.prisma.$transaction(async (tx) => {
        const r = await tx.like.createMany({
          data: [{ userId: viewer.id, postId: id }],
          skipDuplicates: true,
        });
        if (r.count) await tx.post.update({ where: { id }, data: { likeCount: { increment: 1 } } });
        return r.count > 0;
      });
      if (created)
        await this.notifications.notify({
          userId: post.authorId,
          type: 'POST_LIKED',
          actorId: viewer.id,
          postId: id,
        });
    } else {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.like.deleteMany({ where: { userId: viewer.id, postId: id } });
        if (r.count) await tx.post.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
      });
    }
    return this.get(id, viewer);
  }

  async save(id: string, viewer: RequestUser, on: boolean): Promise<PostDto> {
    await this.loadVisible(id, viewer);
    await this.prisma.$transaction(async (tx) => {
      if (on) {
        const r = await tx.savedPost.createMany({
          data: [{ userId: viewer.id, postId: id }],
          skipDuplicates: true,
        });
        if (r.count) await tx.post.update({ where: { id }, data: { saveCount: { increment: 1 } } });
      } else {
        const r = await tx.savedPost.deleteMany({ where: { userId: viewer.id, postId: id } });
        if (r.count) await tx.post.update({ where: { id }, data: { saveCount: { decrement: 1 } } });
      }
    });
    return this.get(id, viewer);
  }

  /** Generic keyset-paginated list (newest first) over visible posts matching `where`. */
  async list(
    where: Prisma.PostWhereInput,
    viewer: RequestUser,
    cursorRaw: string | undefined,
    limit: number,
  ): Promise<Paginated<PostDto>> {
    const blocked = await blockedUserIds(this.prisma, viewer.id);
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          visiblePostsWhere(blocked),
          where,
          ...(cursor
            ? [
                {
                  OR: [
                    { publishedAt: { lt: new Date(cursor.t) } },
                    { publishedAt: new Date(cursor.t), id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: postInclude,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await this.mapper.toDtos(page, viewer),
      nextCursor:
        rows.length > limit && last?.publishedAt
          ? encodeCursor({ t: last.publishedAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** Saved posts, most recently saved first. */
  async listSaved(
    viewer: RequestUser,
    cursorRaw: string | undefined,
    limit: number,
  ): Promise<Paginated<PostDto>> {
    const blocked = await blockedUserIds(this.prisma, viewer.id);
    const cursor = decodeCursor(cursorRaw);
    const saves = await this.prisma.savedPost.findMany({
      where: {
        userId: viewer.id,
        post: visiblePostsWhere(blocked),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), postId: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
      take: limit + 1,
      include: { post: { include: postInclude } },
    });
    const page = saves.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await this.mapper.toDtos(
        page.map((s) => s.post),
        viewer,
      ),
      nextCursor:
        saves.length > limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.postId })
          : null,
    };
  }

  /** The author's own posts including processing/failed ones (for "my uploads"). */
  async listOwn(viewer: RequestUser): Promise<PostDto[]> {
    const rows = await this.prisma.post.findMany({
      where: { authorId: viewer.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: postInclude,
    });
    return this.mapper.toDtos(rows, viewer);
  }
}

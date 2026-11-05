import { Injectable } from '@nestjs/common';
import type { PublicProfile } from '@muso/shared';
import { badRequest, forbidden, isUniqueViolation, notFound } from '../../common/errors.js';
import { isBlockedEitherWay } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Look up by username or id. Hidden (404) if that user has blocked the viewer. */
  async profile(handle: string, viewer: RequestUser): Promise<PublicProfile> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(handle);
    const u = await this.prisma.user.findFirst({
      where: { deletedAt: null, ...(isUuid ? { id: handle } : { username: handle.toLowerCase() }) },
      include: {
        roles: { select: { role: true } },
        artistProfile: { select: { id: true } },
        _count: {
          select: {
            followers: true,
            following: true,
            posts: { where: { deletedAt: null, status: 'PUBLISHED', moderationStatus: 'VISIBLE' } },
          },
        },
      },
    });
    if (!u) throw notFound('That profile');
    const [blockedByThem, blockedByMe, following] = await Promise.all([
      this.prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: u.id, blockedId: viewer.id } },
      }),
      this.prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: viewer.id, blockedId: u.id } },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewer.id, followeeId: u.id } },
      }),
    ]);
    if (blockedByThem) throw notFound('That profile');
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.storage.publicUrl(u.avatarKey),
      artistId: u.artistProfile?.id ?? null,
      bio: u.bio,
      city: u.showLocation ? u.city : null,
      roles: u.roles.map((r) => r.role).filter((r) => r !== 'ADMIN'),
      followerCount: u._count.followers,
      followingCount: u._count.following,
      postCount: u._count.posts,
      viewer: { isMe: u.id === viewer.id, following: !!following, blocked: !!blockedByMe },
    };
  }

  async follow(targetId: string, viewer: RequestUser): Promise<PublicProfile> {
    if (targetId === viewer.id) throw badRequest('You can’t follow yourself');
    await this.assertUser(targetId);
    if (await isBlockedEitherWay(this.prisma, viewer.id, targetId))
      throw forbidden('You can’t follow this account');
    try {
      await this.prisma.follow.create({ data: { followerId: viewer.id, followeeId: targetId } });
      await this.notifications.notify({
        userId: targetId,
        type: 'NEW_FOLLOWER',
        actorId: viewer.id,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // already following: idempotent
    }
    return this.profile(targetId, viewer);
  }

  async unfollow(targetId: string, viewer: RequestUser): Promise<PublicProfile> {
    await this.prisma.follow.deleteMany({ where: { followerId: viewer.id, followeeId: targetId } });
    return this.profile(targetId, viewer);
  }

  /** Blocking removes follows in both directions. */
  async block(targetId: string, viewer: RequestUser): Promise<PublicProfile> {
    if (targetId === viewer.id) throw badRequest('You can’t block yourself');
    await this.assertUser(targetId);
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: viewer.id, blockedId: targetId } },
        create: { blockerId: viewer.id, blockedId: targetId },
        update: {},
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: viewer.id, followeeId: targetId },
            { followerId: targetId, followeeId: viewer.id },
          ],
        },
      }),
    ]);
    return this.profile(targetId, viewer);
  }

  async unblock(targetId: string, viewer: RequestUser): Promise<PublicProfile> {
    await this.prisma.block.deleteMany({ where: { blockerId: viewer.id, blockedId: targetId } });
    return this.profile(targetId, viewer);
  }

  private async assertUser(id: string): Promise<void> {
    const u = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!u) throw notFound('That profile');
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@muso/database';
import type { NotificationDto, Paginated } from '@muso/shared';
import { decodeCursor, encodeCursor } from '../../common/cursor.js';
import { isBlockedEitherWay, toUserSummary, userSummarySelect } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
}

/** In-app notifications. Push delivery is layered on later; this table is the source of truth. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Best effort: never fails the action that triggered it. Skips self-notifications and blocked pairs. */
  async notify(n: NotifyInput): Promise<void> {
    try {
      if (n.actorId && n.actorId === n.userId) return;
      if (n.actorId && (await isBlockedEitherWay(this.prisma, n.userId, n.actorId))) return;
      await this.prisma.notification.create({ data: n });
    } catch (err) {
      this.logger.warn(`notify failed: ${(err as Error).message}`);
    }
  }

  async notifyMany(items: NotifyInput[]): Promise<void> {
    await Promise.all(items.map((n) => this.notify(n)));
  }

  async list(
    userId: string,
    cursorRaw: string | undefined,
    limit: number,
  ): Promise<Paginated<NotificationDto>> {
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        actor: { select: userSummarySelect },
        post: {
          select: { id: true, deletedAt: true, media: { select: { thumbKey: true }, take: 1 } },
        },
        comment: { select: { id: true, body: true, deletedAt: true } },
      },
    });
    const page = rows.slice(0, limit);
    const items = await Promise.all(
      page.map(async (r): Promise<NotificationDto> => ({
        id: r.id,
        type: r.type,
        actor: r.actor ? toUserSummary(r.actor, this.storage) : null,
        post:
          r.post && !r.post.deletedAt
            ? { id: r.post.id, thumbUrl: await this.storage.privateUrl(r.post.media[0]?.thumbKey) }
            : null,
        comment:
          r.comment && !r.comment.deletedAt
            ? { id: r.comment.id, body: r.comment.body.slice(0, 140) }
            : null,
        read: r.readAt !== null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }
}

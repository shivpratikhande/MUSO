import { Injectable } from '@nestjs/common';
import {
  parseMentions,
  type CommentDto,
  type CreateCommentInput,
  type Paginated,
} from '@muso/shared';
import { decodeCursor, encodeCursor } from '../../common/cursor.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import {
  blockedUserIds,
  isBlockedEitherWay,
  toUserSummary,
  userSummarySelect,
} from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostsService } from '../posts/posts.service.js';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly posts: PostsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Top-level comments (oldest first) or the replies to one comment. */
  async list(
    postId: string,
    viewer: RequestUser,
    parentId: string | undefined,
    cursorRaw: string | undefined,
    limit: number,
  ): Promise<Paginated<CommentDto>> {
    const post = await this.posts.loadVisible(postId, viewer);
    const blocked = await blockedUserIds(this.prisma, viewer.id);
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.comment.findMany({
      where: {
        postId,
        parentId: parentId ?? null,
        deletedAt: null,
        ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        author: { select: userSummarySelect },
        _count: { select: { replies: { where: { deletedAt: null } } } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const isAdmin = viewer.roles.includes('ADMIN');
    return {
      items: page.map((c) => ({
        id: c.id,
        postId: c.postId,
        parentId: c.parentId,
        body: c.body,
        author: toUserSummary(c.author, this.storage),
        replyCount: c._count.replies,
        createdAt: c.createdAt.toISOString(),
        canDelete: c.authorId === viewer.id || post.authorId === viewer.id || isAdmin,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async create(
    postId: string,
    input: CreateCommentInput,
    viewer: RequestUser,
  ): Promise<CommentDto> {
    const post = await this.posts.loadVisible(postId, viewer);
    if (post.status !== 'PUBLISHED') throw badRequest('This post isn’t published yet');
    if (await isBlockedEitherWay(this.prisma, viewer.id, post.authorId))
      throw forbidden('You can’t comment on this post');

    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: input.parentId, postId, deletedAt: null },
      });
      if (!parent) throw notFound('That comment');
      if (parent.parentId) throw badRequest('You can only reply to top-level comments');
      parentAuthorId = parent.authorId;
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: { postId, authorId: viewer.id, parentId: input.parentId ?? null, body: input.body },
        include: { author: { select: userSummarySelect } },
      });
      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      return c;
    });

    const mentioned = await this.prisma.user.findMany({
      where: { username: { in: parseMentions(input.body) }, deletedAt: null },
      select: { id: true },
    });
    const notified = new Set<string>();
    const queue = [];
    if (parentAuthorId) {
      queue.push({
        userId: parentAuthorId,
        type: 'COMMENT_REPLIED' as const,
        actorId: viewer.id,
        postId,
        commentId: comment.id,
      });
      notified.add(parentAuthorId);
    }
    if (!notified.has(post.authorId)) {
      queue.push({
        userId: post.authorId,
        type: 'POST_COMMENTED' as const,
        actorId: viewer.id,
        postId,
        commentId: comment.id,
      });
      notified.add(post.authorId);
    }
    for (const m of mentioned) {
      if (!notified.has(m.id))
        queue.push({
          userId: m.id,
          type: 'MENTIONED' as const,
          actorId: viewer.id,
          postId,
          commentId: comment.id,
        });
    }
    await this.notifications.notifyMany(queue);

    return {
      id: comment.id,
      postId,
      parentId: comment.parentId,
      body: comment.body,
      author: toUserSummary(comment.author, this.storage),
      replyCount: 0,
      createdAt: comment.createdAt.toISOString(),
      canDelete: true,
    };
  }

  /** Comment author, post author or admin. Deleting a comment also removes its replies. */
  async delete(commentId: string, viewer: RequestUser): Promise<void> {
    const c = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      include: { post: { select: { authorId: true } } },
    });
    if (!c) throw notFound('That comment');
    const allowed =
      c.authorId === viewer.id || c.post.authorId === viewer.id || viewer.roles.includes('ADMIN');
    if (!allowed) throw forbidden();
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const replies = await tx.comment.updateMany({
        where: { parentId: c.id, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.comment.update({ where: { id: c.id }, data: { deletedAt: now } });
      await tx.post.update({
        where: { id: c.postId },
        data: { commentCount: { decrement: 1 + replies.count } },
      });
    });
  }
}

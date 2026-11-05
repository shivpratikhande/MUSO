import { Injectable } from '@nestjs/common';
import type { ReportDto, ReportInput, ResolveReportInput } from '@muso/shared';
import { badRequest, notFound } from '../../common/errors.js';
import { toUserSummary, userSummarySelect } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';

/** Distinct open reports that automatically hide a post pending admin review. */
export const AUTO_HIDE_THRESHOLD = 5;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Idempotent per (reporter, target). */
  async create(input: ReportInput, viewer: RequestUser): Promise<{ ok: true }> {
    await this.assertTarget(input, viewer);
    const inserted = await this.prisma.report.createMany({
      data: [
        {
          reporterId: viewer.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          details: input.details ?? null,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count && input.targetType === 'POST') {
      const post = await this.prisma.post.update({
        where: { id: input.targetId },
        data: { reportCount: { increment: 1 } },
        select: { reportCount: true },
      });
      if (post.reportCount >= AUTO_HIDE_THRESHOLD) {
        await this.prisma.post.update({
          where: { id: input.targetId },
          data: { moderationStatus: 'HIDDEN' },
        });
      }
    }
    return { ok: true };
  }

  async listOpen(): Promise<ReportDto[]> {
    const rows = await this.prisma.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { reporter: { select: userSummarySelect } },
    });
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      reporter: toUserSummary(r.reporter, this.storage),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** HIDE takes the content down; both actions close every open report on that target. */
  async resolve(id: string, input: ResolveReportInput): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('That report');
    await this.prisma.$transaction(async (tx) => {
      if (input.action === 'HIDE') {
        if (report.targetType === 'POST')
          await tx.post.update({
            where: { id: report.targetId },
            data: { moderationStatus: 'HIDDEN' },
          });
        if (report.targetType === 'COMMENT')
          await tx.comment.update({
            where: { id: report.targetId },
            data: { deletedAt: new Date() },
          });
      } else if (report.targetType === 'POST') {
        await tx.post.update({
          where: { id: report.targetId },
          data: { moderationStatus: 'VISIBLE', reportCount: 0 },
        });
      }
      await tx.report.updateMany({
        where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' },
        data: { status: input.action === 'HIDE' ? 'ACTIONED' : 'DISMISSED' },
      });
    });
  }

  private async assertTarget(input: ReportInput, viewer: RequestUser): Promise<void> {
    const exists =
      input.targetType === 'POST'
        ? await this.prisma.post.count({ where: { id: input.targetId, deletedAt: null } })
        : input.targetType === 'COMMENT'
          ? await this.prisma.comment.count({ where: { id: input.targetId, deletedAt: null } })
          : await this.prisma.user.count({ where: { id: input.targetId, deletedAt: null } });
    if (!exists) throw notFound('That content');
    if (input.targetType === 'USER' && input.targetId === viewer.id)
      throw badRequest('You can’t report yourself');
  }
}

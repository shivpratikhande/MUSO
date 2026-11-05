import type { UserSummary } from '@muso/shared';
import type { PrismaService } from '../database/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';

/** Prisma select for `UserSummary`. */
export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
  artistProfile: { select: { id: true } },
} as const;

export function toUserSummary(
  u: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarKey: string | null;
    artistProfile: { id: string } | null;
  },
  storage: StorageService,
): UserSummary {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: storage.publicUrl(u.avatarKey),
    artistId: u.artistProfile?.id ?? null,
  };
}

/** Ids of users the viewer has blocked or who have blocked the viewer. Their content is hidden both ways. */
export async function blockedUserIds(prisma: PrismaService, viewerId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)))];
}

export async function isBlockedEitherWay(
  prisma: PrismaService,
  a: string,
  b: string,
): Promise<boolean> {
  const n = await prisma.block.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return n > 0;
}

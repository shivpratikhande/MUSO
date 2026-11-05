import { Injectable } from '@nestjs/common';
import type { ArtistDetail, ArtistSummary, ProfileLink } from '@muso/shared';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { EventsService } from '../events/events.service.js';

const summarySelect = {
  id: true,
  stageName: true,
  user: { select: { avatarKey: true, city: true, showLocation: true } },
  genres: { select: { genre: { select: { id: true, slug: true, name: true } } } },
} as const;

@Injectable()
export class ArtistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: EventsService,
  ) {}

  /** Search by stage name or username (used by the lineup picker and discovery). */
  async search(q: string | undefined, limit = 20): Promise<ArtistSummary[]> {
    const rows = await this.prisma.artistProfile.findMany({
      where: {
        user: { deletedAt: null },
        ...(q
          ? {
              OR: [
                { stageName: { contains: q, mode: 'insensitive' } },
                { user: { username: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      },
      orderBy: { stageName: 'asc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: summarySelect,
    });
    return rows.map((a) => ({
      id: a.id,
      stageName: a.stageName,
      avatarUrl: this.storage.publicUrl(a.user.avatarKey),
      city: a.user.showLocation ? a.user.city : null,
      genres: a.genres.map((g) => g.genre),
    }));
  }

  async get(id: string): Promise<ArtistDetail> {
    const a = await this.prisma.artistProfile.findFirst({
      where: { id, user: { deletedAt: null } },
      include: {
        user: true,
        genres: { select: { genre: { select: { id: true, slug: true, name: true } } } },
      },
    });
    if (!a) throw notFound('That artist');
    const { upcoming, past } = await this.events.listForArtist(a.id);
    const showLoc = a.user.showLocation;
    return {
      id: a.id,
      userId: a.userId,
      stageName: a.stageName,
      username: a.user.username,
      bio: a.user.bio,
      avatarUrl: this.storage.publicUrl(a.user.avatarKey),
      coverUrl: this.storage.publicUrl(a.coverKey),
      city: showLoc ? a.user.city : null,
      country: showLoc ? a.user.country : null,
      links: (a.user.links as unknown as ProfileLink[]) ?? [],
      genres: a.genres.map((g) => g.genre),
      contentUsagePolicy: a.contentUsagePolicy,
      upcomingEvents: upcoming,
      pastEvents: past,
    };
  }
}

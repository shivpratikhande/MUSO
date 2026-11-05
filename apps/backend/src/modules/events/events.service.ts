import { Injectable } from '@nestjs/common';
import { Prisma } from '@muso/database';
import {
  eventStatus,
  type CreateEventInput,
  type EventDetail,
  type EventListQuery,
  type EventSummary,
  type Paginated,
  type ReviewEventInput,
  type SetLineupInput,
  type SetScheduleInput,
  type UpdateEventInput,
} from '@muso/shared';
import { decodeCursor, encodeCursor } from '../../common/cursor.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';

const MAX_DURATION_MS = 14 * 86_400_000;

/** Fields whose change sends an approved event back to review. */
const REVIEWED_FIELDS = [
  'title',
  'description',
  'coverKey',
  'venueName',
  'address',
  'city',
  'country',
  'startsAt',
  'endsAt',
] as const;

const summaryInclude = {
  artists: {
    where: { position: { lt: 2 } },
    orderBy: { position: 'asc' },
    include: { artist: { select: { id: true, stageName: true } } },
  },
  _count: { select: { followers: true } },
} as const satisfies Prisma.EventInclude;

const detailInclude = {
  _count: { select: { followers: true } },
  organizer: {
    select: {
      id: true,
      displayName: true,
      avatarKey: true,
      organizerProfile: { select: { organizationName: true } },
    },
  },
  artists: {
    orderBy: { position: 'asc' },
    include: {
      artist: { select: { id: true, stageName: true, user: { select: { avatarKey: true } } } },
    },
  },
  schedule: {
    orderBy: { startsAt: 'asc' },
    include: { artist: { select: { id: true, stageName: true } } },
  },
} as const satisfies Prisma.EventInclude;

type SummaryRow = Prisma.EventGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.EventGetPayload<{ include: typeof detailInclude }>;

const isAdmin = (u: RequestUser) => u.roles.includes('ADMIN');

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ───────────────────────────── Queries ─────────────────────────────

  /** Public discovery: approved, non-deleted events only. */
  async list(q: EventListQuery): Promise<Paginated<EventSummary>> {
    const now = new Date();
    const cursor = decodeCursor(q.cursor);
    const where: Prisma.EventWhereInput = { reviewStatus: 'APPROVED', deletedAt: null };
    let orderBy: Prisma.EventOrderByWithRelationInput[];
    let sortField: 'startsAt' | 'endsAt';

    if (q.when === 'upcoming') {
      where.startsAt = { gt: now };
      orderBy = [{ startsAt: 'asc' }, { id: 'asc' }];
      sortField = 'startsAt';
    } else if (q.when === 'live') {
      Object.assign(where, { startsAt: { lte: now }, endsAt: { gt: now }, cancelledAt: null });
      orderBy = [{ startsAt: 'asc' }, { id: 'asc' }];
      sortField = 'startsAt';
    } else {
      Object.assign(where, { endsAt: { lte: now }, cancelledAt: null });
      orderBy = [{ endsAt: 'desc' }, { id: 'desc' }];
      sortField = 'endsAt';
    }

    const and: Prisma.EventWhereInput[] = [];
    if (q.city) and.push({ city: { equals: q.city, mode: 'insensitive' } });
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { venueName: { contains: q.q, mode: 'insensitive' } },
          { city: { contains: q.q, mode: 'insensitive' } },
          { artists: { some: { artist: { stageName: { contains: q.q, mode: 'insensitive' } } } } },
        ],
      });
    }
    if (cursor) {
      const t = new Date(cursor.t);
      const asc = q.when !== 'past';
      and.push({
        OR: [
          { [sortField]: asc ? { gt: t } : { lt: t } },
          { [sortField]: t, id: asc ? { gt: cursor.id } : { lt: cursor.id } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const rows = await this.prisma.event.findMany({
      where,
      orderBy,
      take: q.limit + 1,
      include: summaryInclude,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.toSummary(r, now)),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ t: last[sortField].toISOString(), id: last.id })
          : null,
    };
  }

  /** Every event the caller organizes, including pending and rejected ones. */
  async listMine(userId: string): Promise<EventSummary[]> {
    const rows = await this.prisma.event.findMany({
      where: { organizerId: userId, deletedAt: null },
      orderBy: [{ startsAt: 'desc' }],
      take: 100,
      include: summaryInclude,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async listFollowing(userId: string): Promise<EventSummary[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        reviewStatus: 'APPROVED',
        followers: { some: { userId } },
        endsAt: { gt: new Date() },
      },
      orderBy: [{ startsAt: 'asc' }],
      take: 100,
      include: summaryInclude,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async listPendingReview(): Promise<EventSummary[]> {
    const rows = await this.prisma.event.findMany({
      where: { deletedAt: null, reviewStatus: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
      include: summaryInclude,
    });
    return rows.map((r) => this.toSummary(r));
  }

  /** Approved events featuring an artist, split into upcoming and past. */
  async listForArtist(
    artistId: string,
  ): Promise<{ upcoming: EventSummary[]; past: EventSummary[] }> {
    const now = new Date();
    const base = {
      deletedAt: null,
      reviewStatus: 'APPROVED' as const,
      artists: { some: { artistId } },
    };
    const [upcoming, past] = await Promise.all([
      this.prisma.event.findMany({
        where: { ...base, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 20,
        include: summaryInclude,
      }),
      this.prisma.event.findMany({
        where: { ...base, endsAt: { lte: now }, cancelledAt: null },
        orderBy: { endsAt: 'desc' },
        take: 20,
        include: summaryInclude,
      }),
    ]);
    return {
      upcoming: upcoming.map((r) => this.toSummary(r, now)),
      past: past.map((r) => this.toSummary(r, now)),
    };
  }

  async get(id: string, viewer: RequestUser): Promise<EventDetail> {
    const row = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
    if (!row || !this.canView(row, viewer)) throw notFound('That event');
    const following = await this.prisma.eventFollow.findUnique({
      where: { userId_eventId: { userId: viewer.id, eventId: id } },
    });
    return this.toDetail(row, viewer, !!following);
  }

  // ──────────────────────────── Mutations ────────────────────────────

  async create(input: CreateEventInput, user: RequestUser): Promise<EventDetail> {
    if (!user.emailVerified) throw forbidden('Verify your email before creating events');
    const org = await this.prisma.organizerProfile.findUnique({ where: { userId: user.id } });
    if (!org) throw forbidden('Complete your organizer profile before creating events');
    if (Date.parse(input.endsAt) <= Date.now()) throw badRequest('This event has already ended');
    if (input.coverKey)
      await this.storage.assertOwnedUpload(input.coverKey, user.id, 'EVENT_COVER');

    const autoApprove = isAdmin(user);
    const event = await this.prisma.event.create({
      data: {
        organizerId: user.id,
        title: input.title,
        description: input.description,
        coverKey: input.coverKey ?? null,
        venueName: input.venueName,
        address: input.address ?? null,
        city: input.city,
        country: input.country,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        recordingPolicy: input.recordingPolicy ?? 'ALLOWED',
        recordingNotes: input.recordingNotes ?? null,
        ...(autoApprove
          ? { reviewStatus: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() }
          : {}),
      },
    });
    return this.get(event.id, user);
  }

  async update(id: string, input: UpdateEventInput, user: RequestUser): Promise<EventDetail> {
    const event = await this.loadEditable(id, user);
    const startsAt = input.startsAt ? new Date(input.startsAt) : event.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : event.endsAt;
    if (endsAt <= startsAt) throw badRequest('End must be after start');
    if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS)
      throw badRequest('Events can last at most 14 days');
    if (input.coverKey)
      await this.storage.assertOwnedUpload(input.coverKey, user.id, 'EVENT_COVER');

    const touchesReviewed = REVIEWED_FIELDS.some((f) => input[f] !== undefined);
    const resetReview = touchesReviewed && !isAdmin(user) && event.reviewStatus !== 'PENDING';

    await this.prisma.event.update({
      where: { id },
      data: {
        ...input,
        startsAt,
        endsAt,
        ...(resetReview
          ? { reviewStatus: 'PENDING', reviewedById: null, reviewedAt: null, reviewNote: null }
          : {}),
      },
    });
    return this.get(id, user);
  }

  async cancel(id: string, user: RequestUser): Promise<EventDetail> {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event || !this.canView(event, user)) throw notFound('That event');
    if (!this.canEdit(event, user)) throw forbidden();
    if (!event.cancelledAt) {
      if (eventStatus(event) === 'COMPLETED') throw conflict('This event has already finished');
      await this.prisma.event.update({ where: { id }, data: { cancelledAt: new Date() } });
    }
    return this.get(id, user);
  }

  async setLineup(id: string, input: SetLineupInput, user: RequestUser): Promise<EventDetail> {
    await this.loadEditable(id, user);
    const ids = input.artistIds;
    const found = await this.prisma.artistProfile.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw badRequest('One or more artists could not be found');
    await this.prisma.$transaction([
      this.prisma.eventArtist.deleteMany({ where: { eventId: id } }),
      this.prisma.eventArtist.createMany({
        data: ids.map((artistId, position) => ({ eventId: id, artistId, position })),
      }),
      // Schedule slots must reference lineup artists.
      this.prisma.eventScheduleItem.updateMany({
        where: { eventId: id, artistId: { notIn: ids } },
        data: { artistId: null },
      }),
    ]);
    return this.get(id, user);
  }

  async setSchedule(id: string, input: SetScheduleInput, user: RequestUser): Promise<EventDetail> {
    const event = await this.loadEditable(id, user);
    const lineup = new Set(
      (
        await this.prisma.eventArtist.findMany({
          where: { eventId: id },
          select: { artistId: true },
        })
      ).map((a) => a.artistId),
    );
    const windowStart = event.startsAt.getTime() - 86_400_000;
    const items = input.items.map((it, i) => {
      const s = new Date(it.startsAt);
      const e = it.endsAt ? new Date(it.endsAt) : null;
      if (s.getTime() < windowStart || s >= event.endsAt)
        throw badRequest(`Item ${i + 1} is outside the event’s dates`);
      if (e && e <= s) throw badRequest(`Item ${i + 1} ends before it starts`);
      if (it.artistId && !lineup.has(it.artistId))
        throw badRequest(`Item ${i + 1}: add the artist to the lineup first`);
      return {
        eventId: id,
        title: it.title,
        stage: it.stage ?? null,
        startsAt: s,
        endsAt: e,
        artistId: it.artistId ?? null,
      };
    });
    await this.prisma.$transaction([
      this.prisma.eventScheduleItem.deleteMany({ where: { eventId: id } }),
      this.prisma.eventScheduleItem.createMany({ data: items }),
    ]);
    return this.get(id, user);
  }

  async review(id: string, input: ReviewEventInput, admin: RequestUser): Promise<EventDetail> {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw notFound('That event');
    await this.prisma.event.update({
      where: { id },
      data: {
        reviewStatus: input.decision,
        reviewNote: input.note ?? null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    return this.get(id, admin);
  }

  /** Idempotent. Only approved events can be followed. */
  async follow(id: string, user: RequestUser, follow: boolean): Promise<EventDetail> {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event || !this.canView(event, user)) throw notFound('That event');
    if (follow) {
      if (event.reviewStatus !== 'APPROVED') throw conflict('This event isn’t published yet');
      await this.prisma.eventFollow.upsert({
        where: { userId_eventId: { userId: user.id, eventId: id } },
        create: { userId: user.id, eventId: id },
        update: {},
      });
    } else {
      await this.prisma.eventFollow.deleteMany({ where: { userId: user.id, eventId: id } });
    }
    return this.get(id, user);
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private canView(e: { reviewStatus: string; organizerId: string }, u: RequestUser): boolean {
    return e.reviewStatus === 'APPROVED' || e.organizerId === u.id || isAdmin(u);
  }

  private canEdit(e: { organizerId: string }, u: RequestUser): boolean {
    return e.organizerId === u.id || isAdmin(u);
  }

  private async loadEditable(id: string, user: RequestUser) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event || !this.canView(event, user)) throw notFound('That event');
    if (!this.canEdit(event, user)) throw forbidden();
    const status = eventStatus(event);
    if (status === 'CANCELLED') throw conflict('Cancelled events can’t be edited');
    if (status === 'COMPLETED') throw conflict('Finished events can’t be edited');
    return event;
  }

  private toSummary(r: SummaryRow, now = new Date()): EventSummary {
    return {
      id: r.id,
      title: r.title,
      coverUrl: this.storage.publicUrl(r.coverKey),
      venueName: r.venueName,
      city: r.city,
      country: r.country,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: eventStatus(r, now),
      reviewStatus: r.reviewStatus,
      headliners: r.artists.map((a) => a.artist),
      followerCount: r._count.followers,
    };
  }

  private toDetail(r: DetailRow, viewer: RequestUser, isFollowing: boolean): EventDetail {
    return {
      ...this.toSummary({ ...r, artists: r.artists.filter((a) => a.position < 2) }),
      description: r.description,
      address: r.address,
      recordingPolicy: r.recordingPolicy,
      recordingNotes: r.recordingNotes,
      reviewNote: r.organizerId === viewer.id || isAdmin(viewer) ? r.reviewNote : null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      organizer: {
        id: r.organizer.id,
        displayName: r.organizer.displayName,
        organizationName: r.organizer.organizerProfile?.organizationName ?? null,
        avatarUrl: this.storage.publicUrl(r.organizer.avatarKey),
      },
      lineup: r.artists.map((a) => ({
        id: a.artist.id,
        stageName: a.artist.stageName,
        avatarUrl: this.storage.publicUrl(a.artist.user.avatarKey),
        position: a.position,
      })),
      schedule: r.schedule.map((s) => ({
        id: s.id,
        title: s.title,
        stage: s.stage,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,
        artist: s.artist,
      })),
      viewer: { isFollowing, canEdit: this.canEdit(r, viewer), canReview: isAdmin(viewer) },
    };
  }
}

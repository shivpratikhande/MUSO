import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  cleanupTestUsers,
  createTestApp,
  makeArtist,
  makeOrganizer,
  makeUser,
  uniq,
  uploadImage,
  type TestUser,
} from './helpers.js';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('Events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  /** Unique per run so list assertions ignore leftovers in the test DB. */
  const city = uniq('Testville');
  const http = () => request(app.getHttpServer());

  const eventBody = (over: Record<string, unknown> = {}) => ({
    title: 'Sunset Sessions',
    description: 'An evening of live music.',
    venueName: 'The Courtyard',
    city,
    country: 'in',
    startsAt: iso(24 * HOUR),
    endsAt: iso(28 * HOUR),
    ...over,
  });

  const createEvent = async (org: TestUser, over: Record<string, unknown> = {}) => {
    const res = await http().post('/v1/events').set(org.auth).send(eventBody(over)).expect(201);
    return res.body.data as { id: string; reviewStatus: string; status: string };
  };

  const approve = (id: string) =>
    http()
      .post(`/v1/admin/events/${id}/review`)
      .set(admin.auth)
      .send({ decision: 'APPROVED' })
      .expect(200);

  const listIds = async (user: TestUser, query: Record<string, string>) => {
    const res = await http()
      .get('/v1/events')
      .set(user.auth)
      .query({ city, ...query })
      .expect(200);
    return res.body.data.items.map((e: { id: string }) => e.id) as string[];
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await makeUser(app, prisma, { roles: ['ADMIN'] });
  });
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('creating', () => {
    it('requires the ORGANIZER role', async () => {
      const fan = await makeUser(app, prisma);
      await http().post('/v1/events').set(fan.auth).send(eventBody()).expect(403);
    });

    it('requires a verified email', async () => {
      const org = await makeUser(app, prisma, { roles: ['ORGANIZER'], verified: false });
      const res = await http().post('/v1/events').set(org.auth).send(eventBody()).expect(403);
      expect(res.body.error.message).toMatch(/verify/i);
    });

    it('requires an organizer profile', async () => {
      const org = await makeUser(app, prisma, { roles: ['ORGANIZER'] });
      await http().post('/v1/events').set(org.auth).send(eventBody()).expect(403);
    });

    it('rejects events that already ended or end before they start', async () => {
      const org = await makeOrganizer(app, prisma);
      await http()
        .post('/v1/events')
        .set(org.auth)
        .send(eventBody({ startsAt: iso(-5 * HOUR), endsAt: iso(-HOUR) }))
        .expect(400);
      await http()
        .post('/v1/events')
        .set(org.auth)
        .send(eventBody({ endsAt: iso(HOUR) }))
        .expect(400);
    });

    it('creates a PENDING event with an uploaded cover', async () => {
      const org = await makeOrganizer(app, prisma);
      const coverKey = await uploadImage(app, org, 'EVENT_COVER');
      const res = await http()
        .post('/v1/events')
        .set(org.auth)
        .send(eventBody({ coverKey }))
        .expect(201);
      expect(res.body.data).toMatchObject({
        reviewStatus: 'PENDING',
        status: 'UPCOMING',
        country: 'IN',
      });
      expect(res.body.data.coverUrl).toContain(coverKey);
      expect(res.body.data.viewer).toEqual({ isFollowing: false, canEdit: true, canReview: false });
    });

    it("rejects another user's cover image", async () => {
      const org = await makeOrganizer(app, prisma);
      const other = await makeOrganizer(app, prisma);
      const coverKey = await uploadImage(app, other, 'EVENT_COVER');
      await http().post('/v1/events').set(org.auth).send(eventBody({ coverKey })).expect(400);
    });

    it('auto-approves events created by admins', async () => {
      const adminOrg = await makeOrganizer(app, prisma, ['ADMIN']);
      const e = await createEvent(adminOrg);
      expect(e.reviewStatus).toBe('APPROVED');
    });
  });

  describe('review & visibility', () => {
    it('hides pending events from everyone except the organizer and admins', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const e = await createEvent(org);

      expect(await listIds(fan, {})).not.toContain(e.id);
      await http().get(`/v1/events/${e.id}`).set(fan.auth).expect(404);
      await http().get(`/v1/events/${e.id}`).set(org.auth).expect(200);
      await http().get(`/v1/events/${e.id}`).set(admin.auth).expect(200);

      const mine = await http().get('/v1/events/mine').set(org.auth).expect(200);
      expect(mine.body.data.map((x: { id: string }) => x.id)).toContain(e.id);
    });

    it('only admins can list and review pending events', async () => {
      const org = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      await http().get('/v1/admin/events/pending').set(org.auth).expect(403);
      await http()
        .post(`/v1/admin/events/${e.id}/review`)
        .set(org.auth)
        .send({ decision: 'APPROVED' })
        .expect(403);

      const pending = await http().get('/v1/admin/events/pending').set(admin.auth).expect(200);
      expect(pending.body.data.map((x: { id: string }) => x.id)).toContain(e.id);
      await approve(e.id);

      const fan = await makeUser(app, prisma);
      expect(await listIds(fan, {})).toContain(e.id);
    });

    it('shows the rejection note to the organizer only', async () => {
      const org = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      await http()
        .post(`/v1/admin/events/${e.id}/review`)
        .set(admin.auth)
        .send({ decision: 'REJECTED', note: 'Please add a real venue address.' })
        .expect(200);
      const res = await http().get(`/v1/events/${e.id}`).set(org.auth).expect(200);
      expect(res.body.data).toMatchObject({
        reviewStatus: 'REJECTED',
        reviewNote: 'Please add a real venue address.',
      });
    });

    it('returns 404 for malformed ids', async () => {
      const fan = await makeUser(app, prisma);
      await http().get('/v1/events/not-a-uuid').set(fan.auth).expect(404);
    });
  });

  describe('editing', () => {
    it('only the organizer (or an admin) can edit', async () => {
      const org = await makeOrganizer(app, prisma);
      const otherOrg = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      await approve(e.id);
      await http()
        .patch(`/v1/events/${e.id}`)
        .set(otherOrg.auth)
        .send({ title: 'Hijacked' })
        .expect(403);
      await http()
        .patch(`/v1/events/${e.id}`)
        .set(admin.auth)
        .send({ venueName: 'Main Hall' })
        .expect(200);
    });

    it('sends an approved event back to review when its details change', async () => {
      const org = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      await approve(e.id);
      const res = await http()
        .patch(`/v1/events/${e.id}`)
        .set(org.auth)
        .send({ title: 'Sunset Sessions Vol. 2' })
        .expect(200);
      expect(res.body.data.reviewStatus).toBe('PENDING');
    });

    it('validates end-after-start against stored values', async () => {
      const org = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      await http()
        .patch(`/v1/events/${e.id}`)
        .set(org.auth)
        .send({ endsAt: iso(23 * HOUR) })
        .expect(400);
    });

    it('cancels an event and then blocks edits', async () => {
      const org = await makeOrganizer(app, prisma);
      const e = await createEvent(org);
      const res = await http().post(`/v1/events/${e.id}/cancel`).set(org.auth).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
      await http().post(`/v1/events/${e.id}/cancel`).set(org.auth).expect(200); // idempotent
      await http().patch(`/v1/events/${e.id}`).set(org.auth).send({ title: 'Back on' }).expect(409);
    });
  });

  describe('lineup & schedule', () => {
    it('sets the lineup in billing order and links the event to the artist profile', async () => {
      const org = await makeOrganizer(app, prisma);
      const headliner = await makeArtist(app, prisma);
      const support = await makeArtist(app, prisma);
      const e = await createEvent(org);
      await approve(e.id);

      const res = await http()
        .put(`/v1/events/${e.id}/lineup`)
        .set(org.auth)
        .send({ artistIds: [headliner.artistId, support.artistId] })
        .expect(200);
      expect(res.body.data.lineup.map((a: { id: string }) => a.id)).toEqual([
        headliner.artistId,
        support.artistId,
      ]);
      expect(res.body.data.headliners[0].id).toBe(headliner.artistId);

      const artist = await http().get(`/v1/artists/${support.artistId}`).set(org.auth).expect(200);
      expect(artist.body.data.upcomingEvents.map((x: { id: string }) => x.id)).toContain(e.id);
    });

    it('rejects unknown and duplicate artists', async () => {
      const org = await makeOrganizer(app, prisma);
      const artist = await makeArtist(app, prisma);
      const e = await createEvent(org);
      await http()
        .put(`/v1/events/${e.id}/lineup`)
        .set(org.auth)
        .send({ artistIds: ['0190a6f0-0000-7000-8000-000000000001'] })
        .expect(400);
      await http()
        .put(`/v1/events/${e.id}/lineup`)
        .set(org.auth)
        .send({ artistIds: [artist.artistId, artist.artistId] })
        .expect(400);
    });

    it('only schedules lineup artists, inside the event window', async () => {
      const org = await makeOrganizer(app, prisma);
      const inLineup = await makeArtist(app, prisma);
      const outsider = await makeArtist(app, prisma);
      const e = await createEvent(org);
      await http()
        .put(`/v1/events/${e.id}/lineup`)
        .set(org.auth)
        .send({ artistIds: [inLineup.artistId] })
        .expect(200);

      const slot = { title: 'Main set', startsAt: iso(25 * HOUR), endsAt: iso(26 * HOUR) };
      await http()
        .put(`/v1/events/${e.id}/schedule`)
        .set(org.auth)
        .send({ items: [{ ...slot, artistId: outsider.artistId }] })
        .expect(400);
      await http()
        .put(`/v1/events/${e.id}/schedule`)
        .set(org.auth)
        .send({ items: [{ ...slot, startsAt: iso(40 * HOUR), endsAt: null }] })
        .expect(400);
      const ok = await http()
        .put(`/v1/events/${e.id}/schedule`)
        .set(org.auth)
        .send({ items: [{ ...slot, artistId: inLineup.artistId, stage: 'Main' }] })
        .expect(200);
      expect(ok.body.data.schedule[0]).toMatchObject({
        title: 'Main set',
        stage: 'Main',
        artist: { id: inLineup.artistId },
      });
    });
  });

  describe('following', () => {
    it('follows and unfollows idempotently', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const e = await createEvent(org);
      await http().put(`/v1/events/${e.id}/follow`).set(org.auth).expect(409); // not published yet
      await approve(e.id);

      await http().put(`/v1/events/${e.id}/follow`).set(fan.auth).expect(200);
      const twice = await http().put(`/v1/events/${e.id}/follow`).set(fan.auth).expect(200);
      expect(twice.body.data).toMatchObject({ followerCount: 1, viewer: { isFollowing: true } });

      const following = await http().get('/v1/events/following').set(fan.auth).expect(200);
      expect(following.body.data.map((x: { id: string }) => x.id)).toContain(e.id);

      const off = await http().delete(`/v1/events/${e.id}/follow`).set(fan.auth).expect(200);
      expect(off.body.data).toMatchObject({ followerCount: 0, viewer: { isFollowing: false } });
    });
  });

  describe('discovery lists', () => {
    it('splits events into upcoming, live and past', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const upcoming = await createEvent(org);
      const live = await createEvent(org, { startsAt: iso(-HOUR), endsAt: iso(2 * HOUR) });
      const past = await createEvent(org);
      for (const e of [upcoming, live, past]) await approve(e.id);
      await prisma.event.update({
        where: { id: past.id },
        data: {
          startsAt: new Date(Date.now() - 10 * HOUR),
          endsAt: new Date(Date.now() - 6 * HOUR),
        },
      });

      expect(await listIds(fan, { when: 'upcoming' })).toContain(upcoming.id);
      const liveIds = await listIds(fan, { when: 'live' });
      expect(liveIds).toEqual(expect.arrayContaining([live.id]));
      expect(liveIds).not.toContain(upcoming.id);
      expect(await listIds(fan, { when: 'past' })).toContain(past.id);

      const detail = await http().get(`/v1/events/${live.id}`).set(fan.auth).expect(200);
      expect(detail.body.data.status).toBe('LIVE');
    });

    it('paginates with a cursor without repeats', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const pageCity = uniq('Pagetown');
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const e = await createEvent(org, {
          city: pageCity,
          startsAt: iso((30 + i) * HOUR),
          endsAt: iso((31 + i) * HOUR),
        });
        await approve(e.id);
        ids.push(e.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await http()
          .get('/v1/events')
          .set(fan.auth)
          .query({ city: pageCity, limit: 2, ...(cursor ? { cursor } : {}) })
          .expect(200);
        seen.push(...res.body.data.items.map((e: { id: string }) => e.id));
        cursor = res.body.data.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toEqual(ids);
    });

    it('searches by title and artist name', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const artist = await makeArtist(app, prisma, uniq('Zephyr '));
      const e = await createEvent(org, { title: 'Monsoon Jazz Night' });
      await approve(e.id);
      await http()
        .put(`/v1/events/${e.id}/lineup`)
        .set(org.auth)
        .send({ artistIds: [artist.artistId] })
        .expect(200);

      expect(await listIds(fan, { q: 'monsoon' })).toContain(e.id);
      expect(await listIds(fan, { q: artist.stageName.toLowerCase() })).toContain(e.id);
      expect(await listIds(fan, { q: 'nothing-matches-this' })).toEqual([]);
    });

    it('rejects an invalid cursor', async () => {
      const fan = await makeUser(app, prisma);
      await http().get('/v1/events').set(fan.auth).query({ cursor: 'garbage' }).expect(400);
    });
  });
});

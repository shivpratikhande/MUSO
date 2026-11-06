import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { RewardsService } from '../src/modules/rewards/rewards.service.js';
import {
  cleanupTestUsers,
  createTestApp,
  makeOrganizer,
  makeUser,
  uniq,
  type TestUser,
} from './helpers.js';

const HOUR = 3_600_000;
const RETURN = 'muso://payments/return';
/** Pool windows in distribution tests end in 5 minutes (keeps test sessions' 15-min tokens valid). */
const soon = () => new Date(Date.now() + 5 * 60_000).toISOString();

/**
 * Watch-time crediting depends on real elapsed time between heartbeats, so these tests drive
 * the application clock (Date only — DB/IO timers are untouched).
 */
describe('Reward pools & qualified watch time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

  const liveEvent = async (org: TestUser) =>
    prisma.event.create({
      data: {
        organizerId: org.id,
        title: 'Reward Fest',
        description: 'x',
        venueName: 'Arena',
        city: uniq('Rewardtown'),
        country: 'IN',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 2 * HOUR),
        reviewStatus: 'APPROVED',
      },
    });

  /** A published video tagged to the event (inserted directly: watch tracking doesn't touch media files). */
  const video = async (
    author: TestUser,
    eventId: string,
    durationMs = 4_000,
    extra: Record<string, unknown> = {},
  ) => {
    const id = randomUUID();
    await prisma.post.create({
      data: {
        id,
        authorId: author.id,
        eventId,
        type: 'VIDEO',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        rightsConfirmedAt: new Date(),
        clientRequestId: randomUUID(),
        ...extra,
        media: {
          create: {
            type: 'VIDEO',
            originalKey: `originals/${author.id}/${id}.mp4`,
            mimeType: 'video/mp4',
            sizeBytes: 1,
            durationMs,
            displayKey: `derived/${id}/display.mp4`,
            thumbKey: `derived/${id}/thumb.webp`,
          },
        },
      },
    });
    return id;
  };

  const start = (viewer: TestUser, postId: string, deviceId: string = randomUUID()) =>
    http().post('/v1/watch/sessions').set(viewer.auth).send({ postId, deviceId });
  const beat = (
    viewer: TestUser,
    sessionId: string,
    positionMs: number,
    opts: { playing?: boolean; foreground?: boolean } = {},
  ) =>
    http()
      .post(`/v1/watch/sessions/${sessionId}/heartbeat`)
      .set(viewer.auth)
      .send({ positionMs, playing: opts.playing ?? true, foreground: opts.foreground ?? true })
      .expect(200);

  /** Watches `ms` of a video with well-formed 3s heartbeats. */
  const watch = async (viewer: TestUser, postId: string, ms: number) => {
    const s = await start(viewer, postId).expect(201);
    let pos = 0;
    while (pos < ms) {
      const step = Math.min(3_000, ms - pos);
      advance(Math.max(step, 3_000));
      pos += step;
      await beat(viewer, s.body.data.sessionId, pos);
    }
    return s.body.data.sessionId as string;
  };

  const qualified = async (postId: string, viewerId: string) =>
    (
      await prisma.qualifiedWatchTime.findUnique({
        where: { postId_viewerId: { postId, viewerId } },
      })
    )?.qualifiedMs ?? 0;

  const fundPool = async (org: TestUser, poolId: string) => {
    const c = await http()
      .post('/v1/payments/checkout')
      .set(org.auth)
      .send({ kind: 'POOL_FUNDING', poolId, idempotencyKey: randomUUID(), returnUrl: RETURN })
      .expect(201);
    const u = new URL(c.body.data.checkoutUrl);
    await http()
      .post(`${u.pathname}/complete${u.search}`)
      .type('form')
      .send({ outcome: 'pay' })
      .expect(303);
    const v = await http().post(`/v1/payments/${c.body.data.id}/verify`).set(org.auth).expect(200);
    expect(v.body.data.status).toBe('SUCCEEDED');
    return c.body.data.id as string;
  };

  const createPool = (org: TestUser, eventId: string, over: Record<string, unknown> = {}) =>
    http()
      .post('/v1/reward-pools')
      .set(org.auth)
      .send({
        eventId,
        title: 'Best live videos',
        sponsorName: 'Night Owl Presents',
        budgetMinor: 100_000,
        ...over,
      });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date());
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    await prisma.rewardPool
      .deleteMany({ where: { creator: { email: { endsWith: '@test.muso' } } } })
      .catch(() => undefined);
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('pools', () => {
    it('lets only the event’s organizer create a pool, and hides drafts', async () => {
      const org = await makeOrganizer(app, prisma);
      const other = await makeOrganizer(app, prisma);
      const e = await liveEvent(org);
      await createPool(other, e.id).expect(403);
      await createPool(org, e.id, { budgetMinor: 5_000 }).expect(400); // below ₹100
      const pool = await createPool(org, e.id).expect(201);
      expect(pool.body.data).toMatchObject({
        status: 'DRAFT',
        budgetMinor: 100_000,
        viewer: { canManage: true, canFund: true },
      });
      await http().get(`/v1/reward-pools/${pool.body.data.id}`).set(other.auth).expect(404);
    });

    it('is funded through the verified checkout into escrow, then can’t be cancelled', async () => {
      const org = await makeOrganizer(app, prisma);
      const fan = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const pool = (await createPool(org, e.id).expect(201)).body.data;
      await http()
        .post('/v1/payments/checkout')
        .set(fan.auth)
        .send({
          kind: 'POOL_FUNDING',
          poolId: pool.id,
          idempotencyKey: randomUUID(),
          returnUrl: RETURN,
        })
        .expect(403);

      const paymentId = await fundPool(org, pool.id);
      const after = await http().get(`/v1/reward-pools/${pool.id}`).set(fan.auth).expect(200);
      expect(after.body.data.status).toBe('ACTIVE');
      const escrow = await prisma.ledgerEntry.aggregate({
        where: { account: `pool:${pool.id}:escrow` },
        _sum: { amountMinor: true },
      });
      expect(escrow._sum.amountMinor).toBe(100_000);
      const journals = await prisma.ledgerEntry.groupBy({
        by: ['journalId'],
        where: { paymentId },
        _sum: { amountMinor: true },
      });
      expect(journals.map((j) => j._sum.amountMinor)).toEqual([0]);

      await http()
        .post('/v1/payments/checkout')
        .set(org.auth)
        .send({
          kind: 'POOL_FUNDING',
          poolId: pool.id,
          idempotencyKey: randomUUID(),
          returnUrl: RETURN,
        })
        .expect(409);
      await http().post(`/v1/reward-pools/${pool.id}/cancel`).set(org.auth).expect(409);
      const listed = await http().get(`/v1/events/${e.id}/reward-pools`).set(fan.auth).expect(200);
      expect(listed.body.data.map((p: { id: string }) => p.id)).toContain(pool.id);
    });
  });

  describe('qualified watch time', () => {
    it('credits server-measured time and caps each viewer at one full view', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const v = await video(creator, e.id, 4_000);
      await watch(viewer, v, 4_000);
      expect(await qualified(v, viewer.id)).toBe(4_000);
      await watch(viewer, v, 4_000); // replaying adds nothing
      expect(await qualified(v, viewer.id)).toBe(4_000);
    });

    it('never credits more than real elapsed time, paused or background playback', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const v = await video(creator, e.id, 60_000);
      const s = (await start(viewer, v).expect(201)).body.data.sessionId;
      advance(4_000);
      await beat(viewer, s, 4_000, { playing: false });
      advance(4_000);
      await beat(viewer, s, 8_000, { foreground: false });
      advance(4_000);
      await beat(viewer, s, 12_000); // credited
      advance(60_000);
      await beat(viewer, s, 72_000); // long gap: new segment, no credit
      expect(await qualified(v, viewer.id)).toBe(4_000);
    });

    it('flags sessions with timing anomalies and reverses their credit', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const bot = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const v = await video(creator, e.id, 60_000);
      const s = (await start(bot, v).expect(201)).body.data.sessionId;
      advance(3_000);
      await beat(bot, s, 3_000); // fine
      expect(await qualified(v, bot.id)).toBe(3_000);
      advance(500);
      await beat(bot, s, 3_500); // too fast
      advance(3_000);
      await beat(bot, s, 40_000); // position jump
      advance(100);
      const last = await beat(bot, s, 40_100); // third strike
      expect(last.body.data.status).toBe('FLAGGED');
      expect(await qualified(v, bot.id)).toBe(0);
      const session = await prisma.watchSession.findUniqueOrThrow({ where: { id: s } });
      expect(session).toMatchObject({ status: 'FLAGGED', flagReason: 'timing_anomalies' });
    });

    it('allows one crediting session at a time', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const a = await video(creator, e.id, 60_000);
      const b = await video(creator, e.id, 60_000);
      const s1 = (await start(viewer, a).expect(201)).body.data.sessionId;
      const s2 = (await start(viewer, b).expect(201)).body.data.sessionId;
      advance(3_000);
      expect((await beat(viewer, s1, 3_000)).body.data.status).toBe('ENDED');
      await beat(viewer, s2, 3_000);
      expect(await qualified(a, viewer.id)).toBe(0);
      expect(await qualified(b, viewer.id)).toBe(3_000);
    });

    it('does not let creators, unverified accounts or shared devices qualify', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const unverified = await makeUser(app, prisma, { verified: false });
      const e = await liveEvent(org);
      const v = await video(creator, e.id, 60_000);
      expect((await start(creator, v).expect(201)).body.data.qualifying).toBe(false);
      expect((await start(unverified, v).expect(201)).body.data.qualifying).toBe(false);

      const device = randomUUID();
      const farm = await Promise.all([1, 2, 3, 4].map(() => makeUser(app, prisma)));
      const results = [];
      for (const acct of farm)
        results.push((await start(acct, v, device).expect(201)).body.data.qualifying);
      expect(results).toEqual([true, true, true, false]);
    });

    it('refuses to track locked paid videos and non-videos', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const e = await liveEvent(org);
      const paid = await video(creator, e.id, 10_000, {
        monetizationMode: 'PAY_TO_UNLOCK',
        priceMinor: 4_900,
      });
      await start(viewer, paid).expect(403);
    });
  });

  describe('distribution', () => {
    it('splits the funded pool by qualified watch time, exactly once', async () => {
      const org = await makeOrganizer(app, prisma);
      const [alice, bob, cara] = await Promise.all([1, 2, 3].map(() => makeUser(app, prisma)));
      const viewers = await Promise.all([1, 2, 3].map(() => makeUser(app, prisma)));
      const e = await liveEvent(org);
      const pool = (
        await createPool(org, e.id, {
          perVideoCapBps: 10_000,
          minQualifiedViewers: 3,
          endsAt: soon(),
        }).expect(201)
      ).body.data;
      await fundPool(org, pool.id);

      const a = await video(alice!, e.id, 6_000); // 3 viewers × 6s = 18s
      const b = await video(bob!, e.id, 6_000); //   3 viewers × 3s =  9s
      const c = await video(cara!, e.id, 6_000); //  1 viewer → below minimum, earns nothing
      const own = await video(org, e.id, 6_000); //  funder's own video: excluded
      for (const v of viewers) {
        await watch(v, a, 6_000);
        await watch(v, b, 3_000);
        await watch(v, own, 6_000);
      }
      await watch(viewers[0]!, c, 6_000);

      // While active: live, non-binding estimate on the leaderboard and in Earnings.
      const live = await http().get(`/v1/reward-pools/${pool.id}`).set(org.auth).expect(200);
      expect(live.body.data.estimated).toBe(true);
      const est = await http().get('/v1/earnings').set(alice!.auth).expect(200);
      expect(est.body.data.byStatus.ESTIMATED).toBe(66_667);
      expect(est.body.data.byStatus.AVAILABLE).toBe(0);

      // Window ends → distribution (the timer calls distributeDue; here we target this pool).
      advance(6 * 60_000);
      const rewards = app.get(RewardsService);
      expect(await rewards.distribute(pool.id)).toBe(true);
      expect(await rewards.distribute(pool.id)).toBe(false); // idempotent

      const final = await http().get(`/v1/reward-pools/${pool.id}`).set(alice!.auth).expect(200);
      expect(final.body.data).toMatchObject({
        status: 'DISTRIBUTED',
        estimated: false,
        allocatedMinor: 100_000,
        unallocatedMinor: 0,
      });
      const board = final.body.data.leaderboard.map(
        (r: {
          postId: string;
          shareMinor: number;
          qualifiedSeconds: number;
          eligible: boolean;
        }) => [r.postId, r.shareMinor, r.qualifiedSeconds, r.eligible],
      );
      expect(board).toEqual([
        [a, 66_667, 18, true],
        [b, 33_333, 9, true],
        [c, 0, 6, false],
      ]);

      const earnings = await prisma.earning.findMany({
        where: { rewardPoolId: pool.id },
        orderBy: { netMinor: 'desc' },
      });
      expect(earnings.map((x) => [x.creatorId, x.netMinor, x.source, x.status])).toEqual([
        [alice!.id, 66_667, 'WATCH_REWARD', 'PENDING'],
        [bob!.id, 33_333, 'WATCH_REWARD', 'PENDING'],
      ]);
      const escrow = await prisma.ledgerEntry.aggregate({
        where: { account: `pool:${pool.id}:escrow` },
        _sum: { amountMinor: true },
      });
      expect(escrow._sum.amountMinor).toBe(0);
      const n = await http().get('/v1/notifications').set(bob!.auth).expect(200);
      expect(n.body.data.items.map((x: { type: string }) => x.type)).toContain('REWARD_EARNED');
    });

    it('caps a single video’s share and keeps the rest in escrow when everyone is capped', async () => {
      const org = await makeOrganizer(app, prisma);
      const creator = await makeUser(app, prisma);
      const viewers = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
      const e = await liveEvent(org);
      const pool = (
        await createPool(org, e.id, {
          perVideoCapBps: 2_500,
          minQualifiedViewers: 2,
          endsAt: soon(),
        }).expect(201)
      ).body.data;
      await fundPool(org, pool.id);
      const v = await video(creator, e.id, 3_000);
      for (const viewer of viewers) await watch(viewer, v, 3_000);
      advance(6 * 60_000);
      expect(await app.get(RewardsService).distribute(pool.id)).toBe(true);
      const final = await http().get(`/v1/reward-pools/${pool.id}`).set(org.auth).expect(200);
      expect(final.body.data).toMatchObject({ allocatedMinor: 25_000, unallocatedMinor: 75_000 });
      expect(final.body.data.leaderboard[0]).toMatchObject({ shareMinor: 25_000, capped: true });
      const escrow = await prisma.ledgerEntry.aggregate({
        where: { account: `pool:${pool.id}:escrow` },
        _sum: { amountMinor: true },
      });
      expect(escrow._sum.amountMinor).toBe(75_000);
    });
  });

  it('builds event leaderboards from verified data', async () => {
    const org = await makeOrganizer(app, prisma);
    const creator = await makeUser(app, prisma);
    const viewer = await makeUser(app, prisma);
    const e = await liveEvent(org);
    const v = await video(creator, e.id, 6_000);
    await watch(viewer, v, 6_000);
    await watch(creator, v, 6_000); // self-views never count
    const res = await http().get(`/v1/events/${e.id}/leaderboards`).set(viewer.auth).expect(200);
    expect(res.body.data.watchTime).toEqual([
      expect.objectContaining({ creatorId: creator.id, qualifiedSeconds: 6 }),
    ]);
  });
});

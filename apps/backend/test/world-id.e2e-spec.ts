import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RewardStandings } from '../src/modules/rewards/reward-standings.service.js';
import {
  WORLD_ID_VERIFIER,
  type WorldIdVerifier,
  type WorldIdVerifyResponse,
} from '../src/modules/world-id/world-id.verifier.js';
import { cleanupTestUsers, makeOrganizer, makeUser, uniq, type TestUser } from './helpers.js';

const HOUR = 3_600_000;

/** Stands in for World's Developer Portal verifier: records calls, answers as configured. */
class FakeVerifier implements WorldIdVerifier {
  calls: { rpId: string; body: unknown }[] = [];
  next: { status: number; json: WorldIdVerifyResponse } | null = null;
  async verify(rpId: string, body: unknown) {
    this.calls.push({ rpId, body });
    if (this.next) return this.next;
    const b = body as { action: string; environment: string; responses: { nullifier: string }[] };
    return {
      status: 200,
      json: {
        success: true,
        action: b.action,
        environment: b.environment,
        nullifier: b.responses[0]!.nullifier,
        results: [
          { identifier: 'proof_of_human', success: true, nullifier: b.responses[0]!.nullifier },
        ],
      },
    };
  }
}

/** An IDKit v4 uniqueness result, shaped like World App returns it. */
const idkitResult = (
  userId: string,
  nullifier = `0x${randomBytes(31).toString('hex')}`,
  over = {},
) => ({
  protocol_version: '4.0',
  nonce: randomUUID(),
  action: 'muso-creator-rewards',
  environment: 'staging',
  responses: [
    {
      identifier: 'proof_of_human',
      signal_hash: hashSignal(userId),
      proof: ['0x1', '0x2', '0x3', '0x4', '0x5'],
      nullifier,
      issuer_schema_id: 1,
      expires_at_min: 1_900_000_000,
    },
  ],
  ...over,
});

describe('World ID proof of human (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const verifier = new FakeVerifier();
  const http = () => request(app.getHttpServer());
  const verify = (u: TestUser, result: unknown) =>
    http().post('/v1/me/human/verify').set(u.auth).send({ result });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WORLD_ID_VERIFIER)
      .useValue(verifier)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => {
    verifier.next = null;
    verifier.calls = [];
  });
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('signs a request context on the server and binds it to the account', async () => {
    const u = await makeUser(app, prisma);
    expect((await http().get('/v1/me/human').set(u.auth).expect(200)).body.data).toEqual({
      enabled: true,
      verified: false,
      verifiedAt: null,
    });
    const ctx = (await http().post('/v1/me/human/context').set(u.auth).expect(200)).body.data;
    expect(ctx).toMatchObject({
      app_id: 'app_staging_muso_test',
      action: 'muso-creator-rewards',
      environment: 'staging',
      signal: u.id,
      rp_context: { rp_id: 'rp_muso_test' },
    });
    expect(ctx.rp_context.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(ctx.rp_context.expires_at).toBeGreaterThan(ctx.rp_context.created_at);
    expect(JSON.stringify(ctx)).not.toContain(process.env['WORLD_ID_SIGNING_KEY']!);
  });

  it('verifies with World, forwards the result unchanged and stores the nullifier', async () => {
    const u = await makeUser(app, prisma);
    const result = idkitResult(u.id);
    const res = await verify(u, result).expect(200);
    expect(res.body.data).toMatchObject({ verified: true });
    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0]).toEqual({ rpId: 'rp_muso_test', body: result });
    const row = await prisma.humanVerification.findUniqueOrThrow({ where: { userId: u.id } });
    expect(row.nullifier.toFixed()).toBe(BigInt(result.responses[0]!.nullifier).toString());
    // Verifying again is a no-op (no second call to World).
    await verify(u, idkitResult(u.id)).expect(200);
    expect(verifier.calls).toHaveLength(1);
  });

  it('refuses one human on two accounts (same nullifier)', async () => {
    const a = await makeUser(app, prisma);
    const b = await makeUser(app, prisma);
    const nullifier = `0x${randomBytes(31).toString('hex')}`;
    await verify(a, idkitResult(a.id, nullifier)).expect(200);
    const dup = await verify(b, idkitResult(b.id, nullifier)).expect(409);
    expect(dup.body.error.message).toMatch(/another MUSO account/);
    expect((await http().get('/v1/me/human').set(b.auth).expect(200)).body.data.verified).toBe(
      false,
    );
  });

  it('grants nothing for cancelled, rejected, replayed or mismatched proofs', async () => {
    const u = await makeUser(app, prisma);
    const other = await makeUser(app, prisma);
    // Wrong environment / action: rejected before calling World.
    await verify(u, idkitResult(u.id, undefined, { environment: 'production' })).expect(400);
    await verify(u, idkitResult(u.id, undefined, { action: 'some-other-action' })).expect(400);
    // A proof made for another account (signal) can't be replayed here.
    await verify(u, idkitResult(other.id)).expect(400);
    expect(verifier.calls).toHaveLength(0);
    // World rejects the proof.
    verifier.next = {
      status: 400,
      json: {
        success: false,
        code: 'all_verifications_failed',
        detail: 'All proof verifications failed.',
      },
    };
    const r = await verify(u, idkitResult(u.id)).expect(400);
    expect(r.body.error.message).toMatch(/All proof verifications failed/);
    // World answers success but for another environment.
    verifier.next = {
      status: 200,
      json: { success: true, environment: 'production', nullifier: '0x1' },
    };
    await verify(u, idkitResult(u.id)).expect(400);
    // Malformed body (e.g. the user cancelled and the app sent nothing useful).
    await http()
      .post('/v1/me/human/verify')
      .set(u.auth)
      .send({ result: { environment: 'staging' } })
      .expect(400);
    expect((await http().get('/v1/me/human').set(u.auth).expect(200)).body.data.verified).toBe(
      false,
    );
    expect(await prisma.humanVerification.count({ where: { userId: u.id } })).toBe(0);
  });

  describe('human-only reward pools', () => {
    const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date());
    });
    afterEach(() => vi.useRealTimers());

    const video = async (author: TestUser, eventId: string) => {
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
          media: {
            create: {
              type: 'VIDEO',
              originalKey: `originals/${author.id}/${id}.mp4`,
              mimeType: 'video/mp4',
              sizeBytes: 1,
              durationMs: 6_000,
              displayKey: `derived/${id}/display.mp4`,
              thumbKey: `derived/${id}/thumb.webp`,
            },
          },
        },
      });
      return id;
    };
    const watch = async (viewer: TestUser, postId: string) => {
      const s = await http()
        .post('/v1/watch/sessions')
        .set(viewer.auth)
        .send({ postId, deviceId: randomUUID() })
        .expect(201);
      for (const pos of [3_000, 6_000]) {
        advance(3_000);
        await http()
          .post(`/v1/watch/sessions/${s.body.data.sessionId}/heartbeat`)
          .set(viewer.auth)
          .send({ positionMs: pos, playing: true, foreground: true })
          .expect(200);
      }
    };

    it('pays only verified humans; unverified creators are shown but earn nothing', async () => {
      const org = await makeOrganizer(app, prisma);
      const human = await makeUser(app, prisma);
      const unverified = await makeUser(app, prisma);
      const viewers = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
      await verify(human, idkitResult(human.id)).expect(200);
      // Viewers prove they're human too; a bot account's watching doesn't count.
      for (const v of viewers) await verify(v, idkitResult(v.id)).expect(200);
      const bot = await makeUser(app, prisma);
      const e = await prisma.event.create({
        data: {
          organizerId: org.id,
          title: 'Human Fest',
          description: 'x',
          venueName: 'Arena',
          city: uniq('Humantown'),
          country: 'IN',
          startsAt: new Date(Date.now() - HOUR),
          endsAt: new Date(Date.now() + 2 * HOUR),
          reviewStatus: 'APPROVED',
        },
      });
      const pool = (
        await http()
          .post('/v1/reward-pools')
          .set(org.auth)
          .send({
            eventId: e.id,
            title: 'Humans only',
            sponsorName: 'Night Owl',
            budgetMinor: 100_000,
            perVideoCapBps: 10_000,
            minQualifiedViewers: 2,
            humanOnly: true,
            endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          })
          .expect(201)
      ).body.data;
      expect(pool.humanOnly).toBe(true);
      // Marked funded directly: funding paths are covered by the payments and Arc suites.
      await prisma.rewardPool.update({
        where: { id: pool.id },
        data: { status: 'FUNDED', fundedAt: new Date() },
      });
      const hv = await video(human, e.id);
      const uv = await video(unverified, e.id);
      for (const v of viewers) {
        await watch(v, hv);
        await watch(v, uv);
      }
      await watch(bot, hv); // unverified viewer: ignored
      const live = (await http().get(`/v1/reward-pools/${pool.id}`).set(org.auth).expect(200)).body
        .data;
      const row = (id: string) => live.leaderboard.find((r: { postId: string }) => r.postId === id);
      expect(row(hv)).toMatchObject({ eligible: true, needsHuman: false, shareMinor: 100_000 });
      expect(row(hv).qualifiedViewers).toBe(2); // the unverified viewer isn't counted
      expect(row(uv)).toMatchObject({ eligible: false, needsHuman: true, shareMinor: 0 });

      // Final split at the end of the window: only the verified human is paid.
      const standings = await app
        .get(RewardStandings)
        .compute(await prisma.rewardPool.findUniqueOrThrow({ where: { id: pool.id } }));
      expect(standings.standings.filter((s) => s.shareMinor > 0).map((s) => s.creatorId)).toEqual([
        human.id,
      ]);
    });
  });
});

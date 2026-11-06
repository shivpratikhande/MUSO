import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { EarningsService } from '../src/modules/payments/earnings.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import {
  cleanupTestUsers,
  createTestApp,
  makeArtist,
  makeUser,
  uploadOriginal,
  waitForPost,
  type TestUser,
} from './helpers.js';
import { jpegWithGps } from './media-fixtures.js';

const RETURN = 'muso://payments/return';
const DAY = 86_400_000;

describe('Monetization: pricing, checkout, entitlements, earnings, ledger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photo: Buffer;
  const http = () => request(app.getHttpServer());

  const publish = async (user: TestUser, pricing?: unknown, artistIds: string[] = []) => {
    const key = await uploadOriginal(app, user, 'PHOTO', photo, 'image/jpeg');
    const res = await http()
      .post('/v1/posts')
      .set(user.auth)
      .send({
        clientRequestId: randomUUID(),
        mediaKey: key,
        type: 'PHOTO',
        rightsConfirmed: true,
        artistIds,
        ...(pricing ? { pricing } : {}),
      });
    if (res.status !== 201) return res;
    return { status: 201, body: { data: await waitForPost(app, user, res.body.data.id) } };
  };
  const paidPost = async (
    author: TestUser,
    pricing: unknown = { mode: 'PAY_TO_UNLOCK', priceMinor: 4900 },
  ) => {
    const r = await publish(author, pricing);
    expect(r.status).toBe(201);
    return r.body.data as { id: string };
  };

  const checkout = (payer: TestUser, body: Record<string, unknown>) =>
    http()
      .post('/v1/payments/checkout')
      .set(payer.auth)
      .send({ idempotencyKey: randomUUID(), returnUrl: RETURN, ...body });

  /** Acts as the payer on the hosted (sandbox) checkout page. */
  const complete = async (checkoutUrl: string, outcome: 'pay' | 'decline' | 'cancel') => {
    const u = new URL(checkoutUrl);
    return http().post(`${u.pathname}/complete${u.search}`).type('form').send({ outcome });
  };

  const verify = (payer: TestUser, id: string) =>
    http().post(`/v1/payments/${id}/verify`).set(payer.auth).expect(200);

  const buy = async (payer: TestUser, postId: string, extra: Record<string, unknown> = {}) => {
    const c = await checkout(payer, { kind: 'UNLOCK', postId, ...extra }).expect(201);
    await complete(c.body.data.checkoutUrl, 'pay');
    return (await verify(payer, c.body.data.id)).body.data;
  };

  const journalSums = async (paymentId: string) => {
    const rows = await prisma.ledgerEntry.groupBy({
      by: ['journalId'],
      where: { paymentId },
      _sum: { amountMinor: true },
    });
    return rows.map((r) => r._sum.amountMinor);
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    photo = await jpegWithGps();
  });
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('exposes fees and test mode to the app', async () => {
    const u = await makeUser(app, prisma);
    const res = await http().get('/v1/payments/config').set(u.auth).expect(200);
    expect(res.body.data).toEqual({
      feeBpsSales: 1000,
      feeBpsTips: 500,
      testMode: true,
      provider: 'sandbox',
    });
  });

  describe('pricing & consent', () => {
    it('only lets fans sell captures of artists who allow it', async () => {
      const fan = await makeUser(app, prisma);
      const strict = await makeArtist(app, prisma); // default: PERSONAL_SHARING_ONLY
      const open = await makeArtist(app, prisma);
      await prisma.artistProfile.update({
        where: { id: open.artistId },
        data: { contentUsagePolicy: 'FAN_MONETIZATION_ALLOWED' },
      });
      const price = { mode: 'PAY_TO_UNLOCK', priceMinor: 4900 };

      const refused = await publish(fan, price, [strict.artistId]);
      expect(refused.status).toBe(403);
      expect(refused.body.error.message).toMatch(/hasn’t allowed fans to sell/);
      expect((await publish(fan, price, [open.artistId])).status).toBe(201);
      expect((await publish(fan, { mode: 'FREE' }, [strict.artistId])).status).toBe(201); // free is fine
      // Artists can always sell their own content.
      expect((await publish(strict, price, [strict.artistId])).status).toBe(201);
    });

    it('locks paid media for others: no media URL, only a blurred preview', async () => {
      const author = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const post = await paidPost(author);

      const own = await http().get(`/v1/posts/${post.id}`).set(author.auth).expect(200);
      expect(own.body.data).toMatchObject({
        unlocked: true,
        monetization: { mode: 'PAY_TO_UNLOCK', priceMinor: 4900 },
      });

      const locked = await http().get(`/v1/posts/${post.id}`).set(viewer.auth).expect(200);
      expect(locked.body.data).toMatchObject({ unlocked: false, purchased: false });
      expect(locked.body.data.media.url).toBeNull();
      const preview = Buffer.from(
        await (await fetch(locked.body.data.media.thumbUrl)).arrayBuffer(),
      );
      expect((await sharp(preview).metadata()).width).toBe(480);
      await http().get(`/v1/posts/${post.id}/download`).set(viewer.auth).expect(403);
    });
  });

  describe('unlock checkout', () => {
    it('runs the full hosted-checkout flow and grants permanent access', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const post = await paidPost(author);

      const c = await checkout(buyer, { kind: 'UNLOCK', postId: post.id, amountMinor: 1 }).expect(
        201,
      );
      // The client can't set the price of a fixed-price post.
      expect(c.body.data).toMatchObject({
        status: 'PENDING',
        amountMinor: 4900,
        feeMinor: 490,
        creatorReceivesMinor: 4410,
        testMode: true,
      });

      // Hosted page renders, and tampered links are refused.
      const page = await http()
        .get(new URL(c.body.data.checkoutUrl).pathname + new URL(c.body.data.checkoutUrl).search)
        .expect(200);
      expect(page.text).toContain('TEST PAYMENT');
      await http()
        .get(new URL(c.body.data.checkoutUrl).pathname + '?sig=forged')
        .expect(403);

      // Still pending until the provider says otherwise.
      expect((await verify(buyer, c.body.data.id)).body.data.status).toBe('PENDING');
      const done = await complete(c.body.data.checkoutUrl, 'pay');
      expect(done.status).toBe(303);
      expect(done.headers.location).toMatch(/^muso:\/\/payments\/return\?ref=sbx_/);

      const v = await verify(buyer, c.body.data.id);
      expect(v.body.data.status).toBe('SUCCEEDED');

      const unlocked = await http().get(`/v1/posts/${post.id}`).set(buyer.auth).expect(200);
      expect(unlocked.body.data).toMatchObject({ unlocked: true, purchased: true });
      expect((await fetch(unlocked.body.data.media.url)).status).toBe(200);

      // High-res download is metadata-free.
      const dl = await http().get(`/v1/posts/${post.id}/download`).set(buyer.auth).expect(200);
      const full = Buffer.from(await (await fetch(dl.body.data.url)).arrayBuffer());
      const meta = await sharp(full).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width: 640 });
      expect(meta.exif).toBeUndefined();

      // Creator side: pending earning, notification, balanced ledger.
      const earning = await prisma.earning.findUniqueOrThrow({
        where: { paymentId: c.body.data.id },
      });
      expect(earning).toMatchObject({
        status: 'PENDING',
        grossMinor: 4900,
        feeMinor: 490,
        netMinor: 4410,
        source: 'PHOTO_SALE',
      });
      expect(await journalSums(c.body.data.id)).toEqual([0]);
      const n = await http().get('/v1/notifications').set(author.auth).expect(200);
      expect(n.body.data.items.map((x: { type: string }) => x.type)).toContain('CONTENT_PURCHASED');

      // Can't buy twice.
      await checkout(buyer, { kind: 'UNLOCK', postId: post.id }).expect(409);
      // History & library.
      const hist = await http().get('/v1/payments').set(buyer.auth).expect(200);
      expect(hist.body.data.items[0]).toMatchObject({ id: c.body.data.id, status: 'SUCCEEDED' });
      const lib = await http().get('/v1/library').set(buyer.auth).expect(200);
      expect(lib.body.data.map((p: { id: string }) => p.id)).toEqual([post.id]);
    });

    it('fulfils exactly once under concurrent verification', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const post = await paidPost(author);
      const c = await checkout(buyer, { kind: 'UNLOCK', postId: post.id }).expect(201);
      await complete(c.body.data.checkoutUrl, 'pay');
      await Promise.all([1, 2, 3, 4, 5].map(() => verify(buyer, c.body.data.id)));
      expect(await prisma.earning.count({ where: { paymentId: c.body.data.id } })).toBe(1);
      expect(await prisma.contentEntitlement.count({ where: { paymentId: c.body.data.id } })).toBe(
        1,
      );
      expect(await journalSums(c.body.data.id)).toEqual([0]);
    });

    it('is idempotent per key and reuses an open checkout', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const a = await paidPost(author);
      const b = await paidPost(author);
      const key = randomUUID();
      const first = await checkout(buyer, {
        kind: 'UNLOCK',
        postId: a.id,
        idempotencyKey: key,
      }).expect(201);
      const again = await checkout(buyer, {
        kind: 'UNLOCK',
        postId: a.id,
        idempotencyKey: key,
      }).expect(201);
      expect(again.body.data.id).toBe(first.body.data.id);
      await checkout(buyer, { kind: 'UNLOCK', postId: b.id, idempotencyKey: key }).expect(409);
      const other = await checkout(buyer, { kind: 'UNLOCK', postId: a.id }).expect(201); // new key, same post
      expect(other.body.data.id).toBe(first.body.data.id);
    });

    it('records declines and cancellations without granting anything', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const post = await paidPost(author);
      const c1 = await checkout(buyer, { kind: 'UNLOCK', postId: post.id }).expect(201);
      await complete(c1.body.data.checkoutUrl, 'decline');
      expect((await verify(buyer, c1.body.data.id)).body.data).toMatchObject({
        status: 'FAILED',
        failureReason: 'The payment was declined',
      });
      // A second decision on the same checkout is ignored.
      await complete(c1.body.data.checkoutUrl, 'pay');
      expect((await verify(buyer, c1.body.data.id)).body.data.status).toBe('FAILED');

      const c2 = await checkout(buyer, { kind: 'UNLOCK', postId: post.id }).expect(201);
      await complete(c2.body.data.checkoutUrl, 'cancel');
      expect((await verify(buyer, c2.body.data.id)).body.data.status).toBe('CANCELLED');

      expect(await prisma.contentEntitlement.count({ where: { userId: buyer.id } })).toBe(0);
      expect(await prisma.earning.count({ where: { creatorId: author.id } })).toBe(0);
      const p = await http().get(`/v1/posts/${post.id}`).set(buyer.auth).expect(200);
      expect(p.body.data.unlocked).toBe(false);
    });

    it('expires abandoned checkouts and reconciles ones the app never verified', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const a = await paidPost(author);
      const b = await paidPost(author);
      const abandoned = await checkout(buyer, { kind: 'UNLOCK', postId: a.id }).expect(201);
      await prisma.paymentIntent.update({
        where: { id: abandoned.body.data.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await verify(buyer, abandoned.body.data.id)).body.data.status).toBe('EXPIRED');

      const paidButClosed = await checkout(buyer, { kind: 'UNLOCK', postId: b.id }).expect(201);
      await complete(paidButClosed.body.data.checkoutUrl, 'pay'); // app crashed before verifying
      await app.get(PaymentsService).reconcilePending(0);
      const after = await http()
        .get(`/v1/payments/${paidButClosed.body.data.id}`)
        .set(buyer.auth)
        .expect(200);
      expect(after.body.data.status).toBe('SUCCEEDED');
    });

    it('rejects bad checkouts', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const unverified = await makeUser(app, prisma, { verified: false });
      const paid = await paidPost(author);
      const free = (await publish(author)).body.data as { id: string };
      await checkout(author, { kind: 'UNLOCK', postId: paid.id }).expect(400); // own post
      await checkout(buyer, { kind: 'UNLOCK', postId: free.id }).expect(400); // free post
      await checkout(buyer, {
        kind: 'UNLOCK',
        postId: paid.id,
        returnUrl: 'https://evil.example/steal',
      }).expect(400);
      await checkout(unverified, { kind: 'UNLOCK', postId: paid.id }).expect(403);
      await http().post(`/v1/payments/${randomUUID()}/verify`).set(buyer.auth).expect(404);
    });
  });

  describe('pay what you want', () => {
    it('enforces the minimum and charges the chosen amount when gated', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const post = await paidPost(author, {
        mode: 'PAY_WHAT_YOU_WANT',
        suggestedMinor: 5000,
        minimumMinor: 2000,
        gated: true,
      });
      await checkout(buyer, { kind: 'UNLOCK', postId: post.id, amountMinor: 1500 }).expect(400);
      await checkout(buyer, { kind: 'UNLOCK', postId: post.id }).expect(400); // amount required
      const paid = await buy(buyer, post.id, { amountMinor: 7500 });
      expect(paid).toMatchObject({ status: 'SUCCEEDED', amountMinor: 7500 });
    });

    it('is visible to everyone when not gated', async () => {
      const author = await makeUser(app, prisma);
      const viewer = await makeUser(app, prisma);
      const post = await paidPost(author, {
        mode: 'PAY_WHAT_YOU_WANT',
        suggestedMinor: 5000,
        gated: false,
      });
      const p = await http().get(`/v1/posts/${post.id}`).set(viewer.auth).expect(200);
      expect(p.body.data).toMatchObject({ unlocked: true, purchased: false });
    });
  });

  describe('tips', () => {
    it('sends a tip with a 5% fee and notifies the creator', async () => {
      const author = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const post = (await publish(author)).body.data as { id: string };
      await checkout(fan, { kind: 'TIP', postId: post.id, amountMinor: 500 }).expect(400);
      const c = await checkout(fan, {
        kind: 'TIP',
        postId: post.id,
        amountMinor: 10_000,
        message: 'Great shot!',
      }).expect(201);
      expect(c.body.data).toMatchObject({ feeMinor: 500, creatorReceivesMinor: 9500 });
      await complete(c.body.data.checkoutUrl, 'pay');
      expect((await verify(fan, c.body.data.id)).body.data.status).toBe('SUCCEEDED');
      const e = await prisma.earning.findUniqueOrThrow({ where: { paymentId: c.body.data.id } });
      expect(e).toMatchObject({ source: 'TIP', netMinor: 9500 });
      const n = await http().get('/v1/notifications').set(author.auth).expect(200);
      expect(n.body.data.items.map((x: { type: string }) => x.type)).toContain('TIP_RECEIVED');
      // Tips don't unlock anything.
      expect(await prisma.contentEntitlement.count({ where: { userId: fan.id } })).toBe(0);
    });

    it('respects tips being turned off and blocks self-tips', async () => {
      const author = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const post = (await publish(author, { mode: 'FREE', tipsEnabled: false })).body.data as {
        id: string;
      };
      await checkout(fan, { kind: 'TIP', postId: post.id, amountMinor: 2000 }).expect(400);
      const open = (await publish(author)).body.data as { id: string };
      await checkout(author, { kind: 'TIP', postId: open.id, amountMinor: 2000 }).expect(400);
    });
  });

  describe('price changes', () => {
    it('keeps buyers’ access, records history and only lets the author change it', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const stranger = await makeUser(app, prisma);
      const post = await paidPost(author);
      await buy(buyer, post.id);

      await http()
        .patch(`/v1/posts/${post.id}/pricing`)
        .set(stranger.auth)
        .send({ mode: 'FREE' })
        .expect(403);
      const changed = await http()
        .patch(`/v1/posts/${post.id}/pricing`)
        .set(author.auth)
        .send({ mode: 'PAY_TO_UNLOCK', priceMinor: 19_900 })
        .expect(200);
      expect(changed.body.data.monetization.priceMinor).toBe(19_900);

      const forBuyer = await http().get(`/v1/posts/${post.id}`).set(buyer.auth).expect(200);
      expect(forBuyer.body.data.unlocked).toBe(true);
      const forStranger = await http().get(`/v1/posts/${post.id}`).set(stranger.auth).expect(200);
      expect(forStranger.body.data).toMatchObject({
        unlocked: false,
        monetization: { priceMinor: 19_900 },
      });
      expect(await prisma.contentPricingHistory.count({ where: { postId: post.id } })).toBe(1);

      // Making a free post paid later creates the blurred preview on demand.
      const free = (await publish(author)).body.data as { id: string };
      await prisma.postMedia.updateMany({ where: { postId: free.id }, data: { previewKey: null } });
      await http()
        .patch(`/v1/posts/${free.id}/pricing`)
        .set(author.auth)
        .send({ mode: 'PAY_TO_UNLOCK', priceMinor: 2000 })
        .expect(200);
      const nowLocked = await http().get(`/v1/posts/${free.id}`).set(stranger.auth).expect(200);
      expect(nowLocked.body.data.media.thumbUrl).toContain('preview.webp');
    });
  });

  describe('earnings & ledger', () => {
    it('holds earnings as pending, then releases them; only available is withdrawable', async () => {
      const author = await makeUser(app, prisma);
      const buyer = await makeUser(app, prisma);
      const fan = await makeUser(app, prisma);
      const post = await paidPost(author);
      await buy(buyer, post.id);
      const tip = await checkout(fan, { kind: 'TIP', postId: post.id, amountMinor: 2000 }).expect(
        201,
      );
      await complete(tip.body.data.checkoutUrl, 'pay');
      await verify(fan, tip.body.data.id);

      const before = await http().get('/v1/earnings').set(author.auth).expect(200);
      expect(before.body.data.byStatus).toMatchObject({ PENDING: 4410 + 1900, AVAILABLE: 0 });
      expect(before.body.data).toMatchObject({
        grossMinor: 6900,
        feesMinor: 490 + 100,
        netMinor: 6310,
      });
      expect(before.body.data.bySource).toMatchObject({
        PHOTO_SALE: 4900,
        TIP: 2000,
        VIDEO_SALE: 0,
        WATCH_REWARD: 0,
      });
      expect(before.body.data.topPosts[0]).toMatchObject({
        postId: post.id,
        netMinor: 6310,
        count: 2,
      });

      await app.get(EarningsService).releaseDue(new Date(Date.now() + 30 * DAY));
      await app.get(EarningsService).releaseDue(new Date(Date.now() + 30 * DAY)); // idempotent
      const after = await http().get('/v1/earnings').set(author.auth).expect(200);
      expect(after.body.data.byStatus).toMatchObject({ PENDING: 0, AVAILABLE: 6310 });

      // Ledger balances per account match the earnings.
      const bal = await prisma.ledgerEntry.groupBy({
        by: ['account'],
        where: { userId: author.id },
        _sum: { amountMinor: true },
      });
      const byAccount = Object.fromEntries(bal.map((b) => [b.account, b._sum.amountMinor]));
      expect(byAccount).toEqual({
        [`creator:${author.id}:pending`]: 0,
        [`creator:${author.id}:available`]: 6310,
      });
    });

    it('the database refuses edits to the ledger and unbalanced journals', async () => {
      const entry = await prisma.ledgerEntry.findFirstOrThrow();
      await expect(
        prisma.$executeRaw`UPDATE ledger_entries SET amount_minor = 1 WHERE id = ${entry.id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(
        prisma.$executeRaw`DELETE FROM ledger_entries WHERE id = ${entry.id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(
        prisma.ledgerEntry.create({
          data: {
            journalId: randomUUID(),
            account: 'test:unbalanced',
            amountMinor: 100,
            currency: 'INR',
            event: 'TEST',
          },
        }),
      ).rejects.toThrow(/does not balance/);
    });
  });
});

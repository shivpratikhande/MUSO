import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getAddress, verifyMessage, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { walletLinkMessage } from '@muso/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ARC_CHAIN, type ArcCampaign, type ArcChain } from '../src/modules/arc/arc.chain.js';
import { ArcService } from '../src/modules/arc/arc.service.js';
import { RewardsService } from '../src/modules/rewards/rewards.service.js';
import { cleanupTestUsers, makeOrganizer, makeUser, uniq, type TestUser } from './helpers.js';

const HOUR = 3_600_000;
const U = 1_000_000n; // 1 USDC

/** In-memory RewardCampaigns with the deployed contract's rules (allocator-only, after end, once). */
class FakeArcChain implements ArcChain {
  readonly contract = getAddress('0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb');
  readonly allocator = privateKeyToAccount(generatePrivateKey()).address;
  readonly explorerUrl = 'https://testnet.arcscan.app';
  campaigns: ArcCampaign[] = [];
  awards = new Map<string, bigint>();
  claimed = new Set<string>();
  balances = new Map<string, bigint>();
  txs = 0;
  private key = (id: number, a: string) => `${id}:${a.toLowerCase()}`;
  private tx = () => `0x${(++this.txs).toString(16).padStart(64, '0')}` as Hex;

  create(c: Partial<ArcCampaign> & { sponsor: Address; endsAt: number }): number {
    this.campaigns.push({
      title: 'MUSO pool',
      budget: 100n * U,
      maxPerRecipient: 100n * U,
      awardedTotal: 0n,
      allocator: this.allocator,
      awardWindowEnd: c.endsAt + 14 * 86_400,
      reclaimed: false,
      ...c,
    });
    return this.campaigns.length;
  }
  async getCampaign(id: number) {
    return this.campaigns[id - 1] ?? null;
  }
  async awardOf(id: number, a: Address) {
    return this.awards.get(this.key(id, a)) ?? 0n;
  }
  async hasClaimed(id: number, a: Address) {
    return this.claimed.has(this.key(id, a));
  }
  async awardMany(id: number, who: Address[], amounts: bigint[]) {
    const c = this.campaigns[id - 1]!;
    const now = Math.floor(Date.now() / 1000);
    if (now < c.endsAt) throw new Error('AwardingNotStarted');
    if (now > c.awardWindowEnd) throw new Error('AwardWindowClosed');
    let total = c.awardedTotal;
    who.forEach((a, i) => {
      const amt = amounts[i]!;
      if (this.awards.has(this.key(id, a))) throw new Error('AlreadyAwarded');
      if ([c.sponsor, c.allocator].some((x) => x.toLowerCase() === a.toLowerCase()))
        throw new Error('InvalidParticipant');
      if (amt === 0n || amt > c.maxPerRecipient) throw new Error('InvalidAwardAmount');
      total += amt;
      if (total > c.budget) throw new Error('BudgetExceeded');
    });
    who.forEach((a, i) => this.awards.set(this.key(id, a), amounts[i]!));
    c.awardedTotal = total;
    return this.tx();
  }
  async claimFor(id: number, a: Address) {
    const amt = this.awards.get(this.key(id, a));
    if (!amt) throw new Error('NotAwarded');
    if (this.claimed.has(this.key(id, a))) throw new Error('AlreadyClaimed');
    this.claimed.add(this.key(id, a));
    this.balances.set(a.toLowerCase(), (this.balances.get(a.toLowerCase()) ?? 0n) + amt);
    return this.tx();
  }
  verifySignature(address: Address, message: string, signature: Hex) {
    return verifyMessage({ address, message, signature });
  }
}

describe('Arc on-chain reward payouts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const chain = new FakeArcChain();
  const http = () => request(app.getHttpServer());
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

  const linkWallet = async (
    user: TestUser,
    acct: PrivateKeyAccount = privateKeyToAccount(generatePrivateKey()),
  ) => {
    const ch = await http()
      .get('/v1/me/wallet/challenge')
      .query({ address: acct.address })
      .set(user.auth)
      .expect(200);
    const signature = await acct.signMessage({ message: ch.body.data.message });
    await http()
      .put('/v1/me/wallet')
      .set(user.auth)
      .send({ address: acct.address, issuedAt: ch.body.data.issuedAt, signature })
      .expect(200);
    return acct;
  };

  const liveEvent = (org: TestUser) =>
    prisma.event.create({
      data: {
        organizerId: org.id,
        title: 'Arc Fest',
        description: 'x',
        venueName: 'Arena',
        city: uniq('Arctown'),
        country: 'IN',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 2 * HOUR),
        reviewStatus: 'APPROVED',
      },
    });

  const createPool = async (org: TestUser, eventId: string, endsAt: Date) =>
    (
      await http()
        .post('/v1/reward-pools')
        .set(org.auth)
        .send({
          eventId,
          title: 'Best live videos',
          sponsorName: 'Night Owl Presents',
          budgetMinor: 100_000,
          perVideoCapBps: 10_000,
          minQualifiedViewers: 2,
          endsAt: endsAt.toISOString(),
        })
        .expect(201)
    ).body.data as { id: string };

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

  const watch = async (viewer: TestUser, postId: string, ms: number) => {
    const s = await http()
      .post('/v1/watch/sessions')
      .set(viewer.auth)
      .send({ postId, deviceId: randomUUID() })
      .expect(201);
    for (let pos = 3_000; pos <= ms; pos += 3_000) {
      advance(3_000);
      await http()
        .post(`/v1/watch/sessions/${s.body.data.sessionId}/heartbeat`)
        .set(viewer.auth)
        .send({ positionMs: pos, playing: true, foreground: true })
        .expect(200);
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ARC_CHAIN)
      .useValue(chain)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date());
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('wallet linking', () => {
    it('links a wallet only with a valid, fresh signature from that wallet', async () => {
      const user = await makeUser(app, prisma);
      const acct = privateKeyToAccount(generatePrivateKey());
      const ch = (
        await http()
          .get('/v1/me/wallet/challenge')
          .query({ address: acct.address })
          .set(user.auth)
          .expect(200)
      ).body.data;
      expect(ch.message).toContain(`Account: ${user.id}`);

      const wrong = await privateKeyToAccount(generatePrivateKey()).signMessage({
        message: ch.message,
      });
      await http()
        .put('/v1/me/wallet')
        .set(user.auth)
        .send({ address: acct.address, issuedAt: ch.issuedAt, signature: wrong })
        .expect(400);

      // A challenge issued 20 minutes ago is refused even with a valid signature.
      const old = new Date(Date.now() - 20 * 60_000).toISOString();
      const stale = walletLinkMessage({
        userId: user.id,
        address: acct.address,
        chainId: 5042002,
        issuedAt: old,
      });
      await http()
        .put('/v1/me/wallet')
        .set(user.auth)
        .send({
          address: acct.address,
          issuedAt: old,
          signature: await acct.signMessage({ message: stale }),
        })
        .expect(400);

      await linkWallet(user, acct);
      const me = await http().get('/v1/me/wallet').set(user.auth).expect(200);
      expect(me.body.data.address).toBe(acct.address);
    });

    it('refuses a signature made for another account, and one wallet on two accounts', async () => {
      const a = await makeUser(app, prisma);
      const b = await makeUser(app, prisma);
      const acct = privateKeyToAccount(generatePrivateKey());
      const ch = (
        await http()
          .get('/v1/me/wallet/challenge')
          .query({ address: acct.address })
          .set(a.auth)
          .expect(200)
      ).body.data;
      const signature = await acct.signMessage({ message: ch.message });
      await http()
        .put('/v1/me/wallet')
        .set(b.auth)
        .send({ address: acct.address, issuedAt: ch.issuedAt, signature })
        .expect(400); // replayed for b: message names a's account

      await linkWallet(a, acct);
      const ch2 = (
        await http()
          .get('/v1/me/wallet/challenge')
          .query({ address: acct.address })
          .set(b.auth)
          .expect(200)
      ).body.data;
      await http()
        .put('/v1/me/wallet')
        .set(b.auth)
        .send({
          address: acct.address,
          issuedAt: ch2.issuedAt,
          signature: await acct.signMessage({ message: ch2.message }),
        })
        .expect(409);
    });
  });

  describe('funding a pool with an Arc campaign', () => {
    it('checks the campaign on-chain before marking the pool funded', async () => {
      const org = await makeOrganizer(app, prisma);
      const stranger = await makeOrganizer(app, prisma);
      const e = await liveEvent(org);
      const poolEnd = new Date(Date.now() + HOUR);
      const pool = await createPool(org, e.id, poolEnd);
      const endsAt = Math.floor(poolEnd.getTime() / 1000) - 60;
      const sponsor = privateKeyToAccount(generatePrivateKey());
      const fund = (u: TestUser, campaignId: number) =>
        http().post(`/v1/reward-pools/${pool.id}/arc`).set(u.auth).send({ campaignId });

      await fund(org, 999).expect(400); // no such campaign
      const foreign = chain.create({
        sponsor: sponsor.address,
        endsAt,
        allocator: privateKeyToAccount(generatePrivateKey()).address,
      });
      await fund(org, foreign).expect(400); // allocator isn't MUSO
      const id = chain.create({ sponsor: sponsor.address, endsAt, budget: 25n * U + 7n });
      await fund(org, id).expect(403); // organizer hasn't proven they own the sponsor wallet
      await fund(stranger, id).expect(403); // not their pool
      const late = chain.create({ sponsor: sponsor.address, endsAt: endsAt + 3600 });
      await linkWallet(org, sponsor);
      await fund(org, late).expect(400); // campaign ends after the pool

      const res = await fund(org, id).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'ACTIVE',
        currency: 'USD',
        budgetMinor: 2_500, // $25.00 (sub-cent dust stays with the sponsor)
        arc: { campaignId: id, sponsor: sponsor.address.toLowerCase(), chainId: 5042002 },
      });
      await fund(org, id).expect(409);
      const other = await createPool(org, e.id, poolEnd);
      await http()
        .post(`/v1/reward-pools/${other.id}/arc`)
        .set(org.auth)
        .send({ campaignId: id })
        .expect(409);
      // Funded on-chain, so the INR checkout is closed.
      await http()
        .post('/v1/payments/checkout')
        .set(org.auth)
        .send({
          kind: 'POOL_FUNDING',
          poolId: pool.id,
          idempotencyKey: randomUUID(),
          returnUrl: 'muso://x',
        })
        .expect(409);
    });
  });

  describe('paying creators on Arc', () => {
    it('splits by watch time, awards and relays claims, and pays late wallets too', async () => {
      const org = await makeOrganizer(app, prisma);
      const [alice, bob] = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
      const viewers = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
      const e = await liveEvent(org);
      const poolEnd = new Date(Date.now() + 5 * 60_000);
      const pool = await createPool(org, e.id, poolEnd);
      const sponsor = await linkWallet(org);
      const id = chain.create({
        sponsor: sponsor.address,
        endsAt: Math.floor(poolEnd.getTime() / 1000),
        budget: 30n * U,
      });
      await http()
        .post(`/v1/reward-pools/${pool.id}/arc`)
        .set(org.auth)
        .send({ campaignId: id })
        .expect(200);
      const aliceWallet = await linkWallet(alice!);

      const a1 = await video(alice!, e.id);
      const a2 = await video(alice!, e.id);
      const b = await video(bob!, e.id);
      for (const v of viewers) {
        await watch(v, a1, 6_000);
        await watch(v, a2, 3_000);
        await watch(v, b, 3_000);
      }
      // 9s alice (two videos) : 3s bob → $22.50 : $7.50 of $30.
      advance(6 * 60_000);
      expect(await app.get(RewardsService).distribute(pool.id)).toBe(true);
      expect(await prisma.earning.count({ where: { rewardPoolId: pool.id } })).toBe(0);

      const arc = app.get(ArcService);
      expect(await arc.processPayouts()).toEqual({ awarded: 1, claimed: 1 });
      expect(chain.balances.get(aliceWallet.address.toLowerCase())).toBe(22_500_000n);
      expect(await arc.processPayouts()).toEqual({ awarded: 0, claimed: 0 }); // idempotent

      let detail = (await http().get(`/v1/reward-pools/${pool.id}`).set(bob!.auth).expect(200)).body
        .data;
      expect(detail.status).toBe('DISTRIBUTED');
      const byCreator = Object.fromEntries(
        detail.arcPayouts.map((p: { creatorId: string }) => [p.creatorId, p]),
      );
      expect(byCreator[alice!.id]).toMatchObject({ amountMicro: '22500000', status: 'CLAIMED' });
      expect(byCreator[alice!.id].claimTxUrl).toMatch(/^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
      expect(byCreator[bob!.id]).toMatchObject({
        amountMicro: '7500000',
        status: 'WAITING_WALLET',
      });

      // Bob links a wallet later (still inside the 14-day award window) and gets paid.
      const bobWallet = await linkWallet(bob!);
      expect(await arc.processPayouts()).toEqual({ awarded: 1, claimed: 1 });
      expect(chain.balances.get(bobWallet.address.toLowerCase())).toBe(7_500_000n);
      expect(chain.campaigns[id - 1]!.awardedTotal).toBe(30n * U);

      detail = (await http().get(`/v1/reward-pools/${pool.id}`).set(bob!.auth).expect(200)).body
        .data;
      expect(detail.arcPayouts.every((p: { status: string }) => p.status === 'CLAIMED')).toBe(true);
    });

    it('skips creators whose wallet arrives after the award window closes', async () => {
      const org = await makeOrganizer(app, prisma);
      const carol = await makeUser(app, prisma);
      const viewers = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
      const e = await liveEvent(org);
      const poolEnd = new Date(Date.now() + 5 * 60_000);
      const pool = await createPool(org, e.id, poolEnd);
      const sponsor = await linkWallet(org);
      const id = chain.create({
        sponsor: sponsor.address,
        endsAt: Math.floor(poolEnd.getTime() / 1000),
      });
      await http()
        .post(`/v1/reward-pools/${pool.id}/arc`)
        .set(org.auth)
        .send({ campaignId: id })
        .expect(200);
      const v = await video(carol, e.id);
      for (const viewer of viewers) await watch(viewer, v, 3_000);
      advance(6 * 60_000);
      await app.get(RewardsService).distribute(pool.id);
      advance(15 * 86_400_000);
      // (Linked directly: the test session's token has expired by now.)
      await prisma.user.update({
        where: { id: carol.id },
        data: { walletAddress: privateKeyToAccount(generatePrivateKey()).address.toLowerCase() },
      });
      expect(await app.get(ArcService).processPayouts()).toEqual({ awarded: 0, claimed: 0 });
      const p = await prisma.arcPayout.findFirstOrThrow({ where: { poolId: pool.id } });
      expect(p).toMatchObject({ status: 'SKIPPED' });
    });
  });

  describe('browser wallet page (signed links)', () => {
    const RETURN = 'muso://wallet/return';
    const tokenOf = (url: string) => new URL(url).searchParams.get('t')!;

    it('serves the page and links a wallet with only the signed link', async () => {
      const user = await makeUser(app, prisma);
      await http()
        .post('/v1/me/wallet/connect-link')
        .set(user.auth)
        .send({ returnUrl: 'https://evil.example' })
        .expect(400); // app schemes only
      const link = await http()
        .post('/v1/me/wallet/connect-link')
        .set(user.auth)
        .send({ returnUrl: RETURN })
        .expect(200);
      const t = tokenOf(link.body.data.url);
      const page = await http().get('/v1/arc/connect').query({ t }).expect(200);
      expect(page.headers['content-security-policy']).toMatch(/script-src 'nonce-/);

      const info = await http().get('/v1/arc/session').query({ t }).expect(200);
      expect(info.body.data).toMatchObject({
        purpose: 'wallet',
        returnUrl: RETURN,
        allocator: chain.allocator,
        chain: { id: 5042002 },
        linkedWallet: null,
        pool: null,
      });
      await http()
        .get('/v1/arc/session')
        .query({ t: `${t}x` })
        .expect(403); // tampered

      const acct = privateKeyToAccount(generatePrivateKey());
      const ch = await http()
        .post('/v1/arc/session/challenge')
        .query({ t })
        .send({ address: acct.address })
        .expect(200);
      expect(ch.body.data.message).toContain(`Account: ${user.id}`);
      await http()
        .put('/v1/arc/session/wallet')
        .query({ t })
        .send({
          address: acct.address,
          issuedAt: ch.body.data.issuedAt,
          signature: await acct.signMessage({ message: ch.body.data.message }),
        })
        .expect(200);
      const me = await http().get('/v1/me/wallet').set(user.auth).expect(200);
      expect(me.body.data.address).toBe(acct.address);
      // A wallet-link token can't fund pools.
      await http().post('/v1/arc/session/fund').query({ t }).send({ campaignId: 1 }).expect(403);
    });

    it('funds a pool through the page once the campaign exists on-chain', async () => {
      const org = await makeOrganizer(app, prisma);
      const other = await makeOrganizer(app, prisma);
      const e = await liveEvent(org);
      const poolEnd = new Date(Date.now() + HOUR);
      const pool = await createPool(org, e.id, poolEnd);
      await http()
        .post(`/v1/reward-pools/${pool.id}/arc/fund-link`)
        .set(other.auth)
        .send({ returnUrl: RETURN })
        .expect(403);
      const link = await http()
        .post(`/v1/reward-pools/${pool.id}/arc/fund-link`)
        .set(org.auth)
        .send({ returnUrl: RETURN })
        .expect(200);
      const t = tokenOf(link.body.data.url);
      const info = (await http().get('/v1/arc/session').query({ t }).expect(200)).body.data;
      expect(info.pool).toMatchObject({
        id: pool.id,
        endsAt: Math.floor(poolEnd.getTime() / 1000),
        suggestedUsdc: 12, // ₹1,000 at ₹84/$
      });
      // (The page signs the wallet link, then approve + createCampaign happen in the wallet.)
      const sponsor = await linkWallet(org);
      const id = chain.create({
        sponsor: sponsor.address,
        endsAt: info.pool.endsAt,
        budget: 12n * U,
      });
      await http().post('/v1/arc/session/fund').query({ t }).send({ campaignId: id }).expect(200);
      const detail = await http().get(`/v1/reward-pools/${pool.id}`).set(org.auth).expect(200);
      expect(detail.body.data).toMatchObject({
        status: 'ACTIVE',
        budgetMinor: 1_200,
        arc: { campaignId: id },
      });
    });
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getAddress, verifyMessage, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ARC_CHAIN, type ArcChain, type UsdcTransfers } from '../src/modules/arc/arc.chain.js';
import { cleanupTestUsers, makeUser, type TestUser } from './helpers.js';

const RETURN = 'muso://wallet/return';
const USDC = 10_000n; // base units per cent

/** Arc with just the USDC transfers these tests put on it. */
class FakeUsdcChain implements ArcChain {
  readonly contract = getAddress('0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb');
  readonly allocator = privateKeyToAccount(generatePrivateKey()).address;
  readonly explorerUrl = 'https://testnet.arcscan.app';
  txs = new Map<string, UsdcTransfers>();
  private seq = 0;

  /** Mines a transaction with these USDC transfers; returns its hash. */
  mine(transfers: UsdcTransfers['transfers'], opts: { ok?: boolean; at?: number } = {}): Hex {
    const hash = `0x${(++this.seq).toString(16).padStart(64, 'c')}` as Hex;
    this.txs.set(hash, {
      ok: opts.ok ?? true,
      at: opts.at ?? Math.floor(Date.now() / 1000),
      transfers,
    });
    return hash;
  }
  async usdcTransfers(hash: Hex) {
    return this.txs.get(hash) ?? null;
  }
  async findUsdcTransfer(from: Address, to: Address, value: bigint, since: number) {
    const hits = [...this.txs.entries()].filter(
      ([, t]) =>
        t.ok &&
        t.at >= since &&
        t.transfers.some((x) => x.from === from && x.to === to && x.value === value),
    );
    return (hits.at(-1)?.[0] as Hex | undefined) ?? null;
  }
  async verifySignature(address: Address, message: string, signature: Hex) {
    return verifyMessage({ address, message, signature }).catch(() => false);
  }
  async getCampaign() {
    return null;
  }
  async awardOf() {
    return 0n;
  }
  async hasClaimed() {
    return false;
  }
  async awardMany(): Promise<Hex> {
    throw new Error('not used');
  }
  async claimFor(): Promise<Hex> {
    throw new Error('not used');
  }
}

describe('Unlocks and tips in USDC on Arc, wallet to wallet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const chain = new FakeUsdcChain();
  const http = () => request(app.getHttpServer());

  const linkWallet = async (user: TestUser) => {
    const acct: PrivateKeyAccount = privateKeyToAccount(generatePrivateKey());
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
    return acct.address;
  };

  /** A published photo priced in USDC (1.50 USDC to unlock, tips on), made directly in the DB. */
  const usdcPost = async (author: TestUser) => {
    const id = randomUUID();
    await prisma.post.create({
      data: {
        id,
        authorId: author.id,
        type: 'PHOTO',
        caption: 'Front row',
        status: 'PUBLISHED',
        monetizationMode: 'PAY_TO_UNLOCK',
        priceMinor: 150,
        currency: 'USD',
        tipsEnabled: true,
        rightsConfirmedAt: new Date(),
        clientRequestId: randomUUID(),
        media: {
          create: {
            type: 'PHOTO',
            originalKey: `test/${id}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 1000,
          },
        },
      },
    });
    return id;
  };

  const checkout = (payer: TestUser, body: Record<string, unknown>) =>
    http()
      .post('/v1/payments/checkout')
      .set(payer.auth)
      .send({ idempotencyKey: randomUUID(), returnUrl: 'muso://payments/return', ...body });

  /** The signed wallet-page token for a payment (what the page gets from the pairing code). */
  const payToken = async (payer: TestUser, paymentId: string) => {
    const link = await http()
      .post(`/v1/payments/${paymentId}/arc/pay-link`)
      .set(payer.auth)
      .send({ returnUrl: RETURN })
      .expect(200);
    const code = String(link.body.data.code).replace('-', '');
    return (await http().get(`/v1/arc/code/${code}`).expect(200)).body.data.t as string;
  };

  const report = (t: string, txHash: string) =>
    http().post('/v1/arc/session/pay').query({ t }).send({ txHash });

  const setup = async () => {
    const creator = await makeUser(app, prisma);
    const fan = await makeUser(app, prisma);
    const creatorWallet = await linkWallet(creator);
    const fanWallet = await linkWallet(fan);
    const postId = await usdcPost(creator);
    return { creator, fan, creatorWallet, fanWallet, postId };
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
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('unlocks a photo once the exact USDC transfer to the creator is on Arc', async () => {
    const { creator, fan, creatorWallet, fanWallet, postId } = await setup();

    const c = await checkout(fan, { kind: 'UNLOCK', postId }).expect(201);
    expect(c.body.data).toMatchObject({
      provider: 'arc',
      status: 'PENDING',
      currency: 'USD',
      amountMinor: 150,
      feeMinor: 0,
      creatorReceivesMinor: 150,
      checkoutUrl: null,
    });
    const t = await payToken(fan, c.body.data.id);
    const page = await http().get('/v1/arc/session').query({ t }).expect(200);
    expect(page.body.data.purpose).toBe('pay');
    expect(page.body.data.payment).toMatchObject({
      kind: 'UNLOCK',
      amountUsdc: 1.5,
      amountMicro: '1500000',
      payTo: creatorWallet,
    });

    const hash = chain.mine([{ from: fanWallet, to: creatorWallet, value: 150n * USDC }]);
    const paid = await report(t, hash).expect(200);
    expect(paid.body.data.status).toBe('SUCCEEDED');
    expect(paid.body.data.txUrl).toBe(`https://testnet.arcscan.app/tx/${hash}`);

    // Reporting again is harmless.
    await report(t, hash).expect(200);

    const post = await http().get(`/v1/posts/${postId}`).set(fan.auth).expect(200);
    expect(post.body.data.unlocked).toBe(true);
    expect(post.body.data.purchased).toBe(true);

    // The creator already holds the USDC: recorded as paid, nothing withheld, ledger balanced.
    const earning = await prisma.earning.findFirstOrThrow({
      where: { paymentId: c.body.data.id },
    });
    expect(earning).toMatchObject({
      creatorId: creator.id,
      status: 'PAID',
      grossMinor: 150,
      feeMinor: 0,
      netMinor: 150,
      currency: 'USD',
    });
    const sums = await prisma.ledgerEntry.groupBy({
      by: ['journalId'],
      where: { paymentId: c.body.data.id },
      _sum: { amountMinor: true },
    });
    expect(sums.map((r) => r._sum.amountMinor)).toEqual([0]);
  });

  it('refuses transfers that are wrong, failed, old or already used — nothing is granted', async () => {
    const { fan, creatorWallet, fanWallet, postId } = await setup();
    const c = await checkout(fan, { kind: 'UNLOCK', postId }).expect(201);
    const t = await payToken(fan, c.body.data.id);
    const stranger = privateKeyToAccount(generatePrivateKey()).address;
    const amount = 150n * USDC;

    const cases: Hex[] = [
      chain.mine([{ from: fanWallet, to: creatorWallet, value: amount - 1n }]), // too little
      chain.mine([{ from: fanWallet, to: stranger, value: amount }]), // wrong recipient
      chain.mine([{ from: stranger, to: creatorWallet, value: amount }]), // not the fan's wallet
      chain.mine([{ from: fanWallet, to: creatorWallet, value: amount }], { ok: false }), // reverted
      chain.mine([{ from: fanWallet, to: creatorWallet, value: amount }], {
        at: Math.floor(Date.now() / 1000) - 3600, // before this checkout
      }),
    ];
    for (const hash of cases) await report(t, hash).expect(400);
    await report(t, `0x${'0'.repeat(64)}`).expect(400); // not on Arc
    await report(t, 'not-a-hash').expect(400);

    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: c.body.data.id } });
    expect(row.status).toBe('PENDING');
    expect(await prisma.contentEntitlement.count({ where: { userId: fan.id, postId } })).toBe(0);

    // A real payment can't be reused for a second purchase by someone else.
    const good = chain.mine([{ from: fanWallet, to: creatorWallet, value: amount }]);
    await report(t, good).expect(200);
    const other = await makeUser(app, prisma);
    await linkWallet(other);
    const c2 = await checkout(other, { kind: 'UNLOCK', postId }).expect(201);
    const t2 = await payToken(other, c2.body.data.id);
    await report(t2, good).expect(400);
  });

  it('finds a tip on-chain when the wallet page never reported back', async () => {
    const { creator, fan, creatorWallet, fanWallet, postId } = await setup();
    const c = await checkout(fan, {
      kind: 'TIP',
      postId,
      amountMinor: 200,
      message: 'Great shot',
    }).expect(201);
    expect(c.body.data).toMatchObject({ provider: 'arc', amountMinor: 200, feeMinor: 0 });

    const before = await http()
      .post(`/v1/payments/${c.body.data.id}/arc/check`)
      .set(fan.auth)
      .expect(200);
    expect(before.body.data.status).toBe('PENDING');

    chain.mine([{ from: fanWallet, to: creatorWallet, value: 200n * USDC }]);
    const after = await http()
      .post(`/v1/payments/${c.body.data.id}/arc/check`)
      .set(fan.auth)
      .expect(200);
    expect(after.body.data.status).toBe('SUCCEEDED');
    const earning = await prisma.earning.findFirstOrThrow({
      where: { paymentId: c.body.data.id },
    });
    expect(earning).toMatchObject({ creatorId: creator.id, source: 'TIP', status: 'PAID' });

    // Someone else can't check (or see) this payment.
    await http().post(`/v1/payments/${c.body.data.id}/arc/check`).set(creator.auth).expect(404);
  });

  it('enforces USDC limits and needs the creator’s wallet', async () => {
    const creator = await makeUser(app, prisma);
    const fan = await makeUser(app, prisma);
    const postId = await usdcPost(creator);
    // No creator wallet yet: there's nowhere to send USDC.
    await checkout(fan, { kind: 'UNLOCK', postId }).expect(400);
    await linkWallet(creator);
    await checkout(fan, { kind: 'TIP', postId, amountMinor: 49 }).expect(400); // < 0.50 USDC
    await checkout(fan, { kind: 'TIP', postId, amountMinor: 20_001 }).expect(400); // > 200 USDC
    await checkout(fan, { kind: 'TIP', postId, amountMinor: 50 }).expect(201);
    // No verified email needed: the wallet signature identifies the payer.
    const unverified = await makeUser(app, prisma, { verified: false });
    await checkout(unverified, { kind: 'UNLOCK', postId }).expect(201);
    // Creators price USDC posts within 0.50–100 USDC.
    await http()
      .patch(`/v1/posts/${postId}/pricing`)
      .set(creator.auth)
      .send({ mode: 'PAY_TO_UNLOCK', priceMinor: 20_000 })
      .expect(400);
    await http()
      .patch(`/v1/posts/${postId}/pricing`)
      .set(creator.auth)
      .send({ mode: 'PAY_TO_UNLOCK', priceMinor: 250 })
      .expect(200);
  });
});

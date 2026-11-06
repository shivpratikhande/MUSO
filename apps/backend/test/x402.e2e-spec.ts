import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  encodePaymentSignatureHeader,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from '@x402/core/http';
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { X402_FACILITATOR, hashscanUrl, inrToUsdMoney } from '../src/modules/x402/x402.service.js';
import {
  cleanupTestUsers,
  makeUser,
  uploadOriginal,
  waitForPost,
  type TestUser,
} from './helpers.js';
import { jpegWithGps } from './media-fixtures.js';

/**
 * Stand-in for the x402 facilitator (x402.org / Blocky402). Real settlement on Hedera testnet
 * is exercised by the agent demo against the live facilitator; here we control its answers to
 * test MUSO's side: requirements, verification handling, idempotent recording, access.
 */
class FakeFacilitator {
  settleCalls = 0;
  verifyValid = true;
  settleOk = true;
  txSeq = 0;
  async getSupported() {
    return {
      kinds: [
        {
          x402Version: 2,
          scheme: 'exact',
          network: 'hedera:testnet',
          extra: { feePayer: '0.0.9185802' },
        },
      ],
      extensions: [],
      signers: {},
    };
  }
  async verify(payload: PaymentPayload) {
    return this.verifyValid
      ? { isValid: true, payer: String(payload.payload['payer'] ?? '0.0.5555') }
      : { isValid: false, invalidReason: 'invalid_transaction' };
  }
  async settle(payload: PaymentPayload, req: PaymentRequirements) {
    this.settleCalls++;
    if (!this.settleOk)
      return {
        success: false,
        errorReason: 'insufficient_funds',
        transaction: '',
        network: req.network,
      };
    const tx = String(
      payload.payload['tx'] ?? `0.0.5555@1762400000.${String(++this.txSeq).padStart(9, '0')}`,
    );
    return {
      success: true,
      transaction: tx,
      network: req.network,
      payer: String(payload.payload['payer'] ?? '0.0.5555'),
    };
  }
}

describe('x402 on Hedera: agents buy paid content (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const facilitator = new FakeFacilitator();
  const http = () => request(app.getHttpServer());

  const paidPost = async (author: TestUser, priceMinor = 4_900) => {
    const key = await uploadOriginal(app, author, 'PHOTO', await jpegWithGps(), 'image/jpeg');
    const res = await http()
      .post('/v1/posts')
      .set(author.auth)
      .send({
        clientRequestId: randomUUID(),
        mediaKey: key,
        type: 'PHOTO',
        rightsConfirmed: true,
        pricing: { mode: 'PAY_TO_UNLOCK', priceMinor },
      })
      .expect(201);
    return (await waitForPost(app, author, res.body.data.id)).id as string;
  };

  const pay = (postId: string, required: PaymentRequired, payload: Record<string, unknown> = {}) =>
    http()
      .get(`/v1/x402/posts/${postId}/content`)
      .set(
        'PAYMENT-SIGNATURE',
        encodePaymentSignatureHeader({
          x402Version: 2,
          resource: required.resource,
          accepted: required.accepts[0]!,
          payload: { transaction: 'dGVzdA==', ...payload },
        }),
      );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(X402_FACILITATOR)
      .useValue(facilitator)
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

  it('converts INR prices to USDC and formats HashScan links', () => {
    expect(inrToUsdMoney(4_900, 84)).toBe('$0.59');
    expect(inrToUsdMoney(1, 84)).toBe('$0.01');
    expect(hashscanUrl('hedera:testnet', '0.0.5555@1762400000.000000001')).toBe(
      'https://hashscan.io/testnet/transaction/0.0.5555-1762400000-000000001',
    );
  });

  it('publishes a discovery document and a catalogue of paid content', async () => {
    const author = await makeUser(app, prisma);
    const id = await paidPost(author);
    const wk = await http().get('/.well-known/x402').expect(200);
    expect(wk.body).toMatchObject({ service: 'MUSO', network: 'hedera:testnet', asset: 'USDC' });
    expect(wk.body.catalog).toMatch(/\/v1\/x402\/catalog$/);
    const cat = await http().get('/v1/x402/catalog').expect(200);
    const item = cat.body.items.find((i: { id: string }) => i.id === id);
    expect(item).toMatchObject({
      type: 'PHOTO',
      price: { inrMinor: 4_900, usd: '$0.59', asset: 'USDC', network: 'hedera:testnet' },
    });
    expect(item.endpoint).toMatch(new RegExp(`/v1/x402/posts/${id}/content$`));
  });

  it('answers 402 with Hedera USDC payment requirements', async () => {
    const author = await makeUser(app, prisma);
    const id = await paidPost(author);
    const res = await http().get(`/v1/x402/posts/${id}/content`).expect(402);
    const fromHeader = decodePaymentRequiredHeader(res.headers['payment-required']);
    expect(fromHeader).toEqual(res.body);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: 'hedera:testnet',
      asset: '0.0.429274', // Circle USDC on Hedera testnet
      amount: '590000', // $0.59 with 6 decimals
      payTo: '0.0.7777',
    });
    expect(res.body.accepts[0].extra.feePayer).toBe('0.0.9185802');
  });

  it('settles, records the sale for the creator, and returns the content — exactly once per transaction', async () => {
    const author = await makeUser(app, prisma);
    const id = await paidPost(author);
    const required = (await http().get(`/v1/x402/posts/${id}/content`).expect(402))
      .body as PaymentRequired;

    const tx = `0.0.6001@1762400123.${Date.now() % 1e9}`;
    const ok = await pay(id, required, { tx, payer: '0.0.6001' }).expect(200);
    expect(ok.body).toMatchObject({
      postId: id,
      type: 'PHOTO',
      alreadyRecorded: false,
      settlement: { transaction: tx, payer: '0.0.6001' },
    });
    expect(ok.body.settlement.hashscan).toContain(
      'hashscan.io/testnet/transaction/0.0.6001-1762400123-',
    );
    expect(decodePaymentResponseHeader(ok.headers['payment-response'])).toMatchObject({
      success: true,
      transaction: tx,
    });
    expect((await fetch(ok.body.mediaUrl)).status).toBe(200);

    // The creator got a normal sale: payment, entitlement for the agent, pending earning, balanced ledger.
    const payment = await prisma.paymentIntent.findUniqueOrThrow({
      where: { provider_providerRef: { provider: 'hedera-x402', providerRef: tx } },
    });
    expect(payment).toMatchObject({
      status: 'SUCCEEDED',
      amountMinor: 4_900,
      payeeId: author.id,
      kind: 'UNLOCK',
    });
    const earning = await prisma.earning.findUniqueOrThrow({ where: { paymentId: payment.id } });
    expect(earning).toMatchObject({
      grossMinor: 4_900,
      feeMinor: 490,
      netMinor: 4_410,
      status: 'PENDING',
    });
    const journals = await prisma.ledgerEntry.groupBy({
      by: ['journalId'],
      where: { paymentId: payment.id },
      _sum: { amountMinor: true },
    });
    expect(journals.map((j) => j._sum.amountMinor)).toEqual([0]);
    const agent = await prisma.user.findUniqueOrThrow({
      where: { email: 'agent-0.0.6001@agents.muso.invalid' },
    });
    expect(await prisma.contentEntitlement.count({ where: { userId: agent.id, postId: id } })).toBe(
      1,
    );

    // Replaying the same settled transaction never double-records.
    const replay = await pay(id, required, { tx, payer: '0.0.6001' }).expect(200);
    expect(replay.body.alreadyRecorded).toBe(true);
    expect(await prisma.earning.count({ where: { creatorId: author.id } })).toBe(1);
  });

  it('refuses invalid or unsettled payments and tampered requirements', async () => {
    const author = await makeUser(app, prisma);
    const id = await paidPost(author);
    const required = (await http().get(`/v1/x402/posts/${id}/content`).expect(402))
      .body as PaymentRequired;

    facilitator.verifyValid = false;
    const bad = await pay(id, required).expect(402);
    expect(bad.body.error).toBe('invalid_transaction');
    facilitator.verifyValid = true;

    facilitator.settleOk = false;
    const unsettled = await pay(id, required).expect(402);
    expect(unsettled.body.error).toBe('insufficient_funds');
    facilitator.settleOk = true;

    // Agent tries to pay less than the price.
    const cheap = { ...required, accepts: [{ ...required.accepts[0]!, amount: '1' }] };
    const tampered = await pay(id, cheap).expect(402);
    expect(tampered.body.error).toMatch(/does not match/);

    await http()
      .get(`/v1/x402/posts/${id}/content`)
      .set('PAYMENT-SIGNATURE', 'not-base64-json')
      .expect(400);
    expect(await prisma.earning.count({ where: { creatorId: author.id } })).toBe(0);
  });

  it('only sells fixed-price posts', async () => {
    const author = await makeUser(app, prisma);
    const key = await uploadOriginal(app, author, 'PHOTO', await jpegWithGps(), 'image/jpeg');
    const free = await http()
      .post('/v1/posts')
      .set(author.auth)
      .send({ clientRequestId: randomUUID(), mediaKey: key, type: 'PHOTO', rightsConfirmed: true })
      .expect(201);
    await waitForPost(app, author, free.body.data.id);
    await http().get(`/v1/x402/posts/${free.body.data.id}/content`).expect(404);
    await http().get(`/v1/x402/posts/${randomUUID()}/content`).expect(404);
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Hex } from 'viem';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  ARKIV_GATEWAY,
  type ArkivBatch,
  type ArkivGateway,
  type ArkivRow,
} from '../src/modules/arkiv/arkiv.gateway.js';
import {
  ArkivClips,
  ArkivEvents,
  ArkivReceipts,
  ArkivReports,
  ArkivShares,
} from '../src/modules/arkiv/arkiv.schemas.js';
import { ArkivService, clip128 } from '../src/modules/arkiv/arkiv.service.js';
import { RewardsService } from '../src/modules/rewards/rewards.service.js';
import { cleanupTestUsers, makeOrganizer, makeUser, uniq, type TestUser } from './helpers.js';

const HOUR = 3_600_000;
const unwrap = (v: unknown) =>
  v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;

/** In-memory Arkiv: entities with owner, read-only flag and typed values. */
class FakeArkiv implements ArkivGateway {
  readonly writer = privateKeyToAccount(generatePrivateKey()).address;
  readonly explorerUrl = 'https://rabdi.explorer.arkiv.network';
  readonly chainId = 7794095;
  entities = new Map<
    string,
    {
      schema: unknown;
      values: Record<string, unknown>;
      owner: string;
      readonly: boolean;
      lifetime: unknown;
    }
  >();
  txs = 0;
  private seq = 0;

  async execute(b: ArkivBatch) {
    const createdEntities: Hex[] = [];
    for (const c of b.creates ?? []) {
      const k = `0x${(++this.seq).toString(16).padStart(64, '0')}` as Hex;
      this.entities.set(k, {
        schema: c.schema,
        values: c.values,
        owner: this.writer,
        readonly: !!c.readonly,
        lifetime: c.lifetime,
      });
      createdEntities.push(k);
    }
    for (const o of b.ownershipChanges ?? []) this.entities.get(o.entityKey)!.owner = o.newOwner;
    for (const d of b.deletes ?? []) {
      if (this.entities.get(d.entityKey)?.owner !== this.writer) throw new Error('not the owner');
      this.entities.delete(d.entityKey);
    }
    this.txs++;
    return { txHash: `0x${this.txs.toString(16).padStart(64, '0')}` as Hex, createdEntities };
  }
  of(schema: unknown) {
    return [...this.entities].filter(([, e]) => e.schema === schema);
  }
  private row(k: string): ArkivRow {
    const e = this.entities.get(k)!;
    const out: Record<string, unknown> = { $key: k, $owner: e.owner, $expiresAt: '999' };
    for (const [name, v] of Object.entries(e.values)) {
      const raw = unwrap(v);
      out[name] = typeof raw === 'bigint' ? raw.toString() : raw;
    }
    return out as ArkivRow;
  }
  async reportsForPool(poolId: string) {
    return this.of(ArkivReports)
      .filter(([, e]) => e.values['poolId'] === poolId)
      .map(([k]) => this.row(k));
  }
  async sharesForReport(reportKey: string) {
    return this.of(ArkivShares)
      .filter(([, e]) => unwrap(e.values['report']) === reportKey)
      .map(([k]) => this.row(k));
  }
  async receiptsForPool(poolId: string) {
    return this.of(ArkivReceipts)
      .filter(([, e]) => e.values['poolId'] === poolId)
      .map(([k]) => this.row(k));
  }
  describeReportQuery(poolId: string) {
    return `arkiv.schema = str('muso.attention-reports') AND poolId = str('${poolId}') AND $creator = addr(${this.writer})`;
  }
}

describe('Arkiv public record (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const arkiv = new FakeArkiv();
  const http = () => request(app.getHttpServer());
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

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
  const watch = async (viewer: TestUser, postId: string, ms = 6_000) => {
    const s = await http()
      .post('/v1/watch/sessions')
      .set(viewer.auth)
      .send({ postId, deviceId: randomUUID() })
      .expect(201);
    for (const pos of [3_000, 6_000].filter((p) => p <= ms)) {
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
      .overrideProvider(ARKIV_GATEWAY)
      .useValue(arkiv)
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

  it('keeps str values within Arkiv’s 128-byte limit on character boundaries', () => {
    expect(clip128('ab'.repeat(100))).toHaveLength(120);
    expect(Buffer.byteLength(clip128('🎸'.repeat(60)))).toBeLessThanOrEqual(120);
  });

  it('publishes events, clips, the attention report and payout receipts; the app reads them back from Arkiv', async () => {
    const sync = () => app.get(ArkivService).sync();
    const org = await makeOrganizer(app, prisma);
    const creator = await makeUser(app, prisma);
    const other = await makeUser(app, prisma);
    const viewers = await Promise.all([1, 2].map(() => makeUser(app, prisma)));
    await prisma.user.updateMany({
      where: { id: { in: [creator.id, other.id, ...viewers.map((v) => v.id)] } },
      data: { humanVerifiedAt: new Date() },
    });
    const creatorWallet = privateKeyToAccount(generatePrivateKey()).address;
    const e = await prisma.event.create({
      data: {
        organizerId: org.id,
        title: 'Arkiv Night',
        description: 'x',
        venueName: 'Arena',
        city: uniq('Mumbai'),
        country: 'IN',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 2 * HOUR),
        reviewStatus: 'APPROVED',
      },
    });
    const v1 = await video(creator, e.id);
    const v2 = await video(other, e.id);

    // Events and clips go public; clips are read-only.
    let done = await sync();
    expect(done).toMatchObject({ events: expect.any(Number), clips: expect.any(Number) });
    const ev = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(arkiv.entities.get(ev.arkivKey!)).toMatchObject({
      schema: ArkivEvents,
      owner: arkiv.writer,
    });
    const lifetime = arkiv.entities.get(ev.arkivKey!)!.lifetime as { kind: string; date: Date };
    expect(lifetime.kind).toBe('until');
    expect(lifetime.date.getTime()).toBe(e.endsAt.getTime() + 30 * 24 * HOUR);
    const p1 = await prisma.post.findUniqueOrThrow({ where: { id: v1 } });
    expect(arkiv.entities.get(p1.arkivKey!)).toMatchObject({ schema: ArkivClips, readonly: true });
    expect(unwrap(arkiv.entities.get(p1.arkivKey!)!.values['event'])).toBe(ev.arkivKey);

    // Once the creator links a wallet, their clip's record is handed to them.
    await prisma.user.update({
      where: { id: creator.id },
      data: { walletAddress: creatorWallet.toLowerCase() },
    });
    done = await sync();
    expect(done['handovers']).toBe(1);
    expect(arkiv.entities.get(p1.arkivKey!)!.owner).toBe(creatorWallet);

    // A sponsored, human-only pool ends: a read-only report + one share per clip.
    const pool = (
      await http()
        .post('/v1/reward-pools')
        .set(org.auth)
        .send({
          eventId: e.id,
          title: 'Best clips',
          sponsorName: 'Night Owl',
          budgetMinor: 100_000,
          perVideoCapBps: 10_000,
          minQualifiedViewers: 2,
          humanOnly: true,
          endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        })
        .expect(201)
    ).body.data;
    await prisma.rewardPool.update({
      where: { id: pool.id },
      data: { status: 'FUNDED', fundedAt: new Date() },
    });
    for (const v of viewers) {
      await watch(v, v1); // 6 s each
      await watch(v, v2, 3_000); // 3 s each
    }
    advance(6 * 60_000);
    expect(await app.get(RewardsService).distribute(pool.id)).toBe(true);
    done = await sync();
    expect(done['reports']).toBe(1);
    const reportKey = (await prisma.rewardPool.findUniqueOrThrow({ where: { id: pool.id } }))
      .arkivReportKey!;
    expect(arkiv.entities.get(reportKey)).toMatchObject({ schema: ArkivReports, readonly: true });
    expect(arkiv.of(ArkivShares)).toHaveLength(2);

    // A creator paid on Arc gets a public receipt linking the report to the USDC transaction.
    await prisma.arcPayout.create({
      data: {
        poolId: pool.id,
        creatorId: creator.id,
        amountMicro: 5_000_000n,
        wallet: creatorWallet.toLowerCase(),
        status: 'CLAIMED',
        claimTx: `0x${'ab'.repeat(32)}`,
      },
    });
    expect((await sync())['receipts']).toBe(1);

    // The app's proof comes from Arkiv: changing MUSO's database afterwards doesn't change it.
    await prisma.rewardAllocation.updateMany({
      where: { poolId: pool.id },
      data: { shareMinor: 1 },
    });
    const proof = (
      await http().get(`/v1/reward-pools/${pool.id}/arkiv`).set(viewers[0]!.auth).expect(200)
    ).body.data;
    expect(proof).toMatchObject({
      enabled: true,
      writer: arkiv.writer,
      report: {
        key: reportKey,
        currency: 'INR',
        budget: '1000',
        paid: '1000',
        verifiedViewers: 2,
        clips: 2,
        humanOnly: true,
      },
    });
    expect(proof.report.url).toBe(`https://rabdi.explorer.arkiv.network/entity/${reportKey}`);
    expect(
      proof.shares.map((s: { postId: string; rank: number; share: string }) => [
        s.rank,
        s.postId,
        s.share,
      ]),
    ).toEqual([
      [1, v1, '666.67'],
      [2, v2, '333.33'],
    ]);
    expect(proof.receipts[0]).toMatchObject({ amount: '5', creator: creatorWallet });
    expect(proof.query).toContain(pool.id);

    // Nothing is written twice.
    const before = arkiv.entities.size;
    expect(await sync()).toEqual({});
    expect(arkiv.entities.size).toBe(before);
  });

  it('removes a taken-down clip’s record while MUSO still owns it', async () => {
    const org = await makeOrganizer(app, prisma);
    const creator = await makeUser(app, prisma);
    const e = await prisma.event.create({
      data: {
        organizerId: org.id,
        title: 'Takedown Fest',
        description: 'x',
        venueName: 'Arena',
        city: uniq('Pune'),
        country: 'IN',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + HOUR),
        reviewStatus: 'APPROVED',
      },
    });
    const v = await video(creator, e.id);
    await app.get(ArkivService).sync();
    const { arkivKey } = await prisma.post.findUniqueOrThrow({ where: { id: v } });
    expect(arkiv.entities.has(arkivKey!)).toBe(true);
    await prisma.post.update({ where: { id: v }, data: { moderationStatus: 'HIDDEN' } });
    expect((await app.get(ArkivService).sync())['removed']).toBe(1);
    expect(arkiv.entities.has(arkivKey!)).toBe(false);
  });
});

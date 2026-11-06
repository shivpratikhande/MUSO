import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  PREDICTION_CHAIN,
  PREDICTION_POOLS_ABI,
  type ChainMarketStatus,
  type NewChainMarket,
  type PredictionChain,
} from '../src/modules/predictions/predictions.chain.js';
import { PredictionsService } from '../src/modules/predictions/predictions.service.js';
import { cleanupTestUsers, makeOrganizer, makeUser, type TestUser } from './helpers.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const U = 1_000_000n; // 1 USDC
const CHAIN_ID = 5042002;
/** Lock soon so time jumps stay inside the 15-minute access-token lifetime. */
const lockSoon = () => new Date(Date.now() + 6 * MIN).toISOString();

interface FakeMarket extends NewChainMarket {
  status: ChainMarketStatus;
  winning: number;
  totalStaked: bigint;
  winnerPool: bigint;
  optionTotal: bigint[];
  positions: Map<string, { stake: bigint; option: number; paid: boolean }>;
  humans: Set<string>;
}

/** In-memory PredictionPools with the contract's rules, including the EIP-712 ticket check. */
class FakePredictionChain implements PredictionChain {
  readonly contract = getAddress(`0x${'ab'.repeat(20)}`);
  readonly usdc = getAddress('0x3600000000000000000000000000000000000000');
  private readonly key = privateKeyToAccount(generatePrivateKey());
  readonly operator = this.key.address;
  readonly explorerUrl = 'https://testnet.arcscan.app';
  markets: FakeMarket[] = [];
  balances = new Map<string, bigint>();
  failCreate = false;
  txs = 0;
  private tx = () => `0x${(++this.txs).toString(16).padStart(64, '0')}` as Hex;
  private now = () => BigInt(Math.floor(Date.now() / 1000));
  private credit = (a: string, amt: bigint) =>
    this.balances.set(a.toLowerCase(), (this.balances.get(a.toLowerCase()) ?? 0n) + amt);

  async createMarket(m: NewChainMarket) {
    if (this.failCreate) throw new Error('Arc RPC unavailable');
    this.markets.push({
      ...m,
      status: 'OPEN',
      winning: 0,
      totalStaked: 0n,
      winnerPool: 0n,
      optionTotal: Array.from({ length: m.optionCount }, () => 0n),
      positions: new Map(),
      humans: new Set(),
    });
    return { marketId: this.markets.length, tx: this.tx() };
  }
  private domain() {
    return {
      name: 'MUSO PredictionPools',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: this.contract,
    } as const;
  }
  private types = {
    PickTicket: [
      { name: 'marketId', type: 'uint256' },
      { name: 'picker', type: 'address' },
      { name: 'humanId', type: 'bytes32' },
      { name: 'deadline', type: 'uint64' },
    ],
  } as const;
  signTicket(marketId: number, picker: Address, humanId: Hex, deadline: number) {
    return this.key.signTypedData({
      domain: this.domain(),
      types: this.types,
      primaryType: 'PickTicket',
      message: { marketId: BigInt(marketId), picker, humanId, deadline: BigInt(deadline) },
    });
  }
  pickData(
    marketId: number,
    option: number,
    amount: bigint,
    humanId: Hex,
    deadline: number,
    ticket: Hex,
  ) {
    return encodeFunctionData({
      abi: PREDICTION_POOLS_ABI,
      functionName: 'pick',
      args: [BigInt(marketId), option, amount, humanId, BigInt(deadline), ticket],
    });
  }
  /** What the fan's wallet does: send the calldata MUSO handed out. */
  async sendPick(sender: Address, data: Hex): Promise<Hex> {
    const { functionName, args } = decodeFunctionData({ abi: PREDICTION_POOLS_ABI, data });
    if (functionName !== 'pick') throw new Error('not a pick');
    const [id, option, amount, humanId, deadline, ticket] = args;
    const m = this.markets[Number(id) - 1]!;
    if (m.status !== 'OPEN') throw new Error('NotOpen');
    if (this.now() >= BigInt(m.locksAt)) throw new Error('MarketLocked');
    if (option >= m.optionCount) throw new Error('InvalidOption');
    if (amount < m.minStake || amount > m.maxStake) throw new Error('StakeOutOfRange');
    if (m.positions.has(sender.toLowerCase())) throw new Error('AlreadyPicked');
    if (this.now() > deadline) throw new Error('TicketExpired');
    if (m.humans.has(humanId)) throw new Error('HumanAlreadyPicked');
    const ok = await verifyTypedData({
      address: this.operator,
      domain: this.domain(),
      types: this.types,
      primaryType: 'PickTicket',
      message: { marketId: id, picker: sender, humanId, deadline },
      signature: ticket,
    });
    if (!ok) throw new Error('InvalidTicket');
    m.humans.add(humanId);
    m.positions.set(sender.toLowerCase(), { stake: amount, option, paid: false });
    m.optionTotal[option]! += amount;
    m.totalStaked += amount;
    return this.tx();
  }
  async positionOf(id: number, a: Address) {
    return (
      this.markets[id - 1]!.positions.get(a.toLowerCase()) ?? { stake: 0n, option: 0, paid: false }
    );
  }
  async settle(id: number, option: number, creator: Address | null) {
    const m = this.markets[id - 1]!;
    if (m.status !== 'OPEN') throw new Error('NotOpen');
    if (this.now() < BigInt(m.locksAt)) throw new Error('MarketNotLocked');
    if (this.now() > BigInt(m.resolveBy)) throw new Error('ResolveWindowClosed');
    if (m.optionTotal[option] === 0n) {
      m.status = 'REFUNDING';
      return { tx: this.tx(), status: m.status };
    }
    const share = creator ? (m.totalStaked * BigInt(m.creatorBps)) / 10_000n : 0n;
    if (creator && share) this.credit(creator, share);
    m.status = 'SETTLED';
    m.winning = option;
    m.winnerPool = m.totalStaked - share;
    return { tx: this.tx(), status: m.status };
  }
  async cancel(id: number) {
    const m = this.markets[id - 1]!;
    if (m.status !== 'OPEN') throw new Error('NotOpen');
    m.status = 'REFUNDING';
    return this.tx();
  }
  async status(id: number) {
    return this.markets[id - 1]!.status;
  }
  async payoutOf(id: number, a: Address) {
    const m = this.markets[id - 1]!;
    const p = m.positions.get(a.toLowerCase());
    if (!p || p.paid) return 0n;
    if (m.status === 'REFUNDING' || (m.status === 'OPEN' && this.now() > BigInt(m.resolveBy)))
      return p.stake;
    if (m.status === 'SETTLED' && p.option === m.winning)
      return (p.stake * m.winnerPool) / m.optionTotal[m.winning]!;
    return 0n;
  }
  async claim(id: number, a: Address) {
    const m = this.markets[id - 1]!;
    if (m.status !== 'SETTLED') throw new Error('NotSettled');
    const amt = await this.payoutOf(id, a);
    if (!amt) throw new Error('NothingToPay');
    m.positions.get(a.toLowerCase())!.paid = true;
    this.credit(a, amt);
    return this.tx();
  }
  async refund(id: number, a: Address) {
    const m = this.markets[id - 1]!;
    if (m.status === 'OPEN' && this.now() > BigInt(m.resolveBy)) m.status = 'REFUNDING';
    if (m.status !== 'REFUNDING') throw new Error('NotRefundable');
    const p = m.positions.get(a.toLowerCase());
    if (!p || p.paid) throw new Error('NothingToPay');
    p.paid = true;
    this.credit(a, p.stake);
    return this.tx();
  }
}

describe('Predictions on any event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: PredictionsService;
  const chain = new FakePredictionChain();
  const http = () => request(app.getHttpServer());
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PREDICTION_CHAIN)
      .useValue(chain)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(PredictionsService);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  async function event(organizer: TestUser, startsIn = 2 * HOUR, length = 4 * HOUR) {
    const now = Date.now();
    return prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: 'Carrom Showdown',
        description: 'Final at the venue',
        venueName: 'Hall A',
        city: 'Mumbai',
        country: 'IN',
        startsAt: new Date(now + startsIn),
        endsAt: new Date(now + startsIn + length),
        reviewStatus: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
  }

  /** A fan with a linked wallet (optionally World ID–verified). */
  async function fan(human = true) {
    const u = await makeUser(app, prisma);
    const acct = privateKeyToAccount(generatePrivateKey());
    await prisma.user.update({
      where: { id: u.id },
      data: {
        walletAddress: acct.address.toLowerCase(),
        walletLinkedAt: new Date(),
        humanVerifiedAt: human ? new Date() : null,
      },
    });
    return { ...u, wallet: acct.address };
  }

  /** The whole wallet-page round trip: link → ticket → on-chain pick → confirm. */
  async function pick(
    id: string,
    f: Awaited<ReturnType<typeof fan>>,
    option: number,
    usdc: number,
  ) {
    const link = await http()
      .post(`/v1/predictions/${id}/pick-link`)
      .set(f.auth)
      .send({ option, stakeUsdc: usdc, returnUrl: 'muso://predictions' })
      .expect(200);
    const code = link.body.data.code.replace('-', '');
    const t = (await http().get(`/v1/arc/code/${code}`).expect(200)).body.data.t;
    const session = (await http().get('/v1/arc/session').query({ t }).expect(200)).body.data;
    expect(session.purpose).toBe('pick');
    expect(session.prediction.stakeUsdc).toBe(usdc);
    const ticket = (
      await http()
        .post('/v1/arc/session/pick-ticket')
        .query({ t })
        .send({ address: f.wallet })
        .expect(200)
    ).body.data;
    const txHash = await chain.sendPick(f.wallet, ticket.pickData);
    await http().post('/v1/arc/session/pick').query({ t }).send({ txHash }).expect(200);
    return { t, ticket };
  }

  const create = (org: TestUser, eventId: string, body: Record<string, unknown>) =>
    http().post(`/v1/events/${eventId}/predictions`).set(org.auth).send(body);

  it('runs a match-winner market end to end: picks, odds, result, payouts', async () => {
    const org = await makeOrganizer(app, prisma);
    const ev = await event(org);
    const stranger = await makeUser(app, prisma);
    const body = {
      template: 'MATCH_WINNER',
      question: 'Who wins the carrom final?',
      options: ['Asha', 'Bilal', 'Chen'],
      minStakeUsdc: 1,
      maxStakeUsdc: 20,
      locksAt: lockSoon(),
    };
    await create(stranger, ev.id, body).expect(403);
    await create(org, ev.id, { ...body, options: ['Only one'] }).expect(400);

    const m = (await create(org, ev.id, body).expect(201)).body.data;
    expect(m).toMatchObject({ status: 'OPEN', chainMarketId: 1, canManage: true, humanOnly: true });
    expect(chain.markets[0]).toMatchObject({ optionCount: 3, minStake: U, maxStake: 20n * U });

    const [a, b, c] = [await fan(), await fan(), await fan()];
    await pick(m.id, a, 0, 10);
    await pick(m.id, b, 0, 5);
    await pick(m.id, c, 1, 5);

    // A second pick by the same person is refused before anything is signed.
    await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(a.auth)
      .send({ option: 1, stakeUsdc: 2, returnUrl: 'muso://x' })
      .expect(409);
    // Unverified humans can't pick in a human-only market; stakes must be in range.
    const bot = await fan(false);
    await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(bot.auth)
      .send({ option: 0, stakeUsdc: 2, returnUrl: 'muso://x' })
      .expect(403);
    await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(stranger.auth)
      .send({ option: 0, stakeUsdc: 50, returnUrl: 'muso://x' })
      .expect(400);

    let dto = (await http().get(`/v1/predictions/${m.id}`).set(a.auth).expect(200)).body.data;
    expect(dto.totalMicro).toBe(String(20n * U));
    expect(dto.pickers).toBe(3);
    expect(dto.options[0]).toMatchObject({
      totalMicro: String(15n * U),
      pickers: 2,
      multiplier: 1.33,
    });
    expect(dto.options[1]).toMatchObject({ multiplier: 4 });
    expect(dto.options[2]).toMatchObject({ multiplier: null, pickers: 0 });
    expect(dto.myPick).toMatchObject({
      option: 0,
      stakeMicro: String(10n * U),
      status: 'CONFIRMED',
    });

    // Result: only the organizer, only after picks close.
    await http()
      .post(`/v1/predictions/${m.id}/settle`)
      .set(org.auth)
      .send({ option: 0 })
      .expect(400);
    vi.setSystemTime(new Date(new Date(m.locksAt).getTime() + MIN));
    await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(stranger.auth)
      .send({ option: 0, stakeUsdc: 2, returnUrl: 'muso://x' })
      .expect(409);
    await http().post(`/v1/predictions/${m.id}/settle`).set(a.auth).send({ option: 0 }).expect(403);
    dto = (
      await http()
        .post(`/v1/predictions/${m.id}/settle`)
        .set(org.auth)
        .send({ option: 0 })
        .expect(200)
    ).body.data;
    expect(dto).toMatchObject({ status: 'SETTLED', winningOption: 0 });

    await service.process();
    // Winners split 20 USDC by stake: 10/15 and 5/15. The loser gets nothing.
    expect(chain.balances.get(a.wallet.toLowerCase())).toBe(13_333_333n);
    expect(chain.balances.get(b.wallet.toLowerCase())).toBe(6_666_666n);
    expect(chain.balances.get(c.wallet.toLowerCase())).toBeUndefined();
    const mine = (await http().get(`/v1/predictions/${m.id}`).set(a.auth).expect(200)).body.data
      .myPick;
    expect(mine).toMatchObject({ status: 'PAID', payoutMicro: '13333333' });
    expect(mine.payoutTxUrl).toMatch(/^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
    const lost = (await http().get(`/v1/predictions/${m.id}`).set(c.auth).expect(200)).body.data
      .myPick;
    expect(lost.status).toBe('LOST');

    // Paying out again is a no-op.
    await service.process();
    expect(chain.balances.get(a.wallet.toLowerCase())).toBe(13_333_333n);
  });

  it('refunds everyone when nobody picked the winner, or when the organizer cancels', async () => {
    const org = await makeOrganizer(app, prisma);
    const ev = await event(org);
    const body = {
      template: 'SETLIST',
      question: 'What’s the encore?',
      options: ['Song A', 'Song B'],
      humanOnly: false,
      locksAt: lockSoon(),
    };
    const m1 = (await create(org, ev.id, body).expect(201)).body.data;
    const m2 = (await create(org, ev.id, body).expect(201)).body.data;
    const [a, b] = [await fan(false), await fan(false)];
    await pick(m1.id, a, 0, 3);
    await pick(m2.id, b, 1, 4);

    await http().post(`/v1/predictions/${m2.id}/cancel`).set(a.auth).expect(403);
    const cancelled = (
      await http().post(`/v1/predictions/${m2.id}/cancel`).set(org.auth).expect(200)
    ).body.data;
    expect(cancelled.status).toBe('REFUNDING');

    vi.setSystemTime(new Date(new Date(m1.locksAt).getTime() + MIN));
    const settled = (
      await http()
        .post(`/v1/predictions/${m1.id}/settle`)
        .set(org.auth)
        .send({ option: 1 })
        .expect(200)
    ).body.data;
    expect(settled.status).toBe('REFUNDING');
    expect(settled.note).toMatch(/Nobody picked/);

    await service.process();
    expect(chain.balances.get(a.wallet.toLowerCase())).toBe(3n * U);
    expect(chain.balances.get(b.wallet.toLowerCase())).toBe(4n * U);
  });

  it('settles a best-clip market automatically from verified watch time and pays the creator share', async () => {
    const org = await makeOrganizer(app, prisma);
    const ev = await event(org, -HOUR, 3 * HOUR); // live now
    const [rohan, aisha] = [await fan(), await fan()];
    const suggestionsBefore = (
      await http().get(`/v1/events/${ev.id}/predictions/suggestions`).set(org.auth).expect(200)
    ).body.data;
    expect(suggestionsBefore.creators).toEqual([]);

    // Each creator posts a video; viewers watch Aisha's for longer.
    const video = async (author: string) =>
      prisma.post.create({
        data: {
          authorId: author,
          eventId: ev.id,
          type: 'VIDEO',
          status: 'PUBLISHED',
          hashtags: [],
          rightsConfirmedAt: new Date(),
          clientRequestId: randomUUID(),
        },
      });
    const [pr, pa] = [await video(rohan.id), await video(aisha.id)];
    for (const u of [rohan, aisha])
      await prisma.user.update({ where: { id: u.id }, data: { username: `bc${u.id.slice(-10)}` } });
    const s = (
      await http().get(`/v1/events/${ev.id}/predictions/suggestions`).set(org.auth).expect(200)
    ).body.data;
    expect(s.creators.map((c: { id: string }) => c.id).sort()).toEqual([rohan.id, aisha.id].sort());

    const m = (
      await create(org, ev.id, {
        template: 'BEST_CLIP',
        question: 'Whose clip gets the most real watch time?',
        creatorIds: [rohan.id, aisha.id],
        creatorSharePct: 10,
        locksAt: lockSoon(),
        settlesAt: new Date(Date.now() + 8 * MIN).toISOString(),
      }).expect(201)
    ).body.data;
    expect(m).toMatchObject({ resolution: 'DATA', creatorSharePct: 10 });
    expect(chain.markets.at(-1)!.creatorBps).toBe(1_000);

    const [x, y] = [await fan(), await fan()];
    await pick(m.id, x, 1, 8); // backs Aisha
    await pick(m.id, y, 0, 2); // backs Rohan

    const viewer = await fan();
    const watch = async (postId: string, ms: number, human = true) => {
      const v = human ? viewer : await fan(false);
      const sess = await prisma.watchSession.create({
        data: {
          postId,
          viewerId: v.id,
          deviceHash: randomUUID(),
          qualifying: true,
          lastBeatAt: new Date(),
        },
      });
      await prisma.watchHeartbeat.create({
        data: {
          sessionId: sess.id,
          positionMs: ms,
          playing: true,
          foreground: true,
          creditedMs: ms,
        },
      });
    };
    await watch(pr.id, 20_000);
    await watch(pa.id, 45_000);
    await watch(pr.id, 90_000, false); // unverified viewer: doesn't count in a human-only market

    const live = (await http().get(`/v1/predictions/${m.id}`).set(x.auth).expect(200)).body.data;
    expect(live.options.map((o: { watchSeconds: number }) => o.watchSeconds)).toEqual([20, 45]);
    // DATA markets can't be settled by hand.
    vi.setSystemTime(new Date(new Date(m.locksAt).getTime() + MIN));
    await http()
      .post(`/v1/predictions/${m.id}/settle`)
      .set(org.auth)
      .send({ option: 0 })
      .expect(400);

    vi.setSystemTime(new Date(new Date(m.settlesAt).getTime() + MIN));
    await service.process();
    const done = (await http().get(`/v1/predictions/${m.id}`).set(x.auth).expect(200)).body.data;
    expect(done).toMatchObject({ status: 'SETTLED', winningOption: 1 });
    // 10 USDC pool: 10% (1 USDC) to Aisha's wallet, 9 USDC to the only winner.
    expect(chain.balances.get(aisha.wallet.toLowerCase())).toBe(1n * U);
    expect(chain.balances.get(x.wallet.toLowerCase())).toBe(9n * U);
    expect(done.myPick.status).toBe('PAID');
  });

  it('retries putting a market on-chain when Arc is unavailable', async () => {
    const org = await makeOrganizer(app, prisma);
    const ev = await event(org);
    chain.failCreate = true;
    const m = (
      await create(org, ev.id, {
        template: 'BATTLE',
        question: 'Who wins the battle?',
        options: ['Band A', 'Band B'],
      }).expect(201)
    ).body.data;
    expect(m.status).toBe('PENDING');
    expect(m.note).toMatch(/retrying/);
    // Default: picks close when the event starts.
    expect(m.locksAt).toBe(ev.startsAt.toISOString());
    const f = await fan();
    await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(f.auth)
      .send({ option: 0, stakeUsdc: 2, returnUrl: 'muso://x' })
      .expect(409);
    chain.failCreate = false;
    await service.process();
    const open = (await http().get(`/v1/predictions/${m.id}`).set(org.auth).expect(200)).body.data;
    expect(open).toMatchObject({ status: 'OPEN', note: null });
    expect(open.chainMarketId).toBeGreaterThan(0);
  });

  it('only issues tickets for the account’s linked wallet', async () => {
    const org = await makeOrganizer(app, prisma);
    const ev = await event(org);
    const m = (
      await create(org, ev.id, {
        template: 'CUSTOM',
        question: 'Will it rain at the gig?',
        options: ['Yes', 'No'],
      }).expect(201)
    ).body.data;
    const f = await fan();
    const link = await http()
      .post(`/v1/predictions/${m.id}/pick-link`)
      .set(f.auth)
      .send({ option: 0, stakeUsdc: 2, returnUrl: 'muso://x' })
      .expect(200);
    const t = (
      await http()
        .get(`/v1/arc/code/${link.body.data.code.replace('-', '')}`)
        .expect(200)
    ).body.data.t;
    const other = privateKeyToAccount(generatePrivateKey()).address;
    await http()
      .post('/v1/arc/session/pick-ticket')
      .query({ t })
      .send({ address: other })
      .expect(400);
    // A ticket signed for one wallet can't be used from another.
    const ticket = (
      await http()
        .post('/v1/arc/session/pick-ticket')
        .query({ t })
        .send({ address: f.wallet })
        .expect(200)
    ).body.data;
    await expect(chain.sendPick(other, ticket.pickData)).rejects.toThrow('InvalidTicket');
    // Confirming before the pick is on-chain is refused.
    await http().post('/v1/arc/session/pick').query({ t }).send({ txHash: '0x1' }).expect(400);
    // A forged link token is refused.
    await http()
      .post('/v1/arc/session/pick-ticket')
      .query({ t: `${t}x` })
      .send({ address: f.wallet })
      .expect(403);
    void advance;
  });
});

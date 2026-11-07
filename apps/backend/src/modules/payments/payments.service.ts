import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentIntent, Prisma } from '@muso/database';
import {
  feeFor,
  formatMoney,
  moneyRules,
  type CreateCheckoutInput,
  type Paginated,
  type PaymentDto,
  type PostDto,
} from '@muso/shared';
import type { Env } from '../../config/env.js';
import { decodeCursor, encodeCursor } from '../../common/cursor.js';
import {
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { isBlockedEitherWay } from '../../common/users.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostMapper, postInclude } from '../posts/post-mapper.service.js';
import { visiblePostsWhere } from '../posts/posts.service.js';
import { LedgerService, accounts } from './ledger.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './providers/payment-provider.js';

const CHECKOUT_TTL_MS = 30 * 60_000;
/** USDC on Arc: the fan's wallet pays the creator's wallet directly. */
export const ARC_PROVIDER = 'arc';
/** Deep-link schemes a hosted checkout may return to. */
const RETURN_URL = /^(muso|exp|exps):\/\//;

const paymentInclude = {
  post: {
    select: {
      id: true,
      caption: true,
      media: { select: { thumbKey: true, previewKey: true }, take: 1 },
    },
  },
  payee: { select: { id: true, displayName: true, username: true } },
  rewardPool: { select: { id: true, title: true } },
} as const;
type PaymentRow = Prisma.PaymentIntentGetPayload<{ include: typeof paymentInclude }>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly mapper: PostMapper,
    private readonly config: ConfigService<Env, true>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ───────────────────────────── Checkout ─────────────────────────────

  publicConfig() {
    return {
      feeBpsSales: this.config.get('PLATFORM_FEE_BPS_SALES', { infer: true }),
      feeBpsTips: this.config.get('PLATFORM_FEE_BPS_TIPS', { infer: true }),
      testMode: this.provider.testMode,
      provider: this.provider.name,
      currency: this.config.get('PAYMENTS_CURRENCY', { infer: true }),
      usdcOnArc: this.config.get('ARC_ENABLED', { infer: true }),
      feeBpsUsdc: 0,
    };
  }

  async createCheckout(input: CreateCheckoutInput, payer: RequestUser): Promise<PaymentDto> {
    if (!RETURN_URL.test(input.returnUrl)) throw badRequest('Invalid return URL');

    // Idempotency: retrying the same request returns the same payment.
    const existing = await this.prisma.paymentIntent.findUnique({
      where: {
        payerId_idempotencyKey: { payerId: payer.id, idempotencyKey: input.idempotencyKey },
      },
      include: paymentInclude,
    });
    if (existing) {
      const target =
        input.kind === 'POOL_FUNDING'
          ? existing.rewardPoolId === input.poolId
          : existing.postId === input.postId;
      if (existing.kind !== input.kind || !target)
        throw conflict('This payment key was already used for something else');
      return this.toDto(existing);
    }
    if (input.kind === 'POOL_FUNDING') {
      if (!payer.emailVerified) throw forbidden('Verify your email before paying');
      return this.createPoolFunding(input, payer);
    }

    const post = await this.prisma.post.findFirst({
      where: { id: input.postId, ...visiblePostsWhere([]) },
      select: {
        id: true,
        type: true,
        authorId: true,
        caption: true,
        monetizationMode: true,
        priceMinor: true,
        minimumMinor: true,
        tipsEnabled: true,
        currency: true,
      },
    });
    if (!post) throw notFound('That post');
    if (post.authorId === payer.id) throw badRequest('You can’t pay for your own post');
    if (await isBlockedEitherWay(this.prisma, payer.id, post.authorId))
      throw forbidden('You can’t pay this creator');

    const rules = moneyRules(post.currency);
    const usdc = post.currency === 'USD';
    // Card checkouts need a verified email. USDC is paid from the fan's own wallet, which they
    // prove with a signature on the wallet page, so no email is needed.
    if (!usdc && !payer.emailVerified) throw forbidden('Verify your email before paying');
    let payTo: string | null = null;
    if (usdc) {
      if (!this.config.get('ARC_ENABLED', { infer: true }))
        throw badRequest('USDC payments aren’t enabled on this server');
      const payee = await this.prisma.user.findUnique({
        where: { id: post.authorId },
        select: { walletAddress: true },
      });
      if (!payee?.walletAddress)
        throw badRequest('This creator hasn’t linked a USDC wallet yet, so they can’t be paid.');
      payTo = payee.walletAddress;
    }

    let amountMinor: number;
    let feeBps: number;
    if (input.kind === 'UNLOCK') {
      if (post.monetizationMode === 'FREE') throw badRequest('This post is free');
      const owned = await this.prisma.contentEntitlement.findUnique({
        where: { userId_postId: { userId: payer.id, postId: post.id } },
      });
      if (owned) throw conflict('You already unlocked this');
      // One open unlock per post per payer: return it instead of starting a second checkout.
      const open = await this.prisma.paymentIntent.findFirst({
        where: {
          payerId: payer.id,
          postId: post.id,
          kind: 'UNLOCK',
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        include: paymentInclude,
      });
      if (open) return this.toDto(open);

      if (post.monetizationMode === 'PAY_TO_UNLOCK') {
        amountMinor = post.priceMinor!; // always the server's current price, never the client's
      } else {
        const min = Math.max(post.minimumMinor ?? rules.minPrice, rules.minPrice);
        if (!input.amountMinor) throw badRequest('Choose an amount');
        if (input.amountMinor < min)
          throw badRequest(`The minimum is ${formatMoney(min, post.currency)}`);
        amountMinor = input.amountMinor;
      }
      feeBps = this.config.get('PLATFORM_FEE_BPS_SALES', { infer: true });
    } else {
      if (!post.tipsEnabled) throw badRequest('Tips are turned off for this post');
      if (input.amountMinor < rules.minTip || input.amountMinor > rules.maxTip)
        throw badRequest(
          `Tips are ${formatMoney(rules.minTip, post.currency)} to ${formatMoney(rules.maxTip, post.currency)}`,
        );
      amountMinor = input.amountMinor;
      feeBps = this.config.get('PLATFORM_FEE_BPS_TIPS', { infer: true });
    }
    // Wallet to wallet: the creator receives the full amount on Arc.
    if (usdc) feeBps = 0;

    const payment = await this.prisma.paymentIntent.create({
      data: {
        payerId: payer.id,
        payeeId: post.authorId,
        postId: post.id,
        kind: input.kind,
        amountMinor,
        currency: post.currency,
        feeBps,
        provider: usdc ? ARC_PROVIDER : this.provider.name,
        idempotencyKey: input.idempotencyKey,
        message: input.kind === 'TIP' ? (input.message ?? null) : null,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
      include: paymentInclude,
    });
    // USDC: the app opens MUSO's wallet page (POST /payments/:id/arc/pay-link) to pay `payTo`.
    if (payTo) return this.toDto(payment);
    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      amountMinor,
      currency: post.currency,
      description: input.kind === 'TIP' ? 'Tip on MUSO' : 'Unlock on MUSO',
      returnUrl: input.returnUrl,
    });
    const saved = await this.prisma.paymentIntent.update({
      where: { id: payment.id },
      data: { providerRef: session.providerRef, checkoutUrl: session.checkoutUrl },
      include: paymentInclude,
    });
    return this.toDto(saved);
  }

  /** Funding a reward pool: the pool's creator pays the full budget into escrow. */
  private async createPoolFunding(
    input: Extract<CreateCheckoutInput, { kind: 'POOL_FUNDING' }>,
    payer: RequestUser,
  ): Promise<PaymentDto> {
    const pool = await this.prisma.rewardPool.findUnique({ where: { id: input.poolId } });
    if (!pool) throw notFound('That reward pool');
    if (pool.creatorId !== payer.id) throw forbidden('Only the pool’s creator can fund it');
    if (pool.status !== 'DRAFT') throw conflict('This pool is already funded');
    if (pool.endsAt <= new Date()) throw badRequest('This pool’s window has already ended');
    const open = await this.prisma.paymentIntent.findFirst({
      where: {
        rewardPoolId: pool.id,
        kind: 'POOL_FUNDING',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: paymentInclude,
    });
    if (open) return this.toDto(open);

    const payment = await this.prisma.paymentIntent.create({
      data: {
        payerId: payer.id,
        payeeId: null,
        rewardPoolId: pool.id,
        kind: 'POOL_FUNDING',
        amountMinor: pool.budgetMinor,
        currency: pool.currency,
        feeBps: 0,
        provider: this.provider.name,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
    });
    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      amountMinor: pool.budgetMinor,
      currency: pool.currency,
      description: `Reward pool: ${pool.title}`,
      returnUrl: input.returnUrl,
    });
    const saved = await this.prisma.paymentIntent.update({
      where: { id: payment.id },
      data: { providerRef: session.providerRef, checkoutUrl: session.checkoutUrl },
      include: paymentInclude,
    });
    return this.toDto(saved);
  }

  /**
   * Asks the provider for the real outcome and applies it. Safe to call any number of times,
   * from the app, the reconciliation timer, or both at once.
   */
  async verify(paymentId: string, viewer: RequestUser | null): Promise<PaymentDto> {
    const p = await this.prisma.paymentIntent.findUnique({ where: { id: paymentId } });
    if (!p || (viewer && p.payerId !== viewer.id)) throw notFound('That payment');
    if (p.provider === ARC_PROVIDER) {
      // Settled only by confirmArcPayment (an on-chain transfer MUSO checked); otherwise it expires.
      if (p.status === 'PENDING' && p.expiresAt <= new Date())
        await this.finish(p.id, 'EXPIRED', 'Not paid in time. No USDC was taken.');
    } else if (p.status === 'PENDING' && p.providerRef) {
      const remote = await this.provider.fetchStatus(p.providerRef);
      if (remote.status === 'succeeded') {
        // Never trust amounts from anywhere but our own record; mismatches are not fulfilled.
        if (remote.amountMinor !== p.amountMinor || remote.currency !== p.currency) {
          this.logger.error(`Amount mismatch on payment ${p.id}`);
          await this.finish(p.id, 'FAILED', 'Amount mismatch reported by provider');
        } else {
          await this.fulfill(p);
        }
      } else if (remote.status === 'failed') {
        await this.finish(p.id, 'FAILED', 'The payment was declined');
      } else if (remote.status === 'cancelled') {
        await this.finish(p.id, 'CANCELLED', null);
      } else if (p.expiresAt <= new Date()) {
        await this.finish(p.id, 'EXPIRED', 'Checkout expired');
      }
    }
    const row = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });
    return this.toDto(row);
  }

  /**
   * Records a payment that an external rail has ALREADY settled (e.g. an x402 payment settled
   * on Hedera by the facilitator). Idempotent on (provider, providerRef): replays of the same
   * settled transaction never record twice. Runs the same fulfilment as checkout payments:
   * entitlement → creator earning (pending) → balanced ledger journal.
   */
  async recordSettledUnlock(input: {
    payerId: string;
    postId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    providerRef: string;
  }): Promise<{ paymentId: string; alreadyRecorded: boolean }> {
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { provider_providerRef: { provider: input.provider, providerRef: input.providerRef } },
    });
    if (existing) return { paymentId: existing.id, alreadyRecorded: true };
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: input.postId },
      select: { authorId: true },
    });
    let intent: PaymentIntent;
    try {
      intent = await this.prisma.paymentIntent.create({
        data: {
          payerId: input.payerId,
          payeeId: post.authorId,
          postId: input.postId,
          kind: 'UNLOCK',
          amountMinor: input.amountMinor,
          currency: input.currency,
          feeBps: this.config.get('PLATFORM_FEE_BPS_SALES', { infer: true }),
          provider: input.provider,
          providerRef: input.providerRef,
          idempotencyKey: input.providerRef,
          expiresAt: new Date(),
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await this.prisma.paymentIntent.findUniqueOrThrow({
          where: {
            provider_providerRef: { provider: input.provider, providerRef: input.providerRef },
          },
        });
        return { paymentId: again.id, alreadyRecorded: true };
      }
      throw err;
    }
    await this.fulfill(intent);
    return { paymentId: intent.id, alreadyRecorded: false };
  }

  /**
   * A USDC payment the Arc module has checked on-chain: `txHash` moved exactly this amount from
   * the payer's linked wallet to the creator's. Runs the normal fulfilment once; a transaction
   * can settle only one payment (UNIQUE provider + providerRef). An expired checkout is still
   * honoured, because the money really moved.
   */
  async confirmArcPayment(paymentId: string, txHash: string): Promise<PaymentDto> {
    const p = await this.prisma.paymentIntent.findUnique({ where: { id: paymentId } });
    if (!p || p.provider !== ARC_PROVIDER) throw notFound('That payment');
    if (p.status === 'SUCCEEDED') {
      if (p.providerRef !== txHash) throw conflict('This payment was already made');
    } else {
      try {
        const claimed = await this.prisma.paymentIntent.updateMany({
          where: { id: p.id, status: { in: ['PENDING', 'EXPIRED'] }, providerRef: null },
          data: { status: 'PENDING', providerRef: txHash, failureReason: null },
        });
        if (claimed.count !== 1) throw conflict('This payment can’t be completed any more');
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('That transaction already paid for something');
        throw err;
      }
      await this.fulfill({ ...p, status: 'PENDING', providerRef: txHash });
    }
    const row = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });
    return this.toDto(row);
  }

  /** Re-checks payments the app never came back for. Returns how many were checked. */
  async reconcilePending(olderThanMs = 30_000): Promise<number> {
    const pending = await this.prisma.paymentIntent.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - olderThanMs) } },
      select: { id: true },
      take: 100,
    });
    for (const p of pending) {
      await this.verify(p.id, null).catch((err) =>
        this.logger.warn(`reconcile ${p.id}: ${(err as Error).message}`),
      );
    }
    return pending.length;
  }

  private async finish(
    id: string,
    status: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    reason: string | null,
  ): Promise<void> {
    await this.prisma.paymentIntent.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, failureReason: reason },
    });
  }

  /**
   * Applies a verified payment atomically: claim → entitlement (unlock) → earning → ledger.
   * The PENDING→SUCCEEDED claim guarantees it runs at most once.
   */
  private async fulfill(p: PaymentIntent): Promise<void> {
    const holdMs = this.config.get('EARNINGS_HOLD_MINUTES', { infer: true }) * 60_000;
    const fulfilled = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.paymentIntent.updateMany({
        where: { id: p.id, status: 'PENDING' },
        data: { status: 'SUCCEEDED', succeededAt: new Date() },
      });
      if (claim.count !== 1) return false;

      // Pool funding: the full amount goes into the pool's escrow; no fee, no creator earning.
      if (p.kind === 'POOL_FUNDING') {
        const pool = await tx.rewardPool.updateMany({
          where: { id: p.rewardPoolId!, status: 'DRAFT' },
          data: { status: 'FUNDED', fundedAt: new Date() },
        });
        if (pool.count !== 1)
          throw new Error(`Pool ${p.rewardPoolId} was not in DRAFT when funded`);
        await this.ledger.post(
          tx,
          'POOL_FUNDED',
          p.currency,
          [
            { account: accounts.providerClearing(p.provider), amountMinor: -p.amountMinor },
            { account: accounts.poolEscrow(p.rewardPoolId!), amountMinor: p.amountMinor },
          ],
          { paymentId: p.id },
        );
        return true;
      }
      const payeeId = p.payeeId!;

      let source: 'TIP' | 'PHOTO_SALE' | 'VIDEO_SALE' = 'TIP';
      if (p.kind === 'UNLOCK' && p.postId) {
        await tx.contentEntitlement.createMany({
          data: [{ userId: p.payerId, postId: p.postId, paymentId: p.id }],
          skipDuplicates: true,
        });
        const post = await tx.post.findUnique({ where: { id: p.postId }, select: { type: true } });
        source = post?.type === 'VIDEO' ? 'VIDEO_SALE' : 'PHOTO_SALE';
      }
      const fee = feeFor(p.amountMinor, p.feeBps);
      const net = p.amountMinor - fee;
      // USDC on Arc already reached the creator's wallet: record it as paid, nothing to hold.
      const direct = p.provider === ARC_PROVIDER;
      const earning = await tx.earning.create({
        data: {
          creatorId: payeeId,
          source,
          paymentId: p.id,
          postId: p.postId,
          grossMinor: p.amountMinor,
          feeMinor: fee,
          netMinor: net,
          currency: p.currency,
          status: direct ? 'PAID' : 'PENDING',
          availableAt: new Date(direct ? Date.now() : Date.now() + holdMs),
        },
      });
      if (direct) {
        await this.ledger.post(
          tx,
          'PAYMENT_CAPTURED',
          p.currency,
          [
            { account: accounts.providerClearing(p.provider), amountMinor: -p.amountMinor },
            { account: accounts.creatorWallet(payeeId), amountMinor: net, userId: payeeId },
            { account: accounts.platformFees, amountMinor: fee },
          ],
          { paymentId: p.id, earningId: earning.id },
        );
        return true;
      }
      await this.ledger.post(
        tx,
        'PAYMENT_CAPTURED',
        p.currency,
        [
          { account: accounts.providerClearing(p.provider), amountMinor: -p.amountMinor },
          { account: accounts.creatorPending(payeeId), amountMinor: net, userId: payeeId },
          { account: accounts.platformFees, amountMinor: fee },
        ],
        { paymentId: p.id, earningId: earning.id },
      );
      return true;
    });
    if (fulfilled && p.payeeId) {
      await this.notifications.notify({
        userId: p.payeeId,
        type: p.kind === 'TIP' ? 'TIP_RECEIVED' : 'CONTENT_PURCHASED',
        actorId: p.payerId,
        postId: p.postId,
      });
    }
  }

  // ───────────────────────────── History ─────────────────────────────

  async listMine(
    viewer: RequestUser,
    cursorRaw: string | undefined,
    limit: number,
  ): Promise<Paginated<PaymentDto>> {
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.paymentIntent.findMany({
      where: {
        payerId: viewer.id,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: paymentInclude,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await Promise.all(page.map((r) => this.toDto(r))),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** Posts the viewer has unlocked, most recent purchase first. */
  async library(viewer: RequestUser): Promise<PostDto[]> {
    const ents = await this.prisma.contentEntitlement.findMany({
      where: { userId: viewer.id, post: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { post: { include: postInclude } },
    });
    return this.mapper.toDtos(
      ents.map((e) => e.post),
      viewer,
    );
  }

  async get(id: string, viewer: RequestUser): Promise<PaymentDto> {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!row || row.payerId !== viewer.id) throw notFound('That payment');
    return this.toDto(row);
  }

  private async toDto(r: PaymentRow): Promise<PaymentDto> {
    const fee = feeFor(r.amountMinor, r.feeBps);
    const media = r.post?.media[0];
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      amountMinor: r.amountMinor,
      currency: r.currency,
      feeMinor: fee,
      creatorReceivesMinor: r.amountMinor - fee,
      checkoutUrl: r.status === 'PENDING' ? r.checkoutUrl : null,
      provider: r.provider,
      testMode: r.provider === ARC_PROVIDER ? true : this.provider.testMode,
      failureReason: r.failureReason,
      post: r.post
        ? {
            id: r.post.id,
            caption: r.post.caption.slice(0, 120),
            thumbUrl: await this.storage.privateUrl(media?.previewKey ?? media?.thumbKey),
          }
        : null,
      payee: r.payee,
      pool: r.rewardPool,
      createdAt: r.createdAt.toISOString(),
      succeededAt: r.succeededAt?.toISOString() ?? null,
      txUrl:
        r.provider === ARC_PROVIDER && r.providerRef
          ? `${this.config.get('ARC_EXPLORER_URL', { infer: true }).replace(/\/$/, '')}/tx/${r.providerRef}`
          : null,
    };
  }
}

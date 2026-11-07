import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from '@x402/core/types';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import type { Env } from '../../config/env.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { visiblePostsWhere } from '../posts/posts.service.js';

export const X402_FACILITATOR = Symbol('X402_FACILITATOR');
export const X402_PROVIDER = 'hedera-x402';

export interface CatalogItem {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  title: string;
  creator: { id: string; username: string | null; displayName: string | null };
  event: { id: string; title: string; city: string } | null;
  artists: string[];
  price: { inrMinor: number; usd: string; asset: 'USDC'; network: string };
  durationMs: number | null;
  previewUrl: string | null;
  /** x402-protected endpoint: GET → 402 with payment requirements; retry with PAYMENT-SIGNATURE. */
  endpoint: string;
}

export type ContentResult =
  | { kind: 'payment_required'; body: PaymentRequired }
  | {
      kind: 'paid';
      settlement: SettleResponse;
      body: {
        postId: string;
        type: 'PHOTO' | 'VIDEO';
        mediaUrl: string | null;
        downloadUrl: string | null;
        expiresInSeconds: number;
        licence: string;
        settlement: {
          transaction: string;
          network: string;
          payer: string | null;
          hashscan: string;
        };
        alreadyRecorded: boolean;
      };
    };

const LICENCE =
  'Personal-use licence. Does not transfer copyright and grants no rights to the artist’s performance or music.';

/** Hedera tx id "0.0.123@1700000000.123456789" → HashScan's "0.0.123-1700000000-123456789". */
export function hashscanUrl(network: string, txId: string): string {
  const net = network.endsWith('mainnet') ? 'mainnet' : 'testnet';
  const m = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(txId);
  const id = m ? `${m[1]}-${m[2]}-${m[3]}` : txId;
  return `https://hashscan.io/${net}/transaction/${id}`;
}

/** INR minor units → "$X.YZ" (rounded up to the cent, min $0.01) at the configured demo rate. */
export function inrToUsdMoney(inrMinor: number, inrPerUsd: number): string {
  const cents = Math.max(1, Math.ceil(inrMinor / inrPerUsd));
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * x402 resource server for paid posts. Agents (or any HTTP client) get `402 Payment Required`
 * with Hedera payment requirements, pay in USDC through the facilitator, and receive the
 * content. The settled Hedera transaction is recorded through the normal payments pipeline,
 * so creators see the sale in Earnings and the ledger stays balanced.
 */
@Injectable()
export class X402Service {
  private readonly logger = new Logger(X402Service.name);
  private readonly server: x402ResourceServer;
  private ready?: Promise<void>;

  constructor(
    @Inject(X402_FACILITATOR) facilitator: FacilitatorClient,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
  ) {
    // Default assets include Circle's testnet/mainnet USDC on Hedera.
    this.server = new x402ResourceServer(facilitator).register('hedera:*', new ExactHederaScheme());
  }

  private get network() {
    return this.config.get('X402_NETWORK', { infer: true });
  }

  private init(): Promise<void> {
    // Fetches the facilitator's supported kinds (fee payer etc.). Retried on failure.
    this.ready ??= this.server.initialize().catch((err: unknown) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  private endpointFor(postId: string) {
    return `${this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '')}/v1/x402/posts/${postId}/content`;
  }

  /** Agents always pay in USD(C): ₹ prices convert at X402_INR_PER_USD; USD prices are exact. */
  private priceUsd(minor: number, currency: string) {
    if (currency === 'USD') return `$${(minor / 100).toFixed(2)}`;
    return inrToUsdMoney(minor, this.config.get('X402_INR_PER_USD', { infer: true }));
  }

  /** x402 is opt-in per deployment; when off, every x402 route behaves as if it didn't exist. */
  assertEnabled(): void {
    if (!this.config.get('X402_ENABLED', { infer: true })) throw notFound('That page');
  }

  /** Paid (fixed-price) posts that agents can buy. */
  async catalog(limit = 50): Promise<CatalogItem[]> {
    this.assertEnabled();
    const posts = await this.prisma.post.findMany({
      where: { ...visiblePostsWhere([]), monetizationMode: 'PAY_TO_UNLOCK' },
      orderBy: { publishedAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        author: { select: { id: true, username: true, displayName: true } },
        event: { select: { id: true, title: true, city: true } },
        artists: { select: { artist: { select: { stageName: true } } } },
        media: { take: 1 },
      },
    });
    return Promise.all(
      posts.map(async (p) => ({
        id: p.id,
        type: p.type,
        title:
          p.caption.slice(0, 120) ||
          `${p.type === 'VIDEO' ? 'Video' : 'Photo'} by ${p.author.displayName ?? p.author.username ?? 'a creator'}`,
        creator: p.author,
        event: p.event,
        artists: p.artists.map((a) => a.artist.stageName),
        price: {
          inrMinor:
            p.currency === 'USD'
              ? Math.round(p.priceMinor! * this.config.get('X402_INR_PER_USD', { infer: true }))
              : p.priceMinor!,
          usd: this.priceUsd(p.priceMinor!, p.currency),
          asset: 'USDC' as const,
          network: this.network,
        },
        durationMs: p.media[0]?.durationMs ?? null,
        previewUrl: await this.storage.privateUrl(p.media[0]?.previewKey),
        endpoint: this.endpointFor(p.id),
      })),
    );
  }

  private async requirementsFor(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, ...visiblePostsWhere([]), monetizationMode: 'PAY_TO_UNLOCK' },
      include: { media: { take: 1 }, author: { select: { displayName: true, username: true } } },
    });
    if (!post || post.priceMinor == null) throw notFound('That paid post');
    await this.init();
    const requirements = await this.server.buildPaymentRequirements({
      scheme: 'exact',
      network: this.network,
      payTo: this.config.get('X402_PAY_TO', { infer: true })!,
      price: this.priceUsd(post.priceMinor, post.currency),
      maxTimeoutSeconds: 120,
    });
    const resource = {
      url: this.endpointFor(post.id),
      description: `${post.type === 'VIDEO' ? 'Live video' : 'Live photo'} by ${post.author.displayName ?? post.author.username ?? 'a MUSO creator'}`,
      mimeType: 'application/json',
      serviceName: 'MUSO',
    };
    return { post, requirements, resource };
  }

  /** Handles one request to the protected endpoint. `paymentHeader` is the decoded PAYMENT-SIGNATURE. */
  async content(postId: string, payload: PaymentPayload | null): Promise<ContentResult> {
    this.assertEnabled();
    const { post, requirements, resource } = await this.requirementsFor(postId);
    const required = (error?: string) =>
      this.server.createPaymentRequiredResponse(requirements, resource, error);

    if (!payload) return { kind: 'payment_required', body: await required() };

    const match: PaymentRequirements | undefined = this.server.findMatchingRequirements(
      requirements,
      payload,
    );
    if (!match)
      return {
        kind: 'payment_required',
        body: await required('Payment does not match the current price or network'),
      };

    const verified = await this.server.verifyPayment(payload, match);
    if (!verified.isValid) {
      return {
        kind: 'payment_required',
        body: await required(verified.invalidReason ?? 'Payment could not be verified'),
      };
    }
    const settled = await this.server.settlePayment(payload, match);
    if (!settled.success || !settled.transaction) {
      return {
        kind: 'payment_required',
        body: await required(settled.errorReason ?? 'Payment could not be settled'),
      };
    }

    // Settled on Hedera: record it through the normal pipeline (idempotent on the tx id).
    const payerId = await this.agentUserFor(settled.payer ?? 'unknown');
    const recorded = await this.payments.recordSettledUnlock({
      payerId,
      postId: post.id,
      amountMinor: post.priceMinor!,
      currency: post.currency,
      provider: X402_PROVIDER,
      providerRef: settled.transaction,
    });
    this.logger.log(`x402 sale ${post.id} tx=${settled.transaction} payer=${settled.payer}`);

    const m = post.media[0];
    return {
      kind: 'paid',
      settlement: settled,
      body: {
        postId: post.id,
        type: post.type,
        mediaUrl: await this.storage.privateUrl(m?.displayKey),
        downloadUrl:
          post.type === 'PHOTO' ? await this.storage.privateUrl(m?.fullKey ?? m?.displayKey) : null,
        expiresInSeconds: 3600,
        licence: LICENCE,
        settlement: {
          transaction: settled.transaction,
          network: settled.network,
          payer: settled.payer ?? null,
          hashscan: hashscanUrl(settled.network, settled.transaction),
        },
        alreadyRecorded: recorded.alreadyRecorded,
      },
    };
  }

  /**
   * Agents aren't MUSO accounts. Each paying Hedera account gets a passwordless "agent" user
   * (cannot sign in) so purchases, entitlements and earnings attribute cleanly.
   */
  private async agentUserFor(hederaAccount: string): Promise<string> {
    const safe = hederaAccount.replace(/[^0-9a-z.]/gi, '').slice(0, 40) || 'unknown';
    const email = `agent-${safe}@agents.muso.invalid`;
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName: `Agent ${safe}`, roles: { create: { role: 'SUPPORTER' } } },
    });
    return user.id;
  }
}

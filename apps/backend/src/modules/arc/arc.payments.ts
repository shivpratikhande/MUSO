import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { PaymentDto } from '@muso/shared';
import { getAddress, isHex, type Address, type Hex } from 'viem';
import { badRequest, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ARC_PROVIDER, PaymentsService } from '../payments/payments.service.js';
import { ARC_CHAIN, type ArcChain } from './arc.chain.js';

/** USDC has 6 decimals; MUSO's USD minor units are cents. */
export const usdcBaseUnits = (minor: number) => BigInt(minor) * 10_000n;
/** A transfer may be mined slightly before MUSO recorded the checkout (clock skew). */
const SKEW_S = 120;

/**
 * Unlocks and tips paid in USDC on Arc, wallet to wallet. MUSO never holds the money: it only
 * checks on-chain that the payer's linked wallet sent the exact amount to the creator's linked
 * wallet, after the checkout started, in a transaction not used for any other payment.
 */
@Injectable()
export class ArcPaymentsService {
  private readonly logger = new Logger(ArcPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Optional() @Inject(ARC_CHAIN) private readonly chain: ArcChain | null,
  ) {}

  /** What the wallet page shows and sends. Throws when the payment can't be paid any more. */
  async describe(paymentId: string, payerId: string) {
    const p = await this.load(paymentId, payerId);
    if (p.status !== 'PENDING' || p.expiresAt <= new Date())
      throw badRequest('This payment has already finished or expired. Start again from the app.');
    return {
      id: p.id,
      kind: p.kind as 'UNLOCK' | 'TIP',
      amountUsdc: p.amountMinor / 100,
      amountMicro: usdcBaseUnits(p.amountMinor).toString(),
      payTo: getAddress(p.payee!.walletAddress!),
      creator: p.payee!.displayName ?? p.payee!.username ?? 'the creator',
      caption: p.post?.caption.slice(0, 80) ?? '',
    };
  }

  /** The wallet page reports its transaction. Checked on-chain before anything is granted. */
  async confirm(paymentId: string, payerId: string, txHash: string): Promise<PaymentDto> {
    if (!isHex(txHash) || txHash.length !== 66) throw badRequest('That isn’t a transaction hash');
    const p = await this.load(paymentId, payerId);
    const chain = this.requireChain();
    // The page waits for the receipt, but RPC nodes can lag a moment behind.
    let result = await chain.usdcTransfers(txHash as Hex);
    for (let i = 0; !result && i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await chain.usdcTransfers(txHash as Hex);
    }
    if (!result) throw badRequest('That transaction isn’t on Arc yet. Try again in a moment.');
    if (!result.ok) throw badRequest('That transaction failed on Arc. No USDC was sent.');
    if (!p.payer.walletAddress) throw badRequest('Link your wallet first');
    if (result.at < Math.floor(p.createdAt.getTime() / 1000) - SKEW_S)
      throw badRequest('That transaction is older than this payment');
    const from = getAddress(p.payer.walletAddress);
    const to = getAddress(p.payee!.walletAddress!);
    const value = usdcBaseUnits(p.amountMinor);
    const match = result.transfers.some((t) => t.from === from && t.to === to && t.value === value);
    if (!match)
      throw badRequest(
        `That transaction doesn’t send ${p.amountMinor / 100} USDC from your linked wallet to the creator`,
      );
    return this.payments.confirmArcPayment(p.id, txHash);
  }

  /**
   * Finds the payment on-chain when the wallet page never reported back (wallet browsers often
   * close or reload). Looks for the exact transfer in recent blocks. Returns the payment.
   */
  async check(paymentId: string, payerId: string): Promise<PaymentDto> {
    const p = await this.load(paymentId, payerId);
    if (
      (p.status === 'PENDING' || p.status === 'EXPIRED') &&
      !p.providerRef &&
      p.payer.walletAddress &&
      this.chain
    ) {
      const hash = await this.chain
        .findUsdcTransfer(
          getAddress(p.payer.walletAddress),
          getAddress(p.payee!.walletAddress!),
          usdcBaseUnits(p.amountMinor),
          Math.floor(p.createdAt.getTime() / 1000) - SKEW_S,
        )
        .catch((err: Error) => {
          this.logger.warn(`USDC lookup for payment ${p.id} failed: ${err.message}`);
          return null;
        });
      if (hash) {
        const used = await this.prisma.paymentIntent.findUnique({
          where: { provider_providerRef: { provider: ARC_PROVIDER, providerRef: hash } },
        });
        if (!used) return this.confirm(p.id, payerId, hash);
      }
    }
    return this.payments.verify(p.id, { id: payerId } as never);
  }

  /** Worker: picks up USDC payments whose page never reported (last 2 hours). */
  async reconcile(): Promise<void> {
    const open = await this.prisma.paymentIntent.findMany({
      where: {
        provider: ARC_PROVIDER,
        status: { in: ['PENDING', 'EXPIRED'] },
        providerRef: null,
        createdAt: { gt: new Date(Date.now() - 2 * 3600_000) },
      },
      select: { id: true, payerId: true, status: true },
      take: 20,
    });
    for (const p of open) {
      await this.check(p.id, p.payerId).catch((err: Error) =>
        this.logger.warn(`USDC payment ${p.id}: ${err.message}`),
      );
    }
  }

  private requireChain(): ArcChain {
    if (!this.chain) throw badRequest('USDC payments aren’t enabled on this server');
    return this.chain;
  }

  private async load(paymentId: string, payerId: string) {
    const p = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentId },
      include: {
        payer: { select: { walletAddress: true } },
        payee: { select: { walletAddress: true, displayName: true, username: true } },
        post: { select: { caption: true } },
      },
    });
    if (!p || p.payerId !== payerId || p.provider !== ARC_PROVIDER) throw notFound('That payment');
    if (!p.payee?.walletAddress)
      throw badRequest('This creator hasn’t linked a USDC wallet yet, so they can’t be paid.');
    return p as typeof p & { payer: { walletAddress: Address | null } };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  ProviderStatus,
} from './payment-provider.js';

/**
 * Sandbox provider — behaves like a hosted checkout but moves no money.
 * The `sandbox_payments` table stands in for the external processor's records; the app can
 * only complete a payment through the HMAC-signed checkout page, never via the API.
 */
@Injectable()
export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';
  readonly testMode = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const ref = `sbx_${randomBytes(12).toString('hex')}`;
    await this.prisma.sandboxPayment.create({
      data: {
        ref,
        amountMinor: req.amountMinor,
        currency: req.currency,
        status: 'requires_action',
        returnUrl: req.returnUrl,
      },
    });
    const base = this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
    return {
      providerRef: ref,
      checkoutUrl: `${base}/v1/payments/sandbox/${ref}?sig=${this.sign(ref)}`,
    };
  }

  async fetchStatus(
    ref: string,
  ): Promise<{ status: ProviderStatus; amountMinor: number; currency: string }> {
    const p = await this.prisma.sandboxPayment.findUniqueOrThrow({ where: { ref } });
    const status: ProviderStatus =
      p.status === 'succeeded'
        ? 'succeeded'
        : p.status === 'declined'
          ? 'failed'
          : p.status === 'cancelled'
            ? 'cancelled'
            : 'pending';
    return { status, amountMinor: p.amountMinor, currency: p.currency };
  }

  sign(ref: string): string {
    return createHmac('sha256', this.config.get('PAYMENTS_SIGNING_SECRET', { infer: true }))
      .update(`sandbox:${ref}`)
      .digest('base64url');
  }

  verifySignature(ref: string, sig: string | undefined): boolean {
    if (!sig) return false;
    const a = Buffer.from(this.sign(ref));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Records the payer's decision on the hosted page. Only from requires_action (no double completion). */
  async complete(
    ref: string,
    outcome: 'pay' | 'decline' | 'cancel',
  ): Promise<{ returnUrl: string; status: string } | null> {
    const status =
      outcome === 'pay' ? 'succeeded' : outcome === 'decline' ? 'declined' : 'cancelled';
    const updated = await this.prisma.sandboxPayment.updateMany({
      where: { ref, status: 'requires_action' },
      data: { status, completedAt: new Date() },
    });
    const p = await this.prisma.sandboxPayment.findUnique({ where: { ref } });
    if (!p) return null;
    return { returnUrl: p.returnUrl, status: updated.count ? status : p.status };
  }
}

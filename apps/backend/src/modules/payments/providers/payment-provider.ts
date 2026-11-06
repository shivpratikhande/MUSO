/**
 * Payment provider abstraction. Business logic (payments.service) only talks to this
 * interface, so Razorpay/Cashfree (fiat) or an on-chain provider (M6) can be added without
 * touching pricing, entitlements, earnings or the ledger.
 */
export interface CheckoutRequest {
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  /** Deep link the hosted checkout returns to (muso:// or Expo Go exp://). */
  returnUrl: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
}

/** Provider-reported state. Only the provider's answer can move a payment to SUCCEEDED. */
export type ProviderStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface PaymentProvider {
  readonly name: string;
  /** True when no real money moves (sandbox/testnet). Surfaced to the app. */
  readonly testMode: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  fetchStatus(
    providerRef: string,
  ): Promise<{ status: ProviderStatus; amountMinor: number; currency: string }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

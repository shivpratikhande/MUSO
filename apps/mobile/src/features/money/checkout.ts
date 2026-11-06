import type { PaymentDto } from '@muso/shared';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/services/api';

export type CheckoutRequest =
  | { kind: 'UNLOCK'; postId: string; amountMinor?: number }
  | { kind: 'TIP'; postId: string; amountMinor: number; message?: string }
  | { kind: 'POOL_FUNDING'; poolId: string };

/**
 * Opens the provider's hosted checkout in an in-app browser, then asks *our server* for the
 * outcome (the server verifies with the provider). The app never decides success itself.
 * `idempotencyKey` must be stable across retries of the same purchase.
 */
export async function runCheckout(
  req: CheckoutRequest,
  idempotencyKey: string,
): Promise<PaymentDto> {
  const returnUrl = Linking.createURL('payments/return');
  let payment = await api.payments.checkout({ ...req, idempotencyKey, returnUrl } as Parameters<
    typeof api.payments.checkout
  >[0]);
  if (payment.status === 'PENDING' && payment.checkoutUrl) {
    await WebBrowser.openAuthSessionAsync(payment.checkoutUrl, returnUrl);
  }
  // The browser may close before the provider has recorded the result; poll briefly.
  for (let i = 0; i < 6; i++) {
    payment = await api.payments.verify(payment.id);
    if (payment.status !== 'PENDING') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return payment;
}

export const newIdempotencyKey = () => Crypto.randomUUID();

import { describe, expect, it } from 'vitest';
import { CreateCheckoutSchema, feeFor, formatMoney, moneyRules } from '../index.js';

describe('money helpers', () => {
  it('formats INR from paise', () => {
    expect(formatMoney(4900)).toBe('₹49');
    expect(formatMoney(4950)).toBe('₹49.50');
    expect(formatMoney(12345600)).toBe('₹1,23,456');
  });

  it('computes fees in integer paise with half-up rounding', () => {
    expect(feeFor(4900, 1000)).toBe(490);
    expect(feeFor(1005, 1000)).toBe(101); // 100.5 → 101
    expect(feeFor(1004, 1000)).toBe(100);
    expect(feeFor(0, 1000)).toBe(0);
  });

  it('has per-currency limits and shows USD as USDC', () => {
    expect(moneyRules('INR').minPrice).toBe(1_000);
    expect(moneyRules('USD')).toMatchObject({ minPrice: 50, maxPrice: 10_000, minTip: 50 });
    expect(moneyRules('EUR')).toBe(moneyRules('INR'));
    expect(formatMoney(150, 'USD')).toBe('1.50 USDC');
    expect(formatMoney(100, 'USD')).toBe('1 USDC');
    expect(formatMoney(4900, 'INR')).toBe('₹49');
  });

  it('bounds tips', () => {
    const base = {
      kind: 'TIP',
      postId: '0190a6f0-0000-7000-8000-000000000001',
      idempotencyKey: '0190a6f0-0000-7000-8000-000000000002',
      returnUrl: 'muso://x',
    };
    // Widest bounds of any currency (0.50 USDC); the server applies the post's currency limits.
    expect(CreateCheckoutSchema.safeParse({ ...base, amountMinor: 49 }).success).toBe(false);
    expect(CreateCheckoutSchema.safeParse({ ...base, amountMinor: 50 }).success).toBe(true);
    expect(CreateCheckoutSchema.safeParse({ ...base, amountMinor: 2000 }).success).toBe(true);
    expect(CreateCheckoutSchema.safeParse({ ...base, amountMinor: 2_000_000 }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  decide,
  record,
  usdToCents,
  type CatalogItem,
  type Policy,
  type SpendState,
} from './policy.js';

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'p1',
  type: 'PHOTO',
  title: 'Monsoon Sessions encore',
  creator: { id: 'c1', username: 'shivv', displayName: 'Shiv' },
  event: { id: 'e1', title: 'Monsoon Sessions', city: 'Mumbai' },
  artists: ['Nila Waves'],
  price: { inrMinor: 4900, usd: '$0.59', asset: 'USDC', network: 'hedera:testnet' },
  endpoint: 'http://x/v1/x402/posts/p1/content',
  ...over,
});
const policy = (over: Partial<Policy> = {}): Policy => ({
  budgetCents: 200,
  maxPerItemCents: 75,
  maxPerCreatorCents: 100,
  allowlist: [],
  query: null,
  maxItems: 5,
  network: 'hedera:testnet',
  ...over,
});
const fresh = (): SpendState => ({ spentCents: 0, perCreatorCents: {}, bought: new Set() });

describe('agent spending policy', () => {
  it('parses USD prices to cents', () => {
    expect(usdToCents('$0.59')).toBe(59);
    expect(usdToCents('$2')).toBe(200);
    expect(usdToCents('$1.5')).toBe(150);
    expect(usdToCents('free')).toBeNaN();
  });

  it('buys within all limits', () => {
    expect(decide(item(), policy(), fresh())).toEqual({ buy: true, cents: 59 });
  });

  it('enforces the per-item cap, total budget and per-creator limit', () => {
    expect(
      decide(item({ price: { ...item().price, usd: '$0.99' } }), policy(), fresh()),
    ).toMatchObject({ buy: false, reason: expect.stringContaining('per-item') });
    const s = fresh();
    record(s, item(), 59);
    expect(decide(item({ id: 'p2' }), policy(), s)).toMatchObject({
      buy: false,
      reason: 'would exceed per-creator limit',
    });
    expect(
      decide(
        item({ id: 'p3', creator: { id: 'c2', username: 'x', displayName: null } }),
        policy({ budgetCents: 100 }),
        s,
      ),
    ).toMatchObject({
      buy: false,
      reason: 'would exceed total budget',
    });
  });

  it('respects allowlist, query, network and duplicates', () => {
    expect(decide(item(), policy({ allowlist: ['someone-else'] }), fresh())).toMatchObject({
      buy: false,
      reason: 'creator not on allowlist',
    });
    expect(decide(item(), policy({ allowlist: ['shivv'] }), fresh())).toMatchObject({ buy: true });
    expect(decide(item(), policy({ query: 'goa' }), fresh())).toMatchObject({ buy: false });
    expect(decide(item(), policy({ query: 'nila' }), fresh())).toMatchObject({ buy: true });
    expect(
      decide(item({ price: { ...item().price, network: 'hedera:mainnet' } }), policy(), fresh()),
    ).toMatchObject({ buy: false });
    const s = fresh();
    record(s, item(), 59);
    expect(decide(item(), policy(), s)).toMatchObject({ buy: false, reason: 'already bought' });
  });
});

/**
 * The agent's spending policy, kept pure so it can be tested without a network.
 * The agent never pays unless every rule passes; there is no human approval step.
 */
export interface CatalogItem {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  title: string;
  creator: { id: string; username: string | null; displayName: string | null };
  event: { id: string; title: string; city: string } | null;
  artists: string[];
  price: { inrMinor: number; usd: string; asset: string; network: string };
  endpoint: string;
}

export interface Policy {
  budgetCents: number;
  maxPerItemCents: number;
  maxPerCreatorCents: number;
  /** Lowercased usernames/ids. Empty = any creator. */
  allowlist: string[];
  query: string | null;
  maxItems: number;
  network: string;
}

export interface SpendState {
  spentCents: number;
  perCreatorCents: Record<string, number>;
  bought: Set<string>;
}

export type Decision = { buy: true; cents: number } | { buy: false; reason: string };

export const usdToCents = (usd: string): number => {
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(usd.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
};

export function matchesQuery(item: CatalogItem, query: string | null): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    item.title,
    item.event?.title,
    item.event?.city,
    ...item.artists,
    item.creator.username,
    item.creator.displayName,
  ]
    .filter(Boolean)
    .some((s) => s!.toLowerCase().includes(q));
}

export function decide(item: CatalogItem, policy: Policy, state: SpendState): Decision {
  if (state.bought.has(item.id)) return { buy: false, reason: 'already bought' };
  if (state.bought.size >= policy.maxItems) return { buy: false, reason: 'item limit reached' };
  if (item.price.network !== policy.network)
    return { buy: false, reason: `wrong network ${item.price.network}` };
  if (item.price.asset !== 'USDC')
    return { buy: false, reason: `unsupported asset ${item.price.asset}` };
  if (!matchesQuery(item, policy.query)) return { buy: false, reason: 'does not match query' };
  const creatorKeys = [item.creator.id, item.creator.username]
    .filter(Boolean)
    .map((s) => s!.toLowerCase());
  if (policy.allowlist.length && !creatorKeys.some((k) => policy.allowlist.includes(k))) {
    return { buy: false, reason: 'creator not on allowlist' };
  }
  const cents = usdToCents(item.price.usd);
  if (!Number.isFinite(cents) || cents <= 0) return { buy: false, reason: 'unreadable price' };
  if (cents > policy.maxPerItemCents)
    return { buy: false, reason: `price ${item.price.usd} above per-item limit` };
  if (state.spentCents + cents > policy.budgetCents)
    return { buy: false, reason: 'would exceed total budget' };
  if ((state.perCreatorCents[item.creator.id] ?? 0) + cents > policy.maxPerCreatorCents) {
    return { buy: false, reason: 'would exceed per-creator limit' };
  }
  return { buy: true, cents };
}

export function record(state: SpendState, item: CatalogItem, cents: number): void {
  state.spentCents += cents;
  state.perCreatorCents[item.creator.id] = (state.perCreatorCents[item.creator.id] ?? 0) + cents;
  state.bought.add(item.id);
}

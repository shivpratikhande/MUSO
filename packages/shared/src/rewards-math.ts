/**
 * Splits `budget` (integer minor units) among items in proportion to `weight`, with an
 * optional per-item cap. Excess above a cap is redistributed to the uncapped items
 * ("water-filling"). Integer rounding uses the largest-remainder method with a deterministic
 * tie-break on id, so the result is exact and reproducible.
 *
 * Returns each item's share and the unallocated remainder (non-zero only when every item is
 * capped or there are no eligible items). Invariant: sum(shares) + unallocated === budget.
 */
export interface WeightedItem {
  id: string;
  weight: number;
}

export interface Split {
  shares: Map<string, number>;
  capped: Set<string>;
  unallocated: number;
}

export function splitProportionally(
  items: WeightedItem[],
  budget: number,
  capPerItem = Infinity,
): Split {
  if (!Number.isInteger(budget) || budget < 0)
    throw new Error('budget must be a non-negative integer');
  const shares = new Map<string, number>();
  const capped = new Set<string>();
  const live = items.filter((i) => i.weight > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const i of items) shares.set(i.id, 0);
  if (!live.length || budget === 0) return { shares, capped, unallocated: budget };

  const cap = Math.floor(capPerItem);
  let remaining = budget;
  let open = live;
  // Water-filling: give capped items their cap, redistribute the rest among the others.
  for (;;) {
    const total = open.reduce((s, i) => s + i.weight, 0);
    const over = open.filter((i) => (remaining * i.weight) / total >= cap);
    if (!over.length) break;
    for (const i of over) {
      shares.set(i.id, cap);
      capped.add(i.id);
      remaining -= cap;
    }
    open = open.filter((i) => !capped.has(i.id));
    if (!open.length || remaining <= 0)
      return { shares, capped, unallocated: Math.max(0, remaining) };
  }

  // Largest remainder over the uncapped items.
  const total = open.reduce((s, i) => s + i.weight, 0);
  const exact = open.map((i) => ({ id: i.id, raw: (remaining * i.weight) / total }));
  let given = 0;
  for (const e of exact) {
    const f = Math.floor(e.raw);
    shares.set(e.id, f);
    given += f;
  }
  let left = remaining - given;
  const byRemainder = [...exact].sort(
    (a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || (a.id < b.id ? -1 : 1),
  );
  for (const e of byRemainder) {
    if (left <= 0) break;
    if (shares.get(e.id)! + 1 > cap) continue;
    shares.set(e.id, shares.get(e.id)! + 1);
    left--;
  }
  return { shares, capped, unallocated: left };
}

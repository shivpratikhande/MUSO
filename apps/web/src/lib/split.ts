export interface SplitEntry {
  id: string;
  /** Qualified watch time. Zero means the entry gets nothing. */
  weight: number;
}

/**
 * Proportional split with a per-clip cap, in whole cents (the API does the same in paise).
 * Anything above a cap goes to the uncapped entries; leftover cents go to the largest remainders.
 */
export function splitPool(budget: number, cap: number, entries: SplitEntry[]) {
  const out: Record<string, number> = Object.fromEntries(entries.map((e) => [e.id, 0]));
  let remaining = budget;
  let active = entries.filter((e) => e.weight > 0);

  while (active.length && remaining > 0) {
    const total = active.reduce((s, e) => s + e.weight, 0);
    const over = active.filter((e) => (remaining * e.weight) / total >= cap);
    if (over.length) {
      for (const e of over) {
        out[e.id] = cap;
        remaining -= cap;
      }
      active = active.filter((e) => !over.includes(e));
      continue;
    }
    const shares = active.map((e) => {
      const exact = (remaining * e.weight) / total;
      return { id: e.id, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let left = remaining - shares.reduce((s, x) => s + x.floor, 0);
    shares.sort((a, b) => b.frac - a.frac);
    for (const x of shares) out[x.id] = x.floor + (left-- > 0 ? 1 : 0);
    remaining = 0;
  }
  return { out, unallocated: Math.max(0, remaining) };
}

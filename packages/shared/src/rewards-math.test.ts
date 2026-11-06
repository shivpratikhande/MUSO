import { describe, expect, it } from 'vitest';
import { splitProportionally } from './rewards-math.js';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('splitProportionally', () => {
  it('matches the spec example exactly', () => {
    const r = splitProportionally(
      [
        { id: 'a', weight: 5000 },
        { id: 'b', weight: 3000 },
        { id: 'c', weight: 2000 },
      ],
      1_000_000,
    );
    expect(Object.fromEntries(r.shares)).toEqual({ a: 500_000, b: 300_000, c: 200_000 });
    expect(r.unallocated).toBe(0);
  });

  it('never loses or creates a paisa', () => {
    for (let n = 1; n < 40; n++) {
      const items = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        weight: ((i * 7919) % 97) + 1,
      }));
      for (const budget of [1, 7, 100, 99_999, 1_000_003]) {
        const r = splitProportionally(items, budget);
        expect(sum(r.shares) + r.unallocated).toBe(budget);
        expect(r.unallocated).toBe(0);
      }
    }
  });

  it('applies caps and redistributes the excess', () => {
    const r = splitProportionally(
      [
        { id: 'whale', weight: 9000 },
        { id: 'b', weight: 500 },
        { id: 'c', weight: 500 },
      ],
      10_000,
      4_000,
    );
    expect(r.shares.get('whale')).toBe(4_000);
    expect(r.shares.get('b')).toBe(3_000);
    expect(r.shares.get('c')).toBe(3_000);
    expect([...r.capped]).toEqual(['whale']);
  });

  it('leaves money unallocated when everyone hits the cap', () => {
    const r = splitProportionally(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
      10_000,
      2_500,
    );
    expect(Object.fromEntries(r.shares)).toEqual({ a: 2_500, b: 2_500 });
    expect(r.unallocated).toBe(5_000);
  });

  it('ignores zero weights and handles no eligible items', () => {
    expect(splitProportionally([], 500).unallocated).toBe(500);
    const r = splitProportionally(
      [
        { id: 'a', weight: 0 },
        { id: 'b', weight: 3 },
      ],
      100,
    );
    expect(Object.fromEntries(r.shares)).toEqual({ a: 0, b: 100 });
  });

  it('is deterministic regardless of input order', () => {
    const items = [
      { id: 'x', weight: 1 },
      { id: 'y', weight: 1 },
      { id: 'z', weight: 1 },
    ];
    const a = splitProportionally(items, 100);
    const b = splitProportionally([...items].reverse(), 100);
    expect(Object.fromEntries(a.shares)).toEqual(Object.fromEntries(b.shares));
  });
});

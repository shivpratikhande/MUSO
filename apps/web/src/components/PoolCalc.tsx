'use client';

import { useState } from 'react';
import { splitPool } from '@/lib/split';
import { Range, Toggle } from './Controls';

const START = [
  { id: 'alice', name: 'alice.films', initials: 'AF', color: 'var(--lime)', mins: 340, human: true },
  { id: 'bob', name: 'bob_crowd', initials: 'BC', color: 'var(--violet)', mins: 180, human: true },
  { id: 'riya', name: 'riya.k', initials: 'RK', color: 'var(--coral)', mins: 120, human: true },
  { id: 'bot', name: 'farm_8812', initials: '??', color: 'var(--sand)', mins: 260, human: false },
];

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function PoolCalc() {
  const [budget, setBudget] = useState(500);
  const [cap, setCap] = useState(200);
  const [humanOnly, setHumanOnly] = useState(true);
  const [creators, setCreators] = useState(START);

  const capCents = cap * 100;
  const { out, unallocated } = splitPool(
    budget * 100,
    capCents,
    creators.map((c) => ({ id: c.id, weight: humanOnly && !c.human ? 0 : c.mins })),
  );
  const max = Math.max(1, ...Object.values(out));

  return (
    <div className="calc reveal">
      <div className="calc-controls card">
        <Range label="Pool budget" display={`$${budget}`} min={50} max={2000} step={50} value={budget} onChange={setBudget} />
        <Range label="Cap per clip" display={`$${cap}`} min={25} max={1000} step={25} value={cap} onChange={setCap} />
        <Toggle checked={humanOnly} onChange={setHumanOnly} label="Verified humans only" />
        <div className="creators">
          {creators.map((c) => (
            <div className="creator" key={c.id}>
              <span className="avatar" style={{ '--a': c.color } as React.CSSProperties}>
                {c.initials}
              </span>
              <Range
                label={c.name}
                display={`${c.mins} min`}
                min={0}
                max={600}
                step={10}
                value={c.mins}
                onChange={(mins) => setCreators((list) => list.map((x) => (x.id === c.id ? { ...x, mins } : x)))}
              />
              <span className={`human-tag${c.human ? ' on' : ''}`}>{c.human ? '✓ HUMAN' : 'UNVERIFIED'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="calc-out card card-ink">
        <div className="calc-head">
          <span>Payouts in USDC on Arc</span>
          <span className="pill pill-lime">0 gas for creators</span>
        </div>
        {creators.map((c) => {
          const v = out[c.id];
          let note = `${c.mins} min watched`;
          if (humanOnly && !c.human) note = 'Verify to earn';
          else if (v === capCents && v > 0) note = 'Hit the cap';
          return (
            <div key={c.id} className={`payout${v ? '' : ' zero'}`}>
              <div className="payout-top">
                <span>{c.name}</span>
                <small>{note}</small>
                <b>{usd(v)}</b>
              </div>
              <div className="payout-bar">
                <i
                  style={
                    {
                      width: `${(v / max) * 100}%`,
                      '--c': c.color === 'var(--sand)' ? 'var(--stone)' : c.color,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>
          );
        })}
        <p className="calc-foot">
          {unallocated
            ? `${usd(unallocated)} wasn't needed. After the 14-day award window, the sponsor can reclaim it from the contract.`
            : "Every cent is allocated. Each creator's clips are combined into one on-chain payout."}
        </p>
      </div>
    </div>
  );
}

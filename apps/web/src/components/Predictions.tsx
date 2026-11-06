'use client';

import { useEffect, useState } from 'react';
import { showToast } from '@/lib/toast';
import { Range } from './Controls';

const START = [
  { id: 'a', label: 'Team Bandra', staked: 120 },
  { id: 'b', label: 'Team Andheri', staked: 80 },
  { id: 'c', label: 'Team Dadar', staked: 40 },
];
const LOCK_SECONDS = 299;

export function Predictions() {
  const [opts, setOpts] = useState(START);
  const [pick, setPick] = useState<string | null>(null);
  const [stake, setStake] = useState(5);
  const [stage, setStage] = useState<'open' | 'signing' | 'placed'>('open');
  const [lockIn, setLockIn] = useState(LOCK_SECONDS);

  // A looping countdown, just for show.
  useEffect(() => {
    const t = setInterval(() => setLockIn((s) => (s <= 0 ? LOCK_SECONDS : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const total = opts.reduce((s, o) => s + o.staked, 0);
  const chosen = opts.find((o) => o.id === pick);
  const placed = stage === 'placed';

  const place = () => {
    if (!pick || stage !== 'open') return;
    setStage('signing');
    setTimeout(() => {
      setOpts((list) => list.map((o) => (o.id === pick ? { ...o, staked: o.staked + stake } : o)));
      setStage('placed');
      showToast('Pick placed (testnet demo)');
    }, 1000);
  };

  let outcome: React.ReactNode = 'Pick an option to see your payout.';
  if (chosen && placed) {
    outcome = (
      <>
        Pick placed on <b>{chosen.label}</b>. If it wins, you&apos;re paid automatically. MUSO pays the gas.
      </>
    );
  } else if (chosen) {
    const payout = (stake * (total + stake)) / (chosen.staked + stake);
    outcome = (
      <>
        If <b>{chosen.label}</b> wins, you get <b>{payout.toFixed(2)} USDC</b> ({(payout / stake).toFixed(2)}× your stake).
      </>
    );
  }

  const mm = String(Math.floor(lockIn / 60)).padStart(2, '0');
  const ss = String(lockIn % 60).padStart(2, '0');

  return (
    <div className="pred card reveal" data-done={placed}>
      <div className="pred-top">
        <span className="pill pill-live">LIVE</span>
        <small>
          Carrom Showdown · locks in <b>{mm}:{ss}</b>
        </small>
      </div>
      <h3>Who wins tonight&apos;s final?</h3>
      <div className="opts" role="radiogroup" aria-label="Options">
        {opts.map((o) => {
          const share = Math.round((o.staked / total) * 100);
          return (
            <button
              key={o.id}
              className="opt"
              role="radio"
              aria-checked={pick === o.id}
              disabled={stage !== 'open'}
              onClick={() => setPick(o.id)}
              style={{ '--w': `${share}%` } as React.CSSProperties}
            >
              <span>{o.label}</span>
              <small>
                {o.staked} USDC · {share}%
              </small>
            </button>
          );
        })}
      </div>
      <Range label="Your stake" display={`${stake} USDC`} min={1} max={50} value={stake} onChange={setStake} disabled={stage !== 'open'} />
      <div className="pred-out" aria-live="polite">
        {outcome}
      </div>
      <button className="btn btn-full" onClick={place} disabled={!pick || stage !== 'open'}>
        {stage === 'open' ? 'Place pick' : stage === 'signing' ? 'Signing pick ticket…' : 'One pick per person ✓'}
      </button>
      <small className="fine">Testnet game. Test USDC only, no real money.</small>
    </div>
  );
}

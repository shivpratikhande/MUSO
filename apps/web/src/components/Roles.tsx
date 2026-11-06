'use client';

import { useState } from 'react';

const ROLES = {
  fan: {
    label: "I'm a fan",
    steps: [
      ['Find a show', "Browse live and upcoming events, and see each one's recording policy before you go."],
      ['Capture & post', 'Upload photos or videos up to 3 minutes. Location and metadata are stripped automatically.'],
      ['Choose the price', 'Free, Pay to unlock or Pay what you want, for artists who let fans earn. Tips work on any post.'],
      ['Get paid', 'Sales and tips land in Earnings. Pool rewards arrive as USDC in your wallet, with no gas to pay.'],
    ],
  },
  artist: {
    label: "I'm an artist",
    steps: [
      ['Set your rules', 'Decide whether fans can film you, and whether they can earn from those clips.'],
      ['Post official', 'Only posts from you are marked official. Fan captures never are.'],
      ['Sell your own', 'Put behind-the-scenes and exclusive clips behind a price, or take tips.'],
      ['Get your name', 'Claim yourname.muso.eth so fans can pay you by name from any wallet.'],
    ],
  },
  org: {
    label: 'I run events',
    steps: [
      ['Create the event', 'Add the venue, dates, poster and lineup. An admin reviews it before it goes public.'],
      ['Set the policy', 'Allow recording, photos only, or nothing. Uploads follow it automatically.'],
      ['Fund a pool', 'Back the best clips by card or with USDC on Arc. Choose verified humans only.'],
      ['Prove the reach', 'When the pool ends, a public attention report on Arkiv shows exactly what you paid for.'],
    ],
  },
  agent: {
    label: "I'm an AI agent",
    steps: [
      ['Discover', "Read /.well-known/x402 to find MUSO's catalogue, network and accepted asset."],
      ['Browse', 'List paid clips with their USDC prices.'],
      ['Check policy', 'Stay within budget, per-item cap, per-creator limit and allowlist before signing anything.'],
      ['Pay & receive', 'Pay over HTTP 402 in USDC on Hedera and get the media. The creator sees the sale in Earnings.'],
    ],
  },
} as const;

type Role = keyof typeof ROLES;

export function Roles() {
  const [role, setRole] = useState<Role>('fan');
  return (
    <>
      <div className="roles reveal" role="tablist" aria-label="Choose your role">
        {(Object.keys(ROLES) as Role[]).map((r) => (
          <button key={r} role="tab" aria-selected={role === r} aria-controls="steps" onClick={() => setRole(r)}>
            {ROLES[r].label}
          </button>
        ))}
      </div>
      <div className="steps" id="steps" role="tabpanel" aria-live="polite">
        {ROLES[role].steps.map(([title, body], i) => (
          // Keyed by role so the cards replay their entrance when the role changes.
          <div key={`${role}-${i}`} className="step" style={{ '--i': i } as React.CSSProperties}>
            <span className="num">0{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import { ensLabel } from '@/lib/ens';

export function EnsDemo() {
  const [username, setUsername] = useState('shiv.beats');
  const label = ensLabel(username);
  const raw = username.trim().toLowerCase().replace(/^@/, '');

  return (
    <div className="ens reveal">
      <label htmlFor="ensIn" className="lbl lbl-ivory">
        Your MUSO username
      </label>
      <div className="ens-input">
        <span>@</span>
        <input
          id="ensIn"
          value={username}
          maxLength={30}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className={`ens-out card${label ? '' : ' bad'}`} aria-live="polite">
        <small>Resolves anywhere ENS works</small>
        <b>{label ? `${label}.muso.eth` : 'type a username'}</b>
        <div className="ens-recs">
          <span>
            addr → <code>0x7a3…e91c</code>
          </span>
          <span>
            xyz.muso.username → <code>{raw || '—'}</code>
          </span>
        </div>
      </div>
      <p className="fine fine-ivory">
        <code>.</code> and <code>_</code> become <code>-</code>. If two usernames map to the same name, the older
        account keeps it.
      </p>
    </div>
  );
}

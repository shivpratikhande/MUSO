'use client';

import { useState } from 'react';

const ROLES = ['Fan', 'Artist', 'Organizer', 'Sponsor'] as const;
/** Set NEXT_PUBLIC_SIGNUP_ENDPOINT to POST sign-ups somewhere; otherwise they stay in this browser. */
const ENDPOINT = process.env.NEXT_PUBLIC_SIGNUP_ENDPOINT ?? '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Signup() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('Fan');
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; text: string }>({ kind: 'idle', text: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setStatus({ kind: 'err', text: 'Enter a valid email address.' });
      return;
    }
    setBusy(true);
    try {
      if (ENDPOINT) {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value, role: role.toLowerCase() }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } else {
        try {
          const list = JSON.parse(localStorage.getItem('muso-signups') ?? '[]') as unknown[];
          list.push({ email: value, role, at: new Date().toISOString() });
          localStorage.setItem('muso-signups', JSON.stringify(list));
        } catch {
          // Storage blocked (private mode): nothing to keep.
        }
      }
      setStatus({ kind: 'ok', text: `You're on the list as ${role === 'Artist' || role === 'Organizer' ? 'an' : 'a'} ${role.toLowerCase()}. See you at the next show.` });
      setEmail('');
    } catch {
      setStatus({ kind: 'err', text: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const invalid = status.kind === 'err' && !EMAIL.test(email.trim());

  return (
    <form className="signup" onSubmit={submit} noValidate>
      <div className="role-chips" role="radiogroup" aria-label="I am a">
        {ROLES.map((r) => (
          <label key={r}>
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
            <span>{r}</span>
          </label>
        ))}
      </div>
      <div className="signup-row">
        <label className="sr" htmlFor="email">
          Email
        </label>
        <input
          type="email"
          id="email"
          placeholder="you@email.com"
          autoComplete="email"
          required
          value={email}
          aria-invalid={invalid || undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
      <p className={`form-msg${status.kind === 'err' ? ' err' : ''}`} role="status" aria-live="polite">
        {status.text}
      </p>
    </form>
  );
}

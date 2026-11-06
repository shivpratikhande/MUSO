'use client';

import { useEffect, useState } from 'react';
import { GITHUB_REPO } from '@/lib/links';
import { GithubGlyph } from './AppLinks';
import { Logo } from './icons';

const LINKS = [
  ['how', 'How it works'],
  ['app', 'The app'],
  ['rewards', 'Rewards'],
  ['predict', 'Predictions'],
  ['stack', 'Built on'],
  ['faq', 'FAQ'],
] as const;

export function Nav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  // Highlight the link for the section in the middle of the screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    LINKS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <header className="nav" id="top">
      <div className="wrap nav-row">
        <Logo />
        <nav className={`nav-links${open ? ' open' : ''}`} id="navLinks" aria-label="Main">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'on' : undefined} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <a href={GITHUB_REPO} className="nav-gh" target="_blank" rel="noopener noreferrer" aria-label="MUSO on GitHub">
          <GithubGlyph />
        </a>
        <a href="#get" className="btn btn-sm nav-cta">
          Get the app
        </a>
        <button
          className="burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="navLinks"
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Icon, StageArt, type IconName } from './icons';
import { useToast } from './Toast';

type Tab = 'home' | 'events' | 'create' | 'insights' | 'profile';
const TABS: [Tab, IconName, string][] = [
  ['home', 'home', 'Home'],
  ['events', 'explore', 'Events'],
  ['create', 'plus', 'Create'],
  ['insights', 'insights', 'Insights'],
  ['profile', 'profile', 'Profile'],
];

const MODES = [
  ['free', 'Free', 'Anyone can watch. You still earn tips and pool rewards.'],
  ['paid', 'Pay to unlock', 'Fans pay a fixed price to unlock it. You keep 90%.'],
  ['pwyw', 'Pay what you want', 'Fans pick the price above your minimum. Can be public or locked.'],
] as const;

const fmtLikes = (n: number) => (n >= 1000 ? `${Number((n / 1000).toFixed(3))}k` : String(n));

/**
 * A clickable copy of the app. It opens on the welcome screen; Get Started / Log In go into
 * the tabs (feed with unlock / like / tip, events, create, insights, profile), and the logo
 * goes back to the welcome screen.
 */
export function Phone() {
  const toast = useToast();
  const [stage, setStage] = useState<'welcome' | 'app'>('welcome');
  const [tab, setTab] = useState<Tab>('home');

  if (stage === 'welcome') {
    return (
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <WelcomeScreen
            onEnter={(how) => {
              setTab('home');
              setStage('app');
              toast.show(how === 'signup' ? 'Welcome to Muso 👋' : 'Signed in as shiv.beats');
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen phone-enter">
        <div className="app-header">
          <button className="app-logo" aria-label="Back to the welcome screen" onClick={() => setStage('welcome')}>
            Muso
          </button>
          <button className="icon-btn" aria-label="Notifications" onClick={() => toast.show('2 new tips on your clip 🎉')}>
            <Icon name="bell" />
            <i className="dot" />
          </button>
        </div>

        {tab === 'home' && <HomeScreen toast={toast.show} />}
        {tab === 'events' && <EventsScreen />}
        {tab === 'create' && <CreateScreen toast={toast.show} />}
        {tab === 'insights' && <InsightsScreen />}
        {tab === 'profile' && <ProfileScreen />}

        <div className={`phone-toast${toast.visible ? ' show' : ''}`} role="status" aria-live="polite">
          {toast.message}
        </div>

        <nav className="tabbar" role="tablist" aria-label="App tabs">
          {TABS.map(([id, icon, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} aria-label={label} onClick={() => setTab(id)}>
              <Icon name={icon} />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

type ToastFn = (msg: string) => void;

function HomeScreen({ toast }: { toast: ToastFn }) {
  const [unlock, setUnlock] = useState<'locked' | 'verifying' | 'open'>('locked');
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  const doUnlock = () => {
    setUnlock('verifying');
    setTimeout(() => {
      setUnlock('open');
      toast('Unlocked · riya.k earns ₹44.10');
    }, 900);
  };

  return (
    <div className="screen active">
      <div className="seg-mini">
        <span className="on">For you</span>
        <span>Following</span>
        <span>Nearby</span>
      </div>
      <article className="post">
        <div className="post-head">
          <span className="avatar" style={{ '--a': 'var(--violet)' } as React.CSSProperties}>
            RK
          </span>
          <div>
            <b>riya.k</b>
            <small>Sunburn Arena · 12m</small>
          </div>
          <span className="pill pill-live">LIVE</span>
        </div>
        <div className={`post-media${unlock === 'open' ? ' unlocked' : ''}`}>
          <StageArt />
          <div className="lock">
            <Icon name="lock" />
            <button className="btn btn-sm" onClick={doUnlock} disabled={unlock !== 'locked'}>
              {unlock === 'locked' ? 'Unlock ₹49' : 'Verifying…'}
            </button>
            <small>Sandbox checkout · no real money</small>
          </div>
          <span className="duration">0:42</span>
        </div>
        <p className="post-cap">
          Encore from the barricade 🔥 <span className="hash">#sunburn</span> <span className="hash">#encore</span>
        </p>
        <div className="post-actions">
          <button className="act act-like" aria-pressed={liked} aria-label="Like" onClick={() => setLiked((l) => !l)}>
            <Icon name="heart" />
            <span>{fmtLikes(1200 + (liked ? 1 : 0))}</span>
          </button>
          <button className="act" aria-label="Comment" onClick={() => toast('Comments open in the full app')}>
            <Icon name="comment" />
            <span>86</span>
          </button>
          <button className="act act-tip" aria-label="Tip creator" aria-expanded={tipOpen} onClick={() => setTipOpen((o) => !o)}>
            <Icon name="tip" />
            <span>Tip</span>
          </button>
          <button
            className="act act-end act-save"
            aria-pressed={saved}
            aria-label="Save"
            onClick={() => {
              setSaved(!saved);
              toast(saved ? 'Removed from saved' : 'Saved to your library');
            }}
          >
            <Icon name="bookmark" />
          </button>
        </div>
        {tipOpen && (
          <div className="tip-row">
            {[20, 50, 100].map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  setTipOpen(false);
                  toast(`Tipped ₹${amt} · creator gets ₹${(amt * 0.95).toFixed(2)}`);
                }}
              >
                ₹{amt}
              </button>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

const EVENTS = [
  ['08', '', 'Sunburn Arena', 'Mumbai · Photos + video OK', 'LIVE'],
  ['14', 'lime', 'Indie Nights Vol. 3', 'Pune · Pool: $500 USDC', 'SOON'],
  ['22', 'violet', 'Carrom Showdown', 'Bandra · 3 predictions', 'SOON'],
  ['01', '', 'Lollapalooza Day 2', 'Ended · 412 clips', 'DONE'],
] as const;

function EventsScreen() {
  return (
    <div className="screen active">
      <h4 className="scr-title">Events</h4>
      {EVENTS.map(([day, tone, name, sub, status]) => (
        <div key={name} className={`ev${status === 'DONE' ? ' muted' : ''}`}>
          <div className={`ev-date ${tone}`}>
            <b>{day}</b>NOV
          </div>
          <div className="ev-body">
            <b>{name}</b>
            <small>{sub}</small>
          </div>
          <span className={`pill${status === 'LIVE' ? ' pill-live' : ''}`}>{status}</span>
        </div>
      ))}
    </div>
  );
}

function CreateScreen({ toast }: { toast: ToastFn }) {
  const [mode, setMode] = useState<(typeof MODES)[number][0]>('free');
  return (
    <div className="screen active">
      <h4 className="scr-title">New capture</h4>
      <div className="cap-grid">
        <button className="cap" onClick={() => toast('Camera opens on device')}>
          <Icon name="camera" />
          Photo
        </button>
        <button className="cap cap-lime" onClick={() => toast('Videos up to 3 minutes')}>
          <Icon name="video" />
          Video
        </button>
      </div>
      <p className="lbl">How do people get it?</p>
      <div className="seg" role="radiogroup" aria-label="Monetization">
        {MODES.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="mono-note">{MODES.find((m) => m[0] === mode)![2]}</p>
      <label className="switch-row">
        <span>
          Tag artist <b>@nucleya</b>
        </span>
        <input type="checkbox" defaultChecked />
        <i />
      </label>
      <label className="switch-row">
        <span>Strip location data</span>
        <input type="checkbox" checked disabled readOnly />
        <i />
      </label>
    </div>
  );
}

const BARS = [30, 52, 38, 70, 46, 88, 60];

function InsightsScreen() {
  return (
    <div className="screen active">
      <h4 className="scr-title">Earnings</h4>
      <div className="earn-card">
        <small>Available</small>
        <b className="earn-big">₹3,482</b>
        <div className="earn-split">
          <span>
            <i style={{ background: 'var(--lime)' }} />
            Sales
          </span>
          <span>
            <i style={{ background: 'var(--violet)' }} />
            Tips
          </span>
          <span>
            <i style={{ background: 'var(--coral)' }} />
            Pools
          </span>
        </div>
      </div>
      <div className="bars" role="img" aria-label="Earnings by day for the last week">
        {BARS.map((h, i) => (
          <span key={i} className={i === 5 ? 'on' : undefined} style={{ '--h': `${h}%`, '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="est">
        <span className="pill pill-violet">ESTIMATED</span>
        <p>
          <b>$4.20 USDC</b> from <i>Indie Nights</i> pool. Final after the pool ends.
        </p>
      </div>
    </div>
  );
}

function ProfileScreen() {
  return (
    <div className="screen active">
      <div className="prof">
        <span className="avatar avatar-lg">SB</span>
        <b>Shiv Beats</b>
        <span className="ens-tag">shiv-beats.muso.eth</span>
        <div className="badges">
          <span className="pill pill-ink">✓ Verified human</span>
          <span className="pill">Wallet linked</span>
        </div>
      </div>
      <div className="stats">
        <div>
          <b>128</b>
          <small>Clips</small>
        </div>
        <div>
          <b>9.4k</b>
          <small>Fans</small>
        </div>
        <div>
          <b>42h</b>
          <small>Watched</small>
        </div>
      </div>
      <div className="grid9" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}

/** Same three stickers as the app's welcome screen. */
const HEADLINE = [
  { text: "I'M AN", tone: 'white', delay: 0.5, tilt: -6 },
  { text: 'ARTIST', tone: 'white', delay: 0.65, tilt: -5 },
  { text: 'BROO', tone: 'lime', delay: 0.82, tilt: -7 },
] as const;

/** The app's welcome screen (apps/mobile/src/app/(auth)/index.tsx), laid out for this phone. */
function WelcomeScreen({ onEnter }: { onEnter: (how: 'signup' | 'login') => void }) {
  return (
    <div className="welcome">
      <svg className="w-fill" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 H390 V600 L250 610 L170 560 L0 590 Z" fill="var(--lime)" />
      </svg>
      <svg className="w-fill w-burst" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M200 165 L300 140 L390 120 V770 L330 730 L345 800 L260 745 L205 790 L215 700 L120 690 L180 625 L60 590 L150 540 L95 470 L170 430 L120 330 L195 300 Z"
          fill="var(--violet)"
        />
      </svg>

      <div className="w-hero">
        <Image src="/welcome-hero.png" alt="" fill sizes="240px" className="w-photo" priority />
      </div>
      <div className="w-panel" aria-hidden="true" />
      <svg className="w-crown" viewBox="0 0 110 68" aria-hidden="true">
        <path d="M8 58 L4 14 L30 38 L50 6 L68 36 L96 10 L100 58 Z M10 64 L102 62" />
      </svg>
      <svg className="w-sparks w-s1" viewBox="0 0 56 56" aria-hidden="true">
        <path d="M6 40 L22 30 M14 14 L28 26 M34 4 L36 22" />
      </svg>
      <svg className="w-sparks w-s2" viewBox="0 0 56 56" aria-hidden="true">
        <path d="M6 40 L22 30 M14 14 L28 26 M34 4 L36 22" />
      </svg>

      <div className="w-content">
        <div className="w-top">
          <span className="w-logo" aria-label="Muso">
            {['M', 'u', 's', 'o'].map((l) => (
              <span key={l} aria-hidden="true">
                {l}
              </span>
            ))}
            <sup aria-hidden="true">TM</sup>
          </span>
          <span className="w-dots" aria-label="Page 1 of 3">
            <i className="on" />
            <i />
            <i />
          </span>
        </div>

        <p className="w-headline" aria-label="I'm an artist, broo">
          {HEADLINE.map((l, i) => (
            <span
              key={l.text}
              className={`w-sticker w-sticker-${l.tone}`}
              style={{ '--d': `${l.delay}s`, '--tilt': `${l.tilt}deg`, zIndex: HEADLINE.length - i } as React.CSSProperties}
              aria-hidden="true"
            >
              <span>{l.text}</span>
            </span>
          ))}
        </p>

        <div className="w-bottom">
          <p className="w-tag">Music. Artists. Live.</p>
          <p className="w-sub">Discover concerts, festivals and your favorite artists on Muso.</p>
          <button className="btn w-btn" onClick={() => onEnter('signup')}>
            Get Started <span aria-hidden="true">→</span>
          </button>
          <button className="btn btn-white w-btn" onClick={() => onEnter('login')}>
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}

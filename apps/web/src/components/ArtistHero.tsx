import Image from 'next/image';
import { Burst } from './icons';

/** Same three stickers as the app's welcome screen (src/app/(auth)/index.tsx). */
const HEADLINE = [
  { text: "I'M AN", tone: 'white', delay: 0.5, tilt: -6 },
  { text: 'ARTIST', tone: 'white', delay: 0.65, tilt: -5 },
  { text: 'BROO', tone: 'lime', delay: 0.82, tilt: -7 },
] as const;

const vars = (v: Record<string, string | number>) => v as React.CSSProperties;

/**
 * The app's welcome poster on the web: lime block, violet burst, the cut-out artist with a
 * white sticker outline, a wobbling crown and spark lines, and a jagged white panel that
 * hides the photo's hard bottom crop.
 */
export function ArtistHero() {
  return (
    <section className="artist" aria-labelledby="artist-title">
      <svg className="artist-lime" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 H390 V600 L250 610 L170 560 L0 590 Z" fill="var(--lime)" />
      </svg>
      <Burst className="artist-burst" />

      <div className="artist-figure">
        <Image
          src="/welcome-hero.png"
          alt="An artist in sunglasses and a leather jacket"
          fill
          priority
          sizes="(max-width: 700px) 90vw, 46vw"
          className="artist-photo"
        />
        <svg className="artist-crown" viewBox="0 0 110 68" aria-hidden="true">
          <path d="M8 58 L4 14 L30 38 L50 6 L68 36 L96 10 L100 58 Z M10 64 L102 62" />
        </svg>
        <svg className="artist-sparks s1" viewBox="0 0 56 56" aria-hidden="true">
          <path d="M6 40 L22 30 M14 14 L28 26 M34 4 L36 22" />
        </svg>
        <svg className="artist-sparks s2" viewBox="0 0 56 56" aria-hidden="true">
          <path d="M6 40 L22 30 M14 14 L28 26 M34 4 L36 22" />
        </svg>
      </div>

      <div className="artist-panel" aria-hidden="true" />

      <div className="wrap artist-inner">
        <h1 id="artist-title" className="artist-title" aria-label="I'm an artist, broo">
          {HEADLINE.map((l, i) => (
            <span
              key={l.text}
              className={`sticker sticker-${l.tone}`}
              style={vars({ '--d': `${l.delay}s`, '--tilt': `${l.tilt}deg`, '--z': HEADLINE.length - i })}
              aria-hidden="true"
            >
              <span className="sticker-text">{l.text}</span>
            </span>
          ))}
        </h1>

        <div className="artist-bottom">
          <div className="artist-copy">
            <p className="artist-tag">Music. Artists. Live.</p>
            <p className="artist-sub">Film the show, post the moment, and get paid for it on Muso.</p>
          </div>
          <div className="artist-ctas">
            <a href="#get" className="btn">
              Get early access <span aria-hidden="true">→</span>
            </a>
            <a href="#how" className="btn btn-white">
              How it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

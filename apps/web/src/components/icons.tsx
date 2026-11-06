/** Chunky line icons on a 24×24 grid, the same shapes as the app's Icon component. */
const PATHS = {
  home: <path d="M3.5 11 L12 4 L20.5 11 V20 H14.5 V14.5 H9.5 V20 H3.5 Z" />,
  explore: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  insights: <path d="M5 20V12M12 20V5M19 20v-9" />,
  profile: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 20c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </>
  ),
  bell: <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  comment: <path d="M4 5h16v11H9l-5 4Z" />,
  tip: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 10h5M9.5 13h5M12 7v10" />
    </>
  ),
  bookmark: <path d="M6 4h12v17l-6-4-6 4Z" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7Z" />,
  trend: <path d="M4 19h16M6 15l4-5 3 3 5-7" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** Lights + crowd silhouette used as a stand-in for a concert photo. */
export function StageArt() {
  return (
    <div className="stage-art" aria-hidden="true">
      <i className="beam b1" />
      <i className="beam b2" />
      <i className="beam b3" />
      <svg viewBox="0 0 300 120" preserveAspectRatio="none">
        <path d="M0 120 L0 92 Q14 70 28 92 Q40 66 56 90 Q70 62 84 88 Q98 70 112 92 Q126 60 142 88 Q156 72 170 90 Q186 58 200 88 Q214 70 228 92 Q244 64 258 90 Q272 72 286 92 Q296 78 300 90 L300 120 Z" />
      </svg>
    </div>
  );
}

const BURST =
  'M200 165 L300 140 L390 120 V770 L330 730 L345 800 L260 745 L205 790 L215 700 L120 690 L180 625 L60 590 L150 540 L95 470 L170 430 L120 330 L195 300 Z';

/** The violet burst from the app's welcome backdrop. */
export function Burst({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
      <path d={BURST} fill="var(--violet)" />
    </svg>
  );
}

export function Logo({ ivory = false }: { ivory?: boolean }) {
  return (
    <a href="#top" className={`logo${ivory ? ' logo-ivory' : ''}`} aria-label="MUSO, back to top">
      <span className="logo-word" aria-hidden="true">
        <span>M</span>
        <span>u</span>
        <span>s</span>
        <span>o</span>
      </span>
      <sup aria-hidden="true">TM</sup>
    </a>
  );
}

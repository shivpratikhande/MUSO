import { ANDROID_APK, GITHUB_REPO, IOS_APP } from '@/lib/links';

export function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="glyph">
      <path d="M7 10h10v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 18Z M5 10.5v5 M19 10.5v5 M10 19.5v2 M14 19.5v2 M7 9a5 5 0 0 1 10 0Z M8.5 3.5 10 6 M15.5 3.5 14 6" />
    </svg>
  );
}

export function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="glyph glyph-fill">
      <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.9-.9-3.1-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8ZM14.2 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" />
    </svg>
  );
}

export function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="glyph glyph-fill">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

/** Android download, iOS (or "coming soon") and the GitHub repo, as poster-style badges. */
export function AppLinks({ github = true }: { github?: boolean }) {
  return (
    <div className="app-links">
      <a className="store" href={ANDROID_APK} rel="noopener noreferrer">
        <AndroidGlyph />
        <span>
          <small>Download for</small>
          <b>Android</b>
        </span>
      </a>
      {IOS_APP ? (
        <a className="store store-white" href={IOS_APP} target="_blank" rel="noopener noreferrer">
          <AppleGlyph />
          <span>
            <small>Download for</small>
            <b>iOS</b>
          </span>
        </a>
      ) : (
        <span className="store store-soon" aria-disabled="true">
          <AppleGlyph />
          <span>
            <small>Coming soon</small>
            <b>iOS</b>
          </span>
        </span>
      )}
      {github && (
        <a className="store store-ink" href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
          <GithubGlyph />
          <span>
            <small>Source code</small>
            <b>GitHub</b>
          </span>
        </a>
      )}
    </div>
  );
}

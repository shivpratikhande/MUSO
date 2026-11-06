import { AppLinks, GithubGlyph, AndroidGlyph } from '@/components/AppLinks';
import { EnsDemo } from '@/components/EnsDemo';
import { Burst, Icon, Logo, type IconName } from '@/components/icons';
import { Nav } from '@/components/Nav';
import { Phone } from '@/components/Phone';
import { PoolCalc } from '@/components/PoolCalc';
import { Predictions } from '@/components/Predictions';
import { Reveal } from '@/components/Reveal';
import { Roles } from '@/components/Roles';
import { Signup } from '@/components/Signup';
import { TechCard } from '@/components/TechCard';
import { Toast } from '@/components/Toast';
import { WatchSim } from '@/components/WatchSim';
import { ANDROID_APK, GITHUB_REPO } from '@/lib/links';

const css = (vars: Record<string, string>) => vars as React.CSSProperties;

const MARQUEE = [
  'Capture the moment',
  'Share the experience',
  'Earn from your creativity',
  'Pay to unlock',
  'Tips',
  'USDC reward pools',
  'Predictions',
];

const FEATURES: [IconName, string, string, React.ReactNode][] = [
  ['camera', 'var(--lime)', 'Capture', 'Upload photos and up-to-3-minute videos straight from the crowd. GPS and metadata are stripped before anything goes public.'],
  ['lock', 'var(--violet)', 'Monetize', 'Free, Pay to unlock, or Pay what you want, plus tips on any post. Creators keep 90% of sales and 95% of tips.'],
  ['clock', 'var(--coral)', 'Watch-time pools', "Sponsors fund a pool. When it ends, it's split by real, server-measured watch time, never by a number the app reports."],
  ['star', 'var(--lime)', 'Artist consent', 'Every artist sets a fan-recording policy. Fans can only sell clips of artists who\'ve switched on "Fans can earn".'],
  ['trend', 'var(--violet)', 'Predictions', 'Organizers add questions to any event: who wins, the encore, the best clip. Fans stake test USDC and winners split the pool.'],
  [
    'profile',
    'var(--coral)',
    'Your name on-chain',
    <>
      Every creator gets a free <code>you.muso.eth</code> name that points to their wallet, so anyone can pay them by name.
    </>,
  ],
];

const TECH = [
  {
    tag: 'Arc · USDC',
    color: 'var(--lime)',
    title: 'Sponsor-funded pools',
    short: 'Sponsors escrow USDC in a contract. MUSO splits it by watch time and pays creators straight to their wallets.',
    more: (
      <>
        The <code>RewardCampaigns</code> contract has no owner and no admin. MUSO can only award within the pool&apos;s
        window, once per address, up to the cap. After 14 days, the sponsor can reclaim whatever wasn&apos;t awarded. Gas
        on Arc is paid in USDC, and MUSO covers it.
      </>
    ),
  },
  {
    tag: 'World ID',
    color: 'var(--violet)',
    title: 'One human, one account',
    short: 'Proof of Human stops one person farming rewards with many accounts.',
    more: "MUSO stores only an anonymous, action-scoped nullifier, with no personal data. Each proof is bound to the signed-in account, so it can't be replayed elsewhere. Pools funded on Arc pay verified humans only.",
  },
  {
    tag: 'Arkiv',
    color: 'var(--coral)',
    title: 'Public proof of attention',
    short: "When a pool ends, its attention report is published, read-only.",
    more: "Verified viewers, watch time, each clip's share and every USDC payout. The app's \"Public proof\" card reads it from Arkiv, not from MUSO's database, and anyone can run the same query. Not even MUSO can change it.",
  },
  {
    tag: 'Hedera · x402',
    color: 'var(--lime)',
    title: 'AI agents buy clips',
    short: 'Autonomous agents pay per clip in USDC on Hedera, with no human approving each payment.',
    more: 'An agent finds paid clips, checks its own budget and per-item cap, and pays over HTTP 402. Settled sales go through the same ledger as every other payment, so creators see agent sales in Earnings.',
  },
  {
    tag: 'ENS',
    color: 'var(--violet)',
    title: <code>name.muso.eth</code>,
    short: 'Free subnames for every creator, served through a signed CCIP-Read gateway.',
    more: "A single on-chain resolver checks MUSO's signature. Each answer is bound to the exact request and expires within minutes, so it can't be swapped or replayed for another name.",
  },
  {
    tag: 'Ledger',
    color: 'var(--coral)',
    title: 'Every rupee balanced',
    short: 'Integer amounts, verified payments and an append-only double-entry ledger.',
    more: "No floats anywhere. The server confirms every payment with the provider before unlocking anything. Ledger rows can't be edited or deleted, and every journal must sum to zero, enforced by the database.",
  },
];

const PROOF = [
  ['Arc', 'var(--lime)', 'Alice was paid 1.33 USDC', 'Her share of a 2 USDC pool, by watch time', 'View tx', 'https://testnet.arcscan.app/tx/0x09442a7758c1297ac942c6ac66937d1ce5bb034e2335717c7509cda89fbb9d4e'],
  ['Arc', 'var(--lime)', 'Bob was paid 0.67 USDC', 'He linked his wallet after the pool ended and was still paid', 'View tx', 'https://testnet.arcscan.app/tx/0xdf5f7aa0409fe76e60afd89cf23d1486e016255bd7d7d05ae7fd62f2db2cdd3b'],
  ['Hedera', 'var(--violet)', 'An AI agent bought a photo for 0.59 USDC', 'Creator earning ₹44.10 recorded, ledger balanced', 'View tx', 'https://hashscan.io/testnet/transaction/0.0.9185802-1793929074-532406135'],
  ['Arkiv', 'var(--coral)', 'Attention report published', '2 viewers · 36 s watched · 3 clips paid', 'View entity', 'https://rabdi.explorer.arkiv.network/entity/0x0b3370482f5bd905174b9f69490ad0f9ddf0bd521b0b97c8bf2a1e8fd51567ef'],
] as const;

const FAQ = [
  ['Can I sell a clip of any artist?', "No. Each artist sets a fan-recording policy and chooses whether fans can earn from clips of them. Each event also has a recording policy (allowed, photos only, or not allowed). Uploads respect both. Fan clips are never marked official; only the artist's own posts are."],
  ['How much does MUSO take?', '10% of sales and 5% of tips. Fees are fixed on each payment when it happens, so a later change never affects past earnings.'],
  ['Do I need a crypto wallet?', 'Not to post, sell or get tipped. You only link a wallet to receive USDC from sponsor pools on Arc. MUSO pays the gas, so you never need any crypto to get paid.'],
  ['How do you stop bots and view farming?', "The server measures watch time itself between heartbeats. Paused or background playback, timing anomalies, position jumps, network clusters, shared devices, unverified accounts and self-views are excluded. Each viewer counts once per clip. Pools can also require World ID, so one person can't earn on many accounts."],
  ['Is my location shared?', 'No. Photos and videos are re-encoded with all metadata, including GPS, removed. Originals are never served.'],
  ['Is the money real?', 'Not yet. Card payments run in a sandbox, and USDC pools and predictions run on testnets. No real money moves today.'],
] as const;

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />

      <main id="main">
        {/* HERO */}
        <section className="hero">
          <svg className="hero-bg" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0 H1440 V640 L1010 668 L760 604 L420 650 L0 610 Z" fill="var(--lime)" />
          </svg>
          <Burst className="hero-burst" />

          <div className="wrap hero-grid">
            <div className="hero-copy">
              <p className="chip chip-ink reveal">Live events · Fan media · USDC rewards</p>
              <h1 className="hero-title">
                <span className="hl hl-white" style={css({ '--d': '.1s' })}>
                  Film the
                </span>
                <span className="hl hl-white" style={css({ '--d': '.25s' })}>
                  show.
                </span>
                <span className="hl hl-ink" style={css({ '--d': '.4s' })}>
                  Get paid.
                </span>
              </h1>
              <p className="lede reveal">
                MUSO is the creator economy for live events. Fans capture photos and videos of the artists they love,
                publish them, and <em className="serif">earn</em> when their clips are unlocked, tipped or rewarded from
                sponsor pools.
              </p>
              <div className="hero-ctas reveal">
                <AppLinks github={false} />
              </div>
              <ul className="hero-proof reveal">
                <li>
                  <b>90%</b> of every sale to the creator
                </li>
                <li>
                  <b>0</b> gas paid by creators
                </li>
                <li>
                  <b>1</b> human, 1 earning account
                </li>
              </ul>
            </div>

            <div className="hero-phone reveal">
              <svg className="spark" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 2v12M24 34v12M2 24h12M34 24h12M8 8l8 8M32 32l8 8M40 8l-8 8M16 32l-8 8" />
              </svg>
              <Phone />
              <p className="phone-hint">↑ It&apos;s interactive. Tap around.</p>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span key={i} className="marquee-item">
                <span>{t}</span>
                <b>✸</b>
              </span>
            ))}
          </div>
        </div>

        {/* PROBLEM */}
        <section className="sec">
          <div className="wrap two-col">
            <div className="reveal">
              <p className="eyebrow">The problem</p>
              <h2 className="poster">
                Millions of phones in the air. <span className="mark">Zero</span> paychecks.
              </h2>
            </div>
            <div className="problem-list reveal">
              <div className="card">
                <span className="num">01</span>
                <p>
                  <b>Fans</b> film the best angles of every show, then post them for free on platforms that keep the
                  money.
                </p>
              </div>
              <div className="card">
                <span className="num">02</span>
                <p>
                  <b>Artists</b> have no say in who sells their likeness, and no share when they do.
                </p>
              </div>
              <div className="card">
                <span className="num">03</span>
                <p>
                  <b>Sponsors</b> pay for &quot;reach&quot; they can&apos;t check, and much of it is bots.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="sec sec-ink" id="how">
          <div className="wrap">
            <p className="eyebrow eyebrow-lime reveal">How it works</p>
            <h2 className="poster reveal">
              One show. <span className="mark">Four</span> ways in.
            </h2>
            <Roles />
          </div>
        </section>

        {/* FEATURES */}
        <section className="sec" id="app">
          <div className="wrap">
            <p className="eyebrow reveal">The app</p>
            <h2 className="poster reveal">
              Everything a show <span className="mark">needs</span>.
            </h2>
            <div className="features">
              {FEATURES.map(([icon, bg, title, body]) => (
                <article key={title} className="feat reveal">
                  <span className="feat-ic" style={css({ '--bg': bg })}>
                    <Icon name={icon} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* WATCH-TIME SIMULATOR */}
        <section className="sec sec-sand" id="rewards">
          <div className="wrap">
            <p className="eyebrow reveal">Reward pools · Try it</p>
            <h2 className="poster reveal">
              Only <span className="mark">real</span> watch time counts.
            </h2>
            <p className="sub reveal">
              While a clip plays on screen, the app sends a heartbeat every 5 seconds, and the server credits only the
              time <em>it</em> measured. Play the clip, then try to game it.
            </p>
            <WatchSim />
          </div>
        </section>

        {/* POOL SPLIT */}
        <section className="sec">
          <div className="wrap">
            <p className="eyebrow reveal">Pool payouts · Try it</p>
            <h2 className="poster reveal">
              Split the pool, <span className="mark">fairly</span>.
            </h2>
            <p className="sub reveal">
              The budget is split in proportion to qualified watch time. Each clip is capped, and anything above the cap is
              shared among the rest. Drag the sliders.
            </p>
            <PoolCalc />
          </div>
        </section>

        {/* PREDICTIONS */}
        <section className="sec sec-lime" id="predict">
          <div className="wrap two-col">
            <div className="reveal">
              <p className="eyebrow eyebrow-ink">Predictions · Try it</p>
              <h2 className="poster">
                Call it before the <span className="mark mark-ink">encore</span>.
              </h2>
              <p className="sub">
                Organizers add questions to any event. Fans stake test USDC on Arc, one pick per real person. If a market
                isn&apos;t settled in time, everyone gets a refund, guaranteed by the contract.
              </p>
              <ul className="ticks">
                <li>Match winner, battle of the bands, setlist or custom</li>
                <li>
                  <b>Best clip</b> settles itself from verified watch time, and the winning creator gets up to 20%
                </li>
                <li>MUSO pays the gas for claims and refunds</li>
              </ul>
            </div>
            <Predictions />
          </div>
        </section>

        {/* ENS */}
        <section className="sec sec-ink">
          <div className="wrap two-col">
            <div className="reveal">
              <p className="eyebrow eyebrow-lime">ENS · Try it</p>
              <h2 className="poster">
                Get paid <span className="mark">by name</span>.
              </h2>
              <p className="sub sub-ivory">
                Every MUSO creator gets a free subname from their username. It resolves to their linked wallet on every EVM
                chain, and carries their profile as text records. Issuing it costs no gas.
              </p>
            </div>
            <EnsDemo />
          </div>
        </section>

        {/* STACK */}
        <section className="sec" id="stack">
          <div className="wrap">
            <p className="eyebrow reveal">Built on</p>
            <h2 className="poster reveal">
              Money you can <span className="mark">check</span>.
            </h2>
            <p className="sub reveal">
              Sponsor money sits in a contract, not with MUSO. The proof is public. Tap a card to see how each piece works.
            </p>
            <div className="stack">
              {TECH.map((t) => (
                <TechCard key={t.tag} {...t} />
              ))}
            </div>
          </div>
        </section>

        {/* LIVE PROOF */}
        <section className="sec sec-sand">
          <div className="wrap">
            <p className="eyebrow reveal">On testnet today</p>
            <h2 className="poster reveal">
              It already <span className="mark">ran</span>.
            </h2>
            <div className="proof reveal">
              {PROOF.map(([chain, color, title, sub, cta, href]) => (
                <div key={href} className="proof-row card">
                  <span className="tech-tag" style={css({ '--bg': color })}>
                    {chain}
                  </span>
                  <div>
                    <b>{title}</b>
                    <small>{sub}</small>
                  </div>
                  <a className="btn btn-sm btn-white" target="_blank" rel="noopener noreferrer" href={href}>
                    {cta} ↗
                  </a>
                </div>
              ))}
            </div>
            <p className="fine reveal">All accounts and transactions above are on testnets.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" id="faq">
          <div className="wrap narrow">
            <p className="eyebrow reveal">FAQ</p>
            <h2 className="poster reveal">
              Good <span className="mark">questions</span>.
            </h2>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q} className="reveal">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta" id="get">
          <Burst className="cta-burst" />
          <div className="wrap cta-inner">
            <h2 className="poster cta-title">
              <span className="hl hl-white">Your next</span> <span className="hl hl-ink">show pays.</span>
            </h2>
            <p className="lede">Android is out now. iOS is next: join the list and we&apos;ll tell you when it lands.</p>
            <AppLinks />
            <Signup />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row">
          <Logo ivory />
          <p>Capture the moment. Share the experience. Earn from your creativity.</p>
          <nav className="foot-links" aria-label="Footer">
            <a href={ANDROID_APK} rel="noopener noreferrer">
              <AndroidGlyph /> Android app
            </a>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
              <GithubGlyph /> GitHub
            </a>
          </nav>
          <p className="fine fine-ivory">Built at ETHGlobal Mumbai 2026 · MIT licensed</p>
        </div>
      </footer>

      <Toast />
      <Reveal />
    </>
  );
}

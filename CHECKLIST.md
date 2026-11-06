# MUSO — Build Checklist

> Event-powered creator economy: **Capture the moment. Share the experience. Earn from your creativity.**

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done **and tested against the real backend**

A UI that exists but isn't wired to the backend is `[~]`, never `[x]`.

---

## 📍 Current status — 2026-11-06

**Milestone 5 built: funded reward pools paid out by server-verified watch time. The backend is fully tested. The new mobile screens haven't been tapped through on a phone yet.**
- ✅ Backend: **106/106 e2e tests** pass. They cover pool funding into escrow, server-measured crediting, the one-view cap per viewer, paused and background playback, bot flagging with credit reversal, one crediting session at a time, shared-device, creator and unverified exclusions, locked videos not tracked, exact proportional payouts made once, caps with the remainder kept in escrow, and leaderboards. Shared payout maths: 28 unit tests.
- ✅ Mobile: typecheck, ESLint and the iOS bundle pass.
- ⚠️ Payments are still sandbox (no real money). Unallocated pool money stays in escrow; returning it to the funder is part of refunds in M7.
- ⚠️ On-device pass still needed for the Milestone 2–5 screens.
- 🛠 `pnpm dev:lan` re-points the phone setup after switching Wi-Fi.

---

## 🎯 MVP Acceptance Journey (P0 — definition of "done")

- [ ] 1. Organizer creates an event
- [ ] 2. Artist is added to the event
- [ ] 3. User attends the event (event is Live)
- [ ] 4. User uploads a photo or video
- [ ] 5. User tags the artist and event
- [ ] 6. User chooses free / paid unlock / tip-enabled
- [ ] 7. Content appears in the event feed
- [ ] 8. Another user discovers the content
- [ ] 9. Second user purchases it or sends a tip
- [ ] 10. Backend verifies the payment
- [ ] 11. Creator's financial ledger is updated
- [ ] 12. Creator sees earnings in their dashboard

## 🎯 Next Version Journey (P1 — reward pools)

- [ ] 1. Sponsor funds a reward pool
- [ ] 2. Creators upload event videos
- [ ] 3. Viewers watch the videos
- [ ] 4. Backend calculates qualified watch time
- [ ] 5. Backend detects suspicious activity
- [ ] 6. Eligible creator rewards are calculated
- [ ] 7. Rewards distributed from the funded pool

---

## Milestone 1 — Foundation

### Monorepo & tooling
- [x] pnpm workspace + Turborepo
- [x] Shared TypeScript config, Prettier, lint, typecheck
- [x] `.env.example` files (no secrets committed)
- [x] Local Postgres + Redis (Homebrew) / `docker-compose.yml` for teammates
- [x] README with setup instructions

### Backend
- [x] NestJS (ESM) app boots with validated env config
- [x] Prisma 7 + PostgreSQL connected, first migration, seed data
- [x] Redis connection
- [x] `/v1/health` reports DB + Redis
- [x] Standard response envelope `{ data }` / `{ error }`
- [x] Global error handling + structured logging
- [x] Rate limiting
- [x] Helmet security headers, CORS
- [x] Swagger API docs at `/docs`
- [x] Unit + e2e tests running against isolated test DB

### Authentication
- [x] Sign up (email + password, hashed with argon2) — API tested; mobile screen built
- [x] Sign in
- [x] JWT access token + rotating refresh tokens (stored hashed)
- [x] Logout (revoke refresh token)
- [~] Session restore on app launch — logic built, needs on-device test
- [x] Email verification (dev: code printed in API log; real email provider in M2)
- [x] Password reset
- [x] Role model: Artist · Creator · Supporter · Organizer (multi-role) + Admin
- [x] Auth guard + roles guard
- [x] Auth rate limiting

### Mobile
- [x] Expo SDK 58 + Expo Router (typed routes)
- [x] 5 native tabs: Discover · Events · Create · Activity · Profile
- [x] Auth screens: Welcome · Sign up · Sign in (wired to API) — confirmed on iPhone
- [x] Protected routes (signed-out users see auth flow)
- [~] Tokens in SecureStore, TanStack Query, API client
- [~] Loading / error / empty states pattern

### Design system
- [x] Tokens: Ink Black `#171715`, Warm Ivory `#F4F0E8`, Acid Lime `#D9FF55`, Coral `#F16B55`
- [x] Fonts: Instrument Serif (editorial headings) + Inter (UI)
- [x] Spacing, radii, type scale, light/dark
- [~] Core components: Text, Button, TextField, Card, Screen, Pill, EmptyState, ErrorState

### Deliverable
- [x] App runs on a device (iPhone via Expo Go; a dev build will need Xcode or EAS)
- [~] User can sign up, sign in, restore session, log out

---

## Milestone 2 — User & Event Experience

### Onboarding & profiles
- [x] Role selection (multi-role; ADMIN can never be self-assigned)
- [x] Onboarding flow + profile setup (avatar, bio, location, links); completion blocked until each role's profile exists
- [x] Artist profile: name, photo, cover, bio, genres, location, social links, fan-recording policy
- [x] Creator profile: username, bio, location, photo/video interests, portfolio
- [ ] Supporter profile: interests → moved to Milestone 3 (feed personalisation)
- [x] Organizer profile: organization, contact
- [x] Privacy settings: hide location, earnings private by default (earnings display arrives in M4)
- [x] Avatar + cover upload (presigned PUT → MinIO/S3; ownership and completed-upload checks)

### Events
- [x] Organizer creates event: name, cover, venue, location, date/time, description (verified email required)
- [x] Recording policy per event (organizer-defined)
- [x] Add artists to event (lineup, billing order)
- [x] Event schedule (only lineup artists, inside the event window)
- [x] Lifecycle: Upcoming → Live → Completed / Cancelled (derived from times, can't drift)
- [x] Admin approval of event data (edits to approved events trigger a new review)
- [x] Event discovery list (upcoming, live, past, search, city filter, cursor pagination)
- [x] Event detail page
- [x] Follow event
- [x] Artist profile shows upcoming + past events

---

## Milestone 3 — Capture & Social

### Capture & upload
- [x] Camera: photo capture
- [x] Camera: video recording (≤ 3 min)
- [x] Gallery picker (photos + videos)
- [x] Media preview
- [~] Video trimming (native iOS trim in picker; Android has none yet)
- [x] Caption + hashtags (parsed server-side, tappable)
- [x] Event selection (live or finished events only; recording policy enforced)
- [x] Artist tagging (lineup shortcuts + search; artist NO_RECORDINGS respected)
- [x] Rights confirmation ("I captured this and have the right to upload")
- [x] Format + size validation (client + server; photos ≤ 25 MB, videos ≤ 300 MB / 3 min)
- [x] Upload progress, retry, cancel; idempotent publish via clientRequestId
- [x] Originals in a private bucket; WebP photo + H.264 MP4 derivatives and thumbnails; served by signed URLs
- [x] Background media processing job (BullMQ on Redis, retries, per-env queues)
- [x] Content metadata stored (creator, event, artists, type, caption, media, thumbnail, duration, monetization, moderation, permission, publication status)
- [x] Fan uploads never auto-marked as official artist content

### Feed & social
- [x] Supporter interests (genres) for personalisation (onboarding step + profile)
- [x] Discover feed: For You · Trending · Live Events · Around You · Artists · Photography · Videos
- [x] Infinite scroll + cursor pagination
- [x] Video playback in feed (most visible video autoplays muted)
- [x] Content detail / video viewer / photo gallery
- [x] Event content feed + event gallery (+ "Capture this moment" when live)
- [x] Artist page: fan-captured content section
- [x] Like / unlike (optimistic, idempotent counters)
- [x] Comment + reply (one level, cascading delete)
- [x] Mentions (notifications, tappable)
- [x] Save
- [x] Share (native share sheet with muso:// link)
- [x] Follow / unfollow (artists, creators)
- [x] Report (posts, comments, accounts; 5 reports auto-hide; admin resolve API)
- [x] Block (hides content both ways, removes follows)
- [x] In-app notifications for social activity (Activity tab + unread badge)

---

## Milestone 4 — Monetization (P0 money flow)

### Payment architecture
- [x] Payment provider abstraction (provider-independent business logic) — sandbox provider implemented
- [x] Idempotency keys on every financial operation (checkout keys, PENDING→SUCCEEDED claim, earning release claim)
- [x] Payment verified server-side with the provider (amount + currency checked) before any entitlement / ledger update
- [x] Double-entry financial ledger (DB triggers: append-only + balanced journals)
- [x] Platform fee calculation (integer paise, snapshot per payment; 10% sales / 5% tips, configurable)

### Monetization modes
- [x] Free content (+ tips)
- [x] Pay to unlock (fixed price; server always uses its current price)
- [x] Pay what you want (suggested + optional minimum, public or gated)
- [x] Tips (₹10 / ₹20 / ₹50 / ₹100 / custom, optional message)
- [x] Pricing history (existing buyers keep access after price change)

### Purchases & access
- [x] Locked content preview (blurred; real media URL never sent to non-buyers)
- [x] Unlock + purchase confirmation screens
- [x] Persistent content entitlements
- [x] Secure media access (short-lived signed URLs, entitlement-checked)
- [x] Purchase history
- [x] Purchased content library
- [x] High-resolution photo download for buyers (metadata stripped)
- [x] Clear licensing terms on purchase (no implied copyright transfer)

### Creator earnings dashboard
- [x] Totals: earnings, tips, photo sales, video sales, watch rewards, fees, net
- [x] Status buckets: Estimated · Pending · Confirmed · Available · Paid · Reversed (Estimated/Paid/Reversed populate in M5/M7)
- [x] Pending/estimated never shown as withdrawable (hold window, then release job)
- [x] Top-performing content
- [~] Purchase history done; payout history comes with payouts (M7)

---

## Milestone 5 — Rewards (P1)

### Reward pools
- [x] Organizer/sponsor creates reward pool (funded through verified checkout into escrow; funder disclosed)
- [x] Lifecycle: Draft → Funded → Active → Completed → Distributed / Cancelled
- [x] Eligibility rules + budget / allocated shown
- [x] Per-video cap (water-filling) and pool budget cap; min distinct viewers per video

### Qualified watch time
- [x] Authenticated watch sessions
- [x] Server-timed playback heartbeats (client totals never trusted)
- [x] Max credited time per interval
- [x] Unique viewer tracking (one full view per viewer per video)
- [x] Duplicate session prevention (one crediting session per viewer)
- [x] Background / paused playback excluded
- [x] Bot + suspicious activity detection (timing anomalies, position jumps, network clusters → flagged & reversed)
- [x] Device + account abuse limits (accounts per device, daily cap, unverified/self excluded)
- [x] Backend authoritative — client totals never trusted

### Distribution
- [x] Proportional pool-share calculation (background job, exact paise, exactly once)
- [x] Rewards written to ledger with statuses (escrow → creator pending; estimated shown live)
- [x] Reward pool screen with live leaderboard; rewards in Earnings
- [x] Event creator leaderboards (verified watch time, most loved, most supported)
- [~] Creator analytics (earnings dashboard + pool stats; deeper analytics later)

### P1 extras
- [ ] Artist licensing requests (request → creator approves/declines)
- [ ] Artist features approved content
- [~] Organizer dashboard (pool stats + my events; fuller dashboard later)
- [~] Copyright / takedown requests + moderation queue (reports + admin API done in M3; app screen pending)

---

## 🏁 ETHGlobal Mumbai — Hackathon Phase (replaces Milestone 6, part of Milestone 7)

> Plan: **Option C** (Hedera x402 + Arc + World ID); H4 only if more than 3 partner prizes are allowed.
> Everything plugs into the existing payment-provider interface, ledger, reward-pool maths and anti-fraud rules.
> Built entirely during the event → **main tracks, not Continuity**.
>
> **Our 3 partner picks:**
> 1. **Hedera — AI Agents That Pay: x402 on Hedera** ($6.5k: $3k / $2k / $1.5k) → H1
> 2. **Arc — Best Smart Contracts with Advanced Stablecoin Logic** ($3k) → H2 + H6 contracts (Studio URL + Studio in demo required)
> 3. **World — Best Use of IDKit** ($2.5k, up to 2 × $1,250) → H3 + H6 (one human, one pick)

> **Track picks (decided 2026-11-06):** Arc + World ID + **Arkiv**. Story: *brands pay for real attention at live events; fans who filmed it get paid.* Arc holds/pays the money, World ID proves viewers and creators are real humans, Arkiv makes the attention report publicly verifiable. Hedera x402 stays in the app as a bonus (clip licensing) — submit only if a 4th pick is allowed. **Parked:** H6 prediction game, Chainlink CRE, Swarm.

### H0 — Preparation
- [x] Codebase built during the event (no Continuity Track needed)
- [ ] Keep small, frequent commits from here on (judges read the git history)
- [ ] Confirm the partner-prize limit (prizes page mentions "three picks")
- [ ] Confirm with ETHGlobal that a testnet prediction game at the venue is OK (H6)
- [x] MIT licence + "How we used AI" section in README
- [~] Read current docs: Hedera x402 + facilitators ✅ · Arc Studio + Circle tools · World IDKit
- [ ] Accounts/keys in `.env` only: Hedera testnet account, Arc Studio / Circle, World developer app
- [ ] Team names + Telegram/X for submission

### H1 — Hedera x402: AI agents pay creators ($6.5k)
- [x] x402-protected endpoint for paid content (`402 Payment Required` → pay → content)
- [x] Settlement on Hedera testnet through an approved facilitator (x402.org) — first live payment settled: `0.0.9185802@1793929074.532406135`
- [x] Public catalogue + `/.well-known/x402` discovery
- [x] Agent client: discovers, reads price, pays automatically (no human approval), downloads (+ dry-run mode)
- [x] Agent guardrails: total budget, per-item cap (also enforced by x402 spendControls), per-creator limit, allowlist, query
- [x] Hedera recorded as a payment provider → ledger + creator Earnings (idempotent on tx id)
- [ ] Optional: HCS audit log of agent spending
- [x] Tests (6 e2e + 4 policy); README with setup, architecture, payment flow, real tx ID + HashScan link
- [ ] Demo video ≤ 5 min showing settlement on HashScan

### H2 — Arc: USDC reward-pool contract ($3k) — *also covers M6 contract + M7 reward payouts*
- [x] Contract built in **Arc Studio** (required) — [project](https://studio.arc.io/app/a2e5e21f-ce8e-4ba9-87f0-b46aa7e6cc03?thread=d76eb9e9-1820-493a-86f5-9fffd28f605d): createCampaign (sponsor deposits USDC), award/awardMany (allocator, only after end), claim/claimFor (gasless relay), reclaimUnawarded
- [x] Access control, reentrancy protection, safe ERC-20 transfers, events; independent review tests + fork test of the live deploy (2 findings fixed in Studio)
- [x] Reusable by other builders (bonus): ownerless, any sponsor can create a campaign with any allocator
- [x] Deployed to Arc testnet: `0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb`
- [x] First live campaign: create → awardMany → relayed claimFor (see `packages/contracts/ARC_STUDIO.md`)
- [x] Final Studio source in `packages/contracts/studio/`; runtime bytecode matches the live contract
- [x] Backend: pool funded by linking an on-chain campaign (checked on-chain: MUSO allocator, sponsor = organizer's verified wallet, timing) → Milestone 5 watch-time split → per-creator USDC → `awardMany` → relayed `claimFor` (worker, idempotent, late wallets paid within the award window)
- [x] Creator wallet linking API with signature proof (EOA + smart wallets via ERC-1271/6492)
- [x] App: Earnings → link USDC payout wallet; pool → "Fund with USDC on Arc" + on-chain payouts list (opens MUSO's wallet page in MetaMask / Coinbase Wallet / browser via a signed short-lived link)
- [x] Live end to end on Arc testnet through MUSO: page-funded campaign #2 → watch time → awardMany → relayed claimFor (Alice 1.33, Bob 0.67 USDC, late wallet paid) — `pnpm --filter @muso/backend arc:demo`
- [x] Architecture diagram, docs of core functions + Circle tools in README (Arc section)
- [x] Creator wallet linked from a real phone (MetaMask mobile: pairing code + EIP-712 fallback)
- [ ] Demo video showing Arc Studio

### H3 — World ID: one real human per reward pool ($2.5k)
- [x] IDKit v4 with **Proof of Human** (minimum sufficient credential — justified in README)
- [x] Required to earn from human-only pools (all Arc pools); not used as a login
- [x] Backend signs requests + verifies with World v4 API; nullifier UNIQUE(action, nullifier) stops one human verifying two accounts; signal binds proof to account
- [x] Alternative paths tested: rejected, wrong environment/action, other account's proof, duplicate human, malformed → nothing granted (5 e2e tests)
- [x] Only verified humans get a share of Arc pools (so only they are awarded on-chain)
- [x] Only World ID–verified **viewers** count toward watch time in human-only pools (real human attention)
- [ ] Integration debrief: time to first success, friction, missing docs, top improvement
- [x] IDKit `@worldcoin/idkit/expo` 4.6.0 bundles for iOS (Hermes); Verify card on Earnings + human-only pools
- [ ] Developer Portal app + action (app_id, rp_id, signing key) and a Simulator run on the phone

### H6 — Live at ETHGlobal: Carrom Showdown 🎯 (build after H3)

> A real MUSO event at the venue: attendees film the match, pick a player with **test USDC on Arc**, join that player's fan club, and winners split the pool. World ID = one real human, one pick.
> **Testnet only, no real money. Called a "prediction game", never betting.** Feeds the Arc and World picks above.
>
> **On-chain (Arc):** test-USDC deposits per pick · pool total per player · market status · winning player (set by MUSO allocator) · payouts + gasless claims · refunds · best-clip creator share
> **Off-chain (MUSO backend):** World ID proof + nullifier check · event, players, schedule · clips + feed · watch time for best clip · fan clubs, counts, reactions · share cards · referee entering the result
>
> Flow: World ID verify (off) → backend approves pick → deposit test USDC (on) → referee enters winner (off) → backend settles (on) → winners claim (on)

#### H6.0 — Setup
- [ ] ETHGlobal approval (see H0)
- [ ] Match time, players and a referee fixed
- [ ] Test-USDC starter amount for each verified person (e.g. 5 USDC from MUSO's wallet)

#### H6.1 — Event in MUSO (reuses existing features)
- [ ] "ETHGlobal Mumbai Carrom Showdown" event; players added as the lineup
- [ ] Event Live during the match → existing capture/upload works
- [ ] Shared event feed of clips and photos

#### H6.2 — Prediction contract on Arc (built in Arc Studio)
- [x] Reference contract `src/PredictionPools.sol`: createMarket → pick (stake test USDC) → settle (resolver) → claim / refund (anyone can relay, funds go to the staker)
- [x] Parimutuel payout: winners split the pool by stake; optional creator share (≤ 20%) to the best-clip creator
- [x] Refund all if no one picked the winner, the match is cancelled, or the resolver misses `resolveBy`
- [x] Picks lock at `locksAt` (on-chain); one pick per wallet
- [x] One human, one pick on-chain: EIP-712 pick ticket from the gatekeeper (MUSO backend after World ID) binds wallet + `humanId` (World ID nullifier), single use per market
- [x] Ownerless and reusable (anyone can open a market with their own resolver/gatekeeper); reentrancy protection, safe ERC-20 transfers, events
- [x] Tests: 25 Foundry tests incl. a funds-conservation fuzz test (`test/PredictionPools.t.sol`); deploy script `script/DeployPredictionPools.s.sol`
- [ ] Rebuild in **Arc Studio** (required for the prize), review Studio's version with these tests, deploy to Arc testnet
- [ ] Deployed address + first live market

#### H6.3 — Backend (`predictions` module)
- [ ] Market model: event, options (players), status Open → Locked → Settled / Refunded
- [ ] Pick API: World ID proof required → one pick per nullifier per market → on-chain deposit checked
- [ ] Referee/admin "declare winner" → settle on-chain → payouts (idempotent worker)
- [ ] e2e tests: happy path, duplicate human, late pick, no winner → refund, cancelled match

#### H6.4 — Social layer
- [ ] Fan clubs: your pick puts you in that player's club; live fan count per side
- [ ] Event hype feed (H6.1)
- [ ] "I called it 🏆" share card for winners (name, pick, payout, tx link)
- [ ] Best clip award: most verified watch time gets the creator share
- [ ] *Stretch:* big-screen emoji reactions · invite a friend · squad picks · predictor leaderboard

#### H6.5 — Web page for attendees (no app install)
- [ ] Join in 30 seconds: QR → World ID → wallet → pick a player
- [ ] Live view: pool size, fan counts, odds per player
- [ ] Results page + share card
- [ ] Big-screen view for the venue

#### H6.6 — Live run & demo
- [ ] Run the match with real attendees
- [ ] Record verified humans, picks, tx IDs and payouts
- [ ] Demo video + README section (how it works, contract address, real numbers)

### H4 — Extra tracks (only if prize limit allows)
- [ ] **Chainlink CRE** ($1.5k): workflow fetches pool allocations from our API, validates budget/caps/eligibility, calls `setAllocations` on-chain; successful CLI simulation
- [x] **Arkiv** — "Build on Arkiv" track (one of our 3 picks): 5 `muso.*` schemas on Rabdi; worker publishes events (expire event end + 30 d), clips (read-only, handed to creator wallet), read-only attention reports + per-clip shares, payout receipts (link to Arc tx); takedowns delete; idempotent
- [x] Arkiv user-visible read: pool screen "Public proof on Arkiv" reads the report from Arkiv (test proves DB changes don't affect it); `arkiv:query` script for judges
- [x] `/arkiv/schema.md`, `why-arkiv.md`, `how-you-use-arkiv.md`, `reach.md`, `friction.md`; README section with writer wallet + query
- [x] Arkiv live on Rabdi: 6 events, 8 clips (handed to creators' wallets), 1 read-only report + 3 shares + 2 payout receipts linking to Arc txs; read back with `arkiv:query` (report `0x0b33…67ef`)
- [ ] **Swarm bonus** (+$0.5k): free event videos on Swarm, reference stored in the Arkiv post, app plays from Swarm; `/arkiv/swarm.md`

### H5 — Submission & quality (part of Milestone 7)
- [ ] Security pass on all new code (contracts, x402 endpoint, World ID verification)
- [ ] End-to-end tests for every new flow
- [ ] Demo videos per track (length limits respected)
- [ ] README: setup, architecture diagram, deployed addresses, transaction IDs
- [ ] Judge access: demo video + small web page or TestFlight (native app has no web link)
- [ ] Public GitHub repo, open-source licence

---

## ⏭ After the Hackathon — remaining Milestone 6 & 7

### Wallets (from M6)
- [ ] Coinbase CDP embedded wallet in the app (needs Xcode or EAS dev build)
- [ ] Wallet linked to user (ownership proven server-side)
- [ ] No seed phrases or private keys on device storage or in repo

### Real money & payouts (from M7)
- [ ] INR provider (Razorpay / Cashfree) behind the payment-provider interface
- [ ] Creator verification / KYC (India), tax handling
- [ ] Payout destination + eligibility checks, minimum threshold
- [ ] Payout request + status + history
- [ ] Failed payout, refund and reversal handling (incl. funded-pool cancellation)
- [ ] On-chain contribution ≠ completed payout

### Launch quality (from M7)
- [ ] Mobile tests
- [ ] Full security review
- [ ] Media performance pass
- [ ] Accessibility pass
- [ ] Deployment docs + production infrastructure

---

## Database Models

- [~] Users · UserRoles
- [ ] ArtistProfiles · CreatorProfiles · OrganizerProfiles
- [ ] Events · EventArtists · EventSchedules
- [ ] Posts · PostMedia
- [ ] ContentAccessRules · ContentPurchases · ContentEntitlements · ContentPricingHistory
- [ ] Tips
- [ ] Wallets · Transactions · FinancialLedger
- [ ] RewardPools · RewardContributions
- [ ] WatchSessions · WatchHeartbeats · QualifiedWatchTime
- [ ] CreatorRewards · CreatorPayouts
- [ ] Follows · Likes · Comments · SavedPosts
- [ ] Notifications · Reports · ModerationActions
- [ ] ContentPermissions · LicenseRequests
- [ ] UUIDs, FKs, indexes, timestamps, idempotency keys, auditable financial records

---

## Copyright, Consent & Trust

- [ ] Organizer recording policy per event
- [ ] Artist content-usage preferences
- [ ] Uploader rights confirmation
- [ ] Creator keeps ownership unless licensed
- [ ] Artist licensing requests; creator approves commercial reuse
- [ ] Copyright reports + takedown requests
- [ ] Privacy reports; ban on unauthorized private recordings
- [ ] Clear paid-access + licensing terms

---

## Guardrails (must always hold)

- [ ] No fake transaction success states
- [ ] No fabricated balances
- [ ] Video rewards not claimed working without server-side watch-time validation
- [ ] Original private media never in public storage
- [ ] No secrets / private keys in client or repo
- [ ] Every button and navigation action works
- [ ] Loading / error / empty / success states on every screen
- [ ] Testnet only until audits + regulatory review

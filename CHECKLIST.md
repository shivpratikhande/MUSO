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

## Milestone 6 — Wallet & Blockchain

- [ ] Coinbase CDP Embedded Wallet (Expo dev build, polyfills verified)
- [ ] Wallet abstraction layer
- [ ] Wallet linked to user (ownership proven server-side)
- [ ] Base Sepolia + testnet USDC
- [ ] Stablecoin payments for unlocks / tips
- [ ] On-chain transaction verification by backend
- [ ] Reward pool funding contract (escrow) — only where it adds real value
- [ ] Contracts: OpenZeppelin, reentrancy guard, SafeERC20, events, tests
- [ ] Nothing personal / media / watch events on-chain
- [ ] No seed phrases or private keys on device storage or in repo

---

## Milestone 7 — Payouts, Testing & Launch Prep

### Payouts
- [ ] Creator verification (KYC provider evaluated for India)
- [ ] Payout destination + eligibility checks
- [ ] Minimum payout threshold
- [ ] Payout request + status + history
- [ ] Failed payout, refund and reversal handling
- [ ] On-chain contribution ≠ completed payout

### Quality
- [ ] API tests for all financial flows
- [ ] Mobile tests
- [ ] Smart contract tests
- [ ] Security review
- [ ] Media performance pass
- [ ] Accessibility pass
- [ ] Deployment docs

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

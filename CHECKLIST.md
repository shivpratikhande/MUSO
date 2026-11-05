# MUSO — Build Checklist

> Event-powered creator economy: **Capture the moment. Share the experience. Earn from your creativity.**

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done **and tested against the real backend**

A UI that exists but isn't wired to the backend is `[~]`, never `[x]`.

---

## 📍 Current status — 2026-11-06

**Milestone 2 built. The backend is fully tested, but the new mobile screens haven't been tapped through on a phone yet.**
- ✅ Backend: **57/57 e2e tests** pass (auth, profiles, roles, onboarding, real uploads to MinIO, events, lineup, schedule, review, follow, discovery, pagination) plus unit tests. Every monorepo typecheck, lint and test task passes.
- ✅ Mobile: typecheck, ESLint and the iOS bundle pass. Milestone 1 ran on an iPhone in Expo Go (welcome screen and sign-up confirmed).
- ⚠️ The Milestone 2 screens (onboarding, profile, events, lineup, schedule, review) need an on-device pass.
- ⏭ Supporter "interests" moved to Milestone 3, where the feed uses them.
- ⏭ Foundry / contracts moved to Milestone 6.

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
- [ ] Camera: photo capture
- [ ] Camera: video recording
- [ ] Gallery picker (photos + videos)
- [ ] Media preview
- [ ] Video trimming
- [ ] Caption + hashtags
- [ ] Event selection
- [ ] Artist tagging
- [ ] Rights confirmation ("I captured this and have the right to upload")
- [ ] Format + size validation
- [ ] Upload progress, retry, interrupted-upload handling
- [ ] Originals stored privately; optimized versions + thumbnails generated
- [ ] Background media processing job (Redis queue)
- [ ] Content metadata stored (creator, event, artists, type, caption, media, thumbnail, duration, monetization, access, moderation, permission, publication status)
- [ ] Fan uploads never auto-marked as official artist content

### Feed & social
- [ ] Supporter interests (genres) for personalisation
- [ ] Discover feed: For You · Trending · Live Events · Around You · Artists · Photography · Videos
- [ ] Infinite scroll + cursor pagination
- [ ] Video playback in feed
- [ ] Content detail / video viewer / photo gallery
- [ ] Event content feed + event gallery
- [ ] Artist page: fan-captured content section
- [ ] Like / unlike
- [ ] Comment + reply
- [ ] Mentions
- [ ] Save
- [ ] Share
- [ ] Follow / unfollow (artists, creators)
- [ ] Report
- [ ] Block
- [ ] In-app notifications for social activity

---

## Milestone 4 — Monetization (P0 money flow)

### Payment architecture
- [ ] Payment provider abstraction (provider-independent business logic)
- [ ] Idempotency keys on every financial operation
- [ ] Payment verified server-side before any entitlement / ledger update
- [ ] Double-entry financial ledger (immutable, auditable)
- [ ] Platform fee calculation

### Monetization modes
- [ ] Free content (+ tips)
- [ ] Pay to unlock (fixed price)
- [ ] Pay what you want (suggested + optional minimum, public or gated)
- [ ] Tips (₹10 / ₹20 / ₹50 / ₹100 / custom)
- [ ] Pricing history (existing buyers keep access after price change)

### Purchases & access
- [ ] Locked content preview (blurred / watermarked)
- [ ] Unlock + purchase confirmation screens
- [ ] Persistent content entitlements
- [ ] Secure media access (short-lived signed URLs, entitlement-checked)
- [ ] Purchase history
- [ ] Purchased content library
- [ ] High-resolution photo download for buyers
- [ ] Clear licensing terms on purchase (no implied copyright transfer)

### Creator earnings dashboard
- [ ] Totals: earnings, tips, photo sales, video sales, watch rewards, fees, net
- [ ] Status buckets: Estimated · Pending · Confirmed · Available · Paid · Reversed
- [ ] Pending/estimated never shown as withdrawable
- [ ] Top-performing content
- [ ] Purchase + payout history

---

## Milestone 5 — Rewards (P1)

### Reward pools
- [ ] Organizer/sponsor creates reward pool (funded by real, disclosed source)
- [ ] Lifecycle: Draft → Funded → Active → Completed → Distributed / Cancelled
- [ ] Eligibility rules + remaining budget shown
- [ ] Per-video and per-pool caps

### Qualified watch time
- [ ] Authenticated watch sessions
- [ ] Server-issued playback heartbeats
- [ ] Max credited time per interval
- [ ] Unique viewer tracking
- [ ] Duplicate session prevention
- [ ] Background / inactive playback excluded
- [ ] Bot + suspicious activity detection
- [ ] Device + account abuse limits
- [ ] Backend authoritative — client totals never trusted

### Distribution
- [ ] Proportional pool-share calculation (background job)
- [ ] Rewards written to ledger with statuses
- [ ] Reward history + watch reward details screens
- [ ] Event creator leaderboards (verified data, quality-weighted)
- [ ] Creator analytics

### P1 extras
- [ ] Artist licensing requests (request → creator approves/declines)
- [ ] Artist features approved content
- [ ] Organizer dashboard
- [ ] Copyright / takedown requests + moderation queue

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

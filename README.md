# MUSO

**Capture the moment. Share the experience. Earn from your creativity.**

An event-powered creator economy: people at live events capture photos and videos of artists, publish them, and earn when their content is unlocked, tipped or rewarded from funded pools.

Progress is tracked in [CHECKLIST.md](CHECKLIST.md).

---

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo SDK 58 · React Native 0.88 · Expo Router (native tabs, typed routes) · TanStack Query · Zustand · React Hook Form + Zod |
| Backend | NestJS 12 (ESM) · Prisma 7 · PostgreSQL 17 · Redis · Pino logging · Swagger |
| Shared | `@muso/shared` (Zod schemas, enums, API envelope) · `@muso/api-client` (typed fetch client) |
| Tooling | pnpm workspaces · Turborepo · TypeScript 6 · Vitest · Prettier · oxlint / ESLint |

## Repository layout

```
apps/
  backend/          NestJS API  (src/modules/<feature>, test/*.e2e-spec.ts)
  mobile/           Expo app    (src/app = routes, src/components/ui, src/features, src/theme)
packages/
  shared/           Zod schemas + domain enums used by app and API
  api-client/       Typed REST client
  database/         Prisma schema, migrations, seed, client factory
  contracts/        Solidity (Milestone 6)
```

---

## Local setup (macOS)

### 1. Prerequisites

- Node **22.18+** and pnpm **10** (`corepack enable`)
- PostgreSQL 17, Redis, MinIO (S3-compatible storage) and ffmpeg (video processing):
  ```sh
  brew install postgresql@17 redis minio ffmpeg
  brew services start postgresql@17
  brew services start redis
  brew services start minio      # http://localhost:9000, login minioadmin / minioadmin
  ```
  The API creates the `muso-public` and `muso-private` buckets automatically on first boot (`S3_AUTO_CREATE_BUCKETS=true`).
  _Or with Docker:_ `docker compose up -d` (Postgres, Redis, MinIO).
- **Xcode** (from the App Store) for the iOS simulator, then `xcode-select -s /Applications/Xcode.app`

### 2. Database

```sh
psql -d postgres -c "CREATE ROLE muso WITH LOGIN PASSWORD 'muso_dev' CREATEDB;"
createdb -O muso muso_dev
createdb -O muso muso_test
```

### 3. Install & configure

```sh
pnpm install
cp .env.example .env                       # then set JWT_ACCESS_SECRET:
openssl rand -base64 48                    #   paste the output into .env
cp apps/mobile/.env.example apps/mobile/.env
pnpm db:migrate                            # apply migrations + generate client
pnpm db:seed                               # genres + demo artists/events (SEED_DEMO=0 to skip)
pnpm db:make-admin you@example.com         # after signing up: admin + verified email
pnpm build                                 # build shared packages
```

### 4. Run

```sh
pnpm dev:backend        # API on http://localhost:4000/v1  · docs at http://localhost:4000/docs
pnpm dev:mobile         # Metro; press i for iOS simulator
```

The app uses native modules (SecureStore, native tabs), so use a **development build** rather than Expo Go:

```sh
cd apps/mobile && npx expo run:ios
```

On a physical phone, use your Mac's LAN IP (`ipconfig getifaddr en0`) in **two** places:
- `apps/mobile/.env` → `EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000/v1`
- `.env` → `S3_PUBLIC_ENDPOINT=http://<LAN-IP>:9000` (so the phone can upload and load images)
- `.env` → `PUBLIC_API_URL=http://<LAN-IP>:4000` (so the phone can open the checkout page)

If you change Wi-Fi, your LAN IP changes. Run **`pnpm dev:lan`** to update all three, then restart the API and Metro.

Quickest way to try it without Xcode is **Expo Go**. Sign in to the same Expo account on the Mac (`npx expo login`) and in the Expo Go app, then scan the QR code from `pnpm dev:mobile`.

**Dev email:** no mail provider yet. Verification and password-reset codes are printed in the backend log (`[dev mail] …`).

---

## Scripts (repo root)

| Command | What it does |
|---|---|
| `pnpm build` | Build all packages (Turbo, dependency-ordered) |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | oxlint (backend) + ESLint (mobile) |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Backend e2e tests against `muso_test` (migrations applied automatically) |
| `pnpm db:migrate` | Create/apply a migration in dev |
| `pnpm db:seed` | Seed genres + demo artists and events |
| `pnpm db:make-admin <email>` | Make an account admin (dev only) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm format` | Prettier |

---

## API conventions

- Base path `/v1`. Every response is `{ "data": … }` or `{ "error": { "code", "message", "details?" } }`.
- **Secure by default:** every route requires a Bearer access token unless marked `@Public()`.
- Role checks with `@Roles('ARTIST', …)`. A user can hold several roles; `ADMIN` passes every role check.
- Request bodies are validated with the shared Zod schemas (`ZodValidationPipe`).
- Global rate limit (`RATE_LIMIT_PER_MINUTE`) plus stricter limits on credential endpoints.

## Auth model

- Passwords hashed with **argon2id**.
- **Access token:** HS256 JWT, 15 min, held in memory on the device only.
- **Refresh token:** opaque 256-bit, stored on device in the Keychain (`expo-secure-store`) and on the server as a SHA-256 hash. Rotated on every use. Reusing an old token revokes the whole session family.
- Email verification and password reset use 6-digit codes (hashed, 15 min expiry, 5 attempts). Password reset signs out all devices.
- Sign-in errors and forgot-password responses never reveal whether an email is registered.

## Events model

- Organizers (with a verified email and an organizer profile) create events. Events start **PENDING** and are only visible to their organizer and admins until an admin **approves** them.
- Changing an approved event's core details (name, description, poster, venue, dates) sends it back to review.
- Lifecycle (Upcoming / Live / Completed / Cancelled) is **derived** from start, end and cancellation times, so it never needs a cron job.
- Each event has a **recording policy** (allowed / photos only / not allowed), and each artist sets a **fan-recording policy**. Milestone 3 uploads respect both.

## Uploads

`POST /v1/uploads/presign` returns a 5-minute presigned PUT URL. The content type and exact byte length are signed, and keys look like `<folder>/<userId>/<uuid>.<ext>`. Before saving a key on a profile or event, the API checks that it belongs to the caller and that the upload actually completed. Avatars, covers and posters live in a public-read bucket. Private originals for fan media come in Milestone 3.

## Fan media (captures)

1. The app asks `POST /v1/posts/uploads/presign` for a signed PUT URL to the **private** bucket (`originals/<userId>/…`) and uploads with a progress bar.
2. `POST /v1/posts` validates ownership, type, event status, the event's recording policy and the tagged artists' fan-recording policy, then queues a job. Publishing is idempotent via `clientRequestId`.
3. The **media worker** (BullMQ on Redis, in-process, `MEDIA_WORKER_ENABLED`):
   - **Photos:** auto-rotated and resized to WebP, with all metadata including GPS removed, plus a thumbnail.
   - **Videos:** probed, capped at 3 minutes, transcoded to H.264/AAC MP4 with faststart and metadata stripped, plus a poster thumbnail.
4. Originals are never served. Derivatives are served through short-lived **signed URLs**, so Milestone 4 can gate paid content.

Fan captures are never marked official. A post is only "official" when the tagged artist posts it themselves.

## Money (Milestone 4)

- **Amounts** are integers in paise. There are no floats anywhere. Fees are snapshotted per payment in basis points.
- **Modes:** Free, Pay to unlock, Pay what you want (public or gated), plus tips on any post.
- **Consent:** fans can only sell captures of artists who set "Fans can earn". Artists can always sell their own content.
- **Flow:**
  1. `POST /v1/payments/checkout` (with an idempotency key) returns a hosted `checkoutUrl`.
  2. The app opens it in an in-app browser.
  3. The app calls `POST /v1/payments/:id/verify`. The **server** asks the provider for the result, checking amount and currency, then claims PENDING→SUCCEEDED exactly once.
  4. In one database transaction it writes: entitlement (unlocks), earning (PENDING), and a balanced ledger journal.
- **Background:** a timer reconciles payments the app never verified, and moves earnings to AVAILABLE after `EARNINGS_HOLD_MINUTES`.
- **Ledger:** `ledger_entries` is append-only (a DB trigger blocks UPDATE and DELETE), and every journal must sum to zero (a deferred DB trigger).
- **Provider:** `PAYMENTS_PROVIDER=sandbox` simulates a hosted checkout with **no real money**, and the API refuses to boot with it in production. Real providers implement `PaymentProvider` (`apps/backend/src/modules/payments/providers`).

## Reward pools & watch time (Milestone 5)

- An event organizer creates a pool (budget, disclosed funder, per-video cap, minimum viewers) and funds it through the same verified checkout. The money sits in `pool:<id>:escrow` in the ledger.
- While a video plays on screen, the app sends a heartbeat every 5 s (`/v1/watch/sessions/:id/heartbeat`). The **server** credits the time it measured between beats, never a client total. Credit per beat is capped, and paused or background playback, timing anomalies, position jumps, network clusters, shared devices, unverified accounts and self-views are all excluded. Each viewer counts once per video (capped at the video length).
- When the window ends, a job splits the budget in proportion to qualified watch time (`splitProportionally`: per-video caps with redistribution, exact paise). It writes allocations, `WATCH_REWARD` earnings (pending, then available) and a balanced ledger journal, exactly once.
- While a pool is live, creators see a non-binding **Estimated** amount. It is never withdrawable.

## Security notes

- `.env` files are git-ignored. Never commit secrets. Only `EXPO_PUBLIC_*` values reach the app bundle, so never put secrets there.
- No private keys, seed phrases or service credentials in the app or repo.
- Financial features (Milestone 4+) will use a server-side ledger, idempotency keys, and payment verification on the server. Clients never set balances or payment status.

---

## Hedera x402 — AI agents pay creators (ETHGlobal track)

Paid fan captures are sold per item to **autonomous agents** over [x402](https://docs.hedera.com/solutions/ai/x402/merchant-integration), settled in **USDC on Hedera testnet** with no human approving each payment.

```
Agent (apps/agent)                        MUSO API (apps/backend/src/modules/x402)            x402 facilitator        Hedera
  │ GET /.well-known/x402 ───────────────▶ discovery doc (catalogue URL, network, asset)
  │ GET /v1/x402/catalog ────────────────▶ paid posts + USDC price (INR → USD at X402_INR_PER_USD)
  │ policy check: budget · per-item cap · per-creator limit · allowlist · query
  │ GET /v1/x402/posts/:id/content ──────▶ 402 + PAYMENT-REQUIRED (USDC 0.0.429274, payTo, feePayer)
  │ signs USDC TransferTransaction
  │ GET … + PAYMENT-SIGNATURE ───────────▶ verify ─────────────────────────────────▶ /verify
  │                                        settle ─────────────────────────────────▶ /settle ───▶ consensus
  │ ◀── 200 + PAYMENT-RESPONSE + media ─── record sale (idempotent on tx id): entitlement,
  │                                        creator earning (pending), balanced ledger journal
  ▼ logs tx id + HashScan link (apps/agent/spend-log.jsonl)
```

- **Server:** `apps/backend/src/modules/x402/*`. It uses `@x402/core` + `@x402/hedera` with a per-post price. Settled Hedera transactions go through the same fulfilment as every other payment (`PaymentsService.recordSettledUnlock`), so creators see agent sales in **Earnings**.
- **Agent:** `apps/agent/src/agent.ts` with its policy in `policy.ts` (unit-tested). The agent never signs above its per-item cap: our policy checks first, then x402 `spendControls` enforces the cap at the protocol level.
- **Facilitator:** `https://x402.org/facilitator` (Hedera testnet). Blocky402 or Launa also work through `X402_FACILITATOR_URL`.

### Run it
1. Create a Hedera testnet account at [portal.hedera.com](https://portal.hedera.com) and put it in `apps/agent/.env` (`HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`).
2. Run `pnpm --filter @muso/agent setup:hedera`. It associates the agent with testnet USDC and creates the MUSO treasury account; copy the printed `X402_PAY_TO` into the root `.env` and set `X402_ENABLED=true`.
3. Get testnet USDC for the agent at [faucet.circle.com](https://faucet.circle.com) (Hedera testnet).
4. Restart the API. Post a photo with **Pay to unlock** in the app.
5. Run `pnpm --filter @muso/agent start` (or `AGENT_DRY_RUN=true` to only discover and decide).

**First settled payment (Hedera testnet).** An agent bought a paid photo for **0.59 USDC**:

| | |
|---|---|
| Transaction | `0.0.9185802@1793929074.532406135` |
| HashScan | https://hashscan.io/testnet/transaction/0.0.9185802-1793929074-532406135 |
| Transfer | USDC `0.0.429274`: agent `0.0.11332505` → −0.59 · MUSO treasury `0.0.11332740` → +0.59 |
| Fee payer | x402.org facilitator `0.0.9185802` (the agent paid no network fee) |
| Recorded in MUSO | payment SUCCEEDED (₹49), creator earning ₹44.10 pending, ledger journal balanced (sum 0) |

All addresses above are **testnet** accounts.



ETHGlobal asks teams to disclose AI usage. This project was built with an AI coding assistant (Claude, via Claude Code) working under the team's direction:

- **The team** set the product vision, the requirements, the sponsor-track choices, and all decisions on scope and trade-offs. The team reviewed and tested the results on device.
- **The AI assistant** wrote most of the implementation code, database migrations, automated tests and documentation, following the team's specifications. It also researched current SDK documentation (Expo, Prisma, NestJS, x402/Hedera, …) before using each library.
- Every feature is covered by automated tests that run against real services (PostgreSQL, Redis, MinIO, ffmpeg). See each milestone's test counts in `CHECKLIST.md`.

## License

[MIT](LICENSE)


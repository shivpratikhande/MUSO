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

---

## Arc — sponsor-funded USDC reward pools (ETHGlobal track)

Sponsors fund a MUSO reward pool with **USDC on [Arc](https://arc.network)** (Circle's stablecoin-native L1, where gas is USDC too). The money sits in a contract, not with MUSO. When the pool ends, MUSO splits it by server-verified watch time and pays every creator **straight to their wallet**. MUSO pays the gas, so creators never need any.

- **Contract:** `RewardCampaigns`, **built in [Arc Studio](https://studio.arc.io)**. Project: https://studio.arc.io/app/a2e5e21f-ce8e-4ba9-87f0-b46aa7e6cc03?thread=d76eb9e9-1820-493a-86f5-9fffd28f605d
- **Deployed (Arc Testnet, chain 5042002):** [`0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb`](https://testnet.arcscan.app/address/0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb). Source: [`packages/contracts/studio/RewardCampaigns.sol`](packages/contracts/studio/RewardCampaigns.sol), which matches the live runtime bytecode.
- **More detail:** build history, security review and every transaction are in [`packages/contracts/ARC_STUDIO.md`](packages/contracts/ARC_STUDIO.md).

```
 Sponsor (organizer)                 MUSO app + API                              Arc Testnet
 ───────────────────                 ──────────────                              ───────────
 "Fund with USDC on Arc" ──▶ signed short link /w/CODE (30 min) ──▶ MUSO wallet page in the wallet app
 wallet: approve USDC + createCampaign(title, budget, cap, allocator = MUSO, endsAt) ─────▶ RewardCampaigns
                                       POST /arc/session/fund {campaignId}               (USDC escrowed)
                                       verify on-chain: allocator = MUSO, sponsor = the
                                       organizer's signature-verified wallet, timing, unused
                                       pool → FUNDED (USD)
 Creators: "Link wallet" ──▶ sign a challenge (personal_sign or EIP-712; EOA or ERC-1271 smart wallet)
 Fans watch videos ──▶ heartbeats ──▶ qualified watch time (anti-fraud, Milestone 5)
                                       pool ends → split by watch time → one payout per creator
                                       ArcWorker (every 30 s, idempotent):
                                         awardMany(id, wallets, amounts) ──────────────────▶ reserved
                                         claimFor(id, wallet)  (MUSO pays gas) ────────────▶ USDC → creator
 Creators who link a wallet later are paid within the 14-day award window; the sponsor can reclaim the rest.
```

### Contract functions (`RewardCampaigns`)
| Function | Who | What it does |
|---|---|---|
| `createCampaign(title, budget, maxPerRecipient, allocator, endsAt)` | anyone (the sponsor) | Pulls exactly `budget` USDC into escrow and returns the campaign id. If `allocator` is set, only it can award. |
| `award(id, participant, amount)` / `awardMany(id, participants[], amounts[])` | the allocator (MUSO) | From `endsAt` until 14 days after, reserves each creator's share: once per address, at most the per-recipient cap and the remaining budget. The sponsor and allocator can't be paid. |
| `claim(id)` / `claimFor(id, participant)` | the creator / anyone (MUSO relays it) | Sends the reserved USDC to the creator. A relayer can only ever pay the creator, never itself. |
| `reclaimUnawarded(id)` | the sponsor | After the award window, returns `budget − awarded` to the sponsor. Awarded funds stay claimable forever. |
| `getCampaign`, `getCampaigns`, `awardOf`, `isAwarded`, `hasClaimed` | anyone | Read-only views. |

There's no owner and no admin. Nobody can move a campaign's USDC except along these paths.

### How MUSO uses it
- **Backend** (`apps/backend/src/modules/arc`):
  - `ArcService` links campaigns to pools after checking them on-chain, verifies wallet signatures, and runs payouts. `ArcWorker` runs the payout job.
  - `ViemArcChain` (viem) is the only code that touches the chain. Tests replace it with an in-memory fake that enforces the contract's rules.
- **Wallet page:** `arc.page.ts` is served at `/w/:code`, or at `/` with a typed pairing code, because MetaMask mobile drops link paths. It uses the standard injected provider (EIP-1193), so it works in MetaMask and Coinbase Wallet's in-app browsers and in desktop wallet extensions.
- **App:**
  - Earnings and onboarding: **Link wallet**
  - Pool screen: **Fund with USDC on Arc**, plus the on-chain payout list with explorer links
- **Amounts:** Arc pools are kept in USD cents, and payouts are `cents × 10⁴` USDC base units. A creator's videos are combined into one payout, because the contract pays each address once per campaign.

### Circle tools used
- **Arc Testnet**, with USDC as gas, via `https://rpc.testnet.arc.network`
- **USDC** through its ERC-20 interface `0x3600…0000` (6 decimals)
- **Arc Studio** to build, review and deploy the contract
- **Circle Faucet** for test USDC
- **Arc Foundry** (`arc-forge` / `arc-cast`) for our own tests and fork checks

### Security
Our independent review of Studio's first version found two issues: (a) awards were possible before a campaign ended; (b) the sponsor could award the whole budget to itself, so creators couldn't be paid. Both are fixed in the deployed contract and covered by tests.

Tests:
- `packages/contracts/test/RewardCampaignsStudio.t.sol`: 9 tests, including a 2,000-run funds-conservation fuzz test
- a fork test against the live deploy
- `apps/backend/test/arc.e2e-spec.ts`: wallet proofs (expired, replayed for another account, one wallet on two accounts), campaign checks, payouts, late wallets, award-window expiry

### Run it
1. Set these in the root `.env`:
   - `ARC_ENABLED=true`
   - `ARC_REWARD_CAMPAIGNS_ADDRESS`
   - `ARC_ALLOCATOR_PRIVATE_KEY` (a testnet wallet with a little USDC for gas)
   - for phones, `ARC_PUBLIC_URL`: an https URL wallet apps can open, e.g. `ngrok http 4000`
2. Run `pnpm --filter @muso/backend arc:demo` against the running API. It creates a pool, funds it on Arc (with `--fund-link`, through the wallet page), generates watch time, and waits until creators are paid on-chain.

**Live run on Arc Testnet:**

| Step | Result |
|---|---|
| Funding | Campaign #2 (2 USDC), funded through the wallet page |
| Alice (watch-time share) | 1.33 USDC ([claim tx](https://testnet.arcscan.app/tx/0x09442a7758c1297ac942c6ac66937d1ce5bb034e2335717c7509cda89fbb9d4e)) |
| Bob (linked his wallet after Alice was paid) | 0.67 USDC ([claim tx](https://testnet.arcscan.app/tx/0xdf5f7aa0409fe76e60afd89cf23d1486e016255bd7d7d05ae7fd62f2db2cdd3b)) |
| Gas paid by creators | none |

## Arkiv — public proof of real attention (ETHGlobal track)

Sponsors fund MUSO reward pools to pay for **real human attention**, so they need numbers they can trust. When a sponsored pool ends, MUSO publishes its **attention report** to [Arkiv](https://arkiv.network): verified human viewers, watch time, each clip's share and every USDC payout on Arc. It's **read-only**, so not even MUSO can change it later. The app's **"Public proof on Arkiv"** card reads the report **from Arkiv, not from MUSO's database**, and anyone can run the same query.

- **Network:** Rabdi testnet (chain 7794095), `@arkiv-network/sdk` 1.0.1
- **Writer wallet** (`$creator` of every entity): **`0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB`** ([explorer](https://rabdi.explorer.arkiv.network/address/0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB))
- **Entities:**
  - `muso.events`: expire 30 days after the show
  - `muso.clips`: read-only, **handed to the creator's wallet** once they link one
  - `muso.attention-reports` + `muso.attention-shares`: read-only, ~182-day audit window
  - `muso.payout-receipts`: link to Arc USDC transactions

  Details in [`arkiv/schema.md`](arkiv/schema.md) and [`arkiv/how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md).
- **Query it yourself** (no MUSO server, no private key): `pnpm --filter @muso/backend arkiv:query [poolId]`, or in code:
  ```ts
  publicClient.select({ $key: true, poolId: true, verifiedViewers: true, watchSeconds: true, paid: true })
    .from(defineSchema("muso.attention-reports", { poolId: str().indexed(), /* … */ }))
    .createdBy("0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB")
    .fetch()
  ```
- **Live on Rabdi:** the Arc demo pool's report, [`0x0b33…67ef`](https://rabdi.explorer.arkiv.network/entity/0x0b3370482f5bd905174b9f69490ad0f9ddf0bd521b0b97c8bf2a1e8fd51567ef). It holds 2 viewers, 36 s watched and 3 clips paid (2 USD, Arc campaign #2), with per-clip shares and both payout receipts linking to the Arc USDC transactions. The first sync also published 6 events and 8 clips; all 8 clips were handed to their creators' wallets. Read it yourself: `pnpm --filter @muso/backend arkiv:query 01a1b037-5e8c-7069-a860-924419b8670d`.
- **Judging files:** [`arkiv/why-arkiv.md`](arkiv/why-arkiv.md) · [`arkiv/how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md) · [`arkiv/reach.md`](arkiv/reach.md) · [`arkiv/friction.md`](arkiv/friction.md)
- **Code:** `apps/backend/src/modules/arkiv` (schemas, SDK gateway, sync worker, proof endpoint) and `apps/mobile/src/features/arkiv/ArkivProofCard.tsx`. Tests: `apps/backend/test/arkiv.e2e-spec.ts` (in-memory Arkiv). It covers lifetimes, read-only flags, the handover to the creator, takedowns, no double writes, and that the proof card comes from Arkiv rather than the database.
- **Configure:** `ARKIV_ENABLED=true`, `ARKIV_WRITER_PRIVATE_KEY` (fund it with tGLM at [hub.arkiv.network/faucet](https://hub.arkiv.network/faucet)), `ARKIV_ACCESS_KEY` (from [hub.arkiv.network/access-keys](https://hub.arkiv.network/access-keys)).

## World ID — one real human per reward account (ETHGlobal track)

Watch-time rewards attract farming: one person with many accounts watching their own videos. MUSO uses **World ID Proof of Human** (IDKit v4, World ID 4.0) so that **one human can verify only one MUSO account**. Reward pools can be marked **verified humans only**, and every pool funded with USDC on Arc is one. World ID isn't used for login, and MUSO stores no personal data: only an anonymous, action-scoped **nullifier**.

**Why Proof of Human:** the goal is uniqueness (one person, one earning account), not age or identity. It's the minimum credential that achieves that. Passport or document credentials would reveal more than we need.

```
 App (Expo, @worldcoin/idkit/expo)        MUSO API (apps/backend/src/modules/world-id)        World
 "Verify with World ID" ─▶ POST /me/human/context ─▶ signRequest(signing key, action)  (key never leaves the server)
                         ◀── app_id, action, environment, signal = user id, rp_context
 useIDKitRequest({ preset: proofOfHuman({ signal }) }) ─▶ World App / Simulator ─▶ ZK proof
 POST /me/human/verify { result }  ─▶ local checks: environment, action, signal_hash = hash(user id)
                                     forward result unchanged ─▶ POST developer.world.org/api/v4/verify/{rp_id}
                                     success + environment match
                                     store nullifier NUMERIC(78,0), UNIQUE(action, nullifier); user.humanVerifiedAt
 Pool standings: human-only pools give unverified creators no share (shown as "verify to earn");
 their share goes to verified humans. On-chain Arc payouts therefore go only to verified humans.
```

- **Replay and sharing:**
  - The signal binds each proof to the signed-in account, so a proof made for account A is rejected on account B.
  - The nullifier's unique constraint stops one human from verifying a second account.
  - Verifying again is a no-op.
- **Nothing granted on failure:** a cancelled flow, a rejection by World, the wrong environment or action, a mismatched signal, or a duplicate nullifier all leave the account unverified. These cases are tested in `apps/backend/test/world-id.e2e-spec.ts`, with World's verifier faked.
- **Configure** (`.env`):
  - `WORLD_ID_ENABLED=true`
  - `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY` from [developer.world.org](https://developer.world.org)
  - `WORLD_ID_ACTION` (create this action in the Portal)
  - `WORLD_ID_ENVIRONMENT`: `staging` for the [Simulator](https://simulator.worldcoin.org) (the app copies the request link for you), `production` for a real World App

## Predictions — a prediction game on any event (Arc)

Organizers add prediction questions to any event, and fans stake **test USDC on Arc**. Winners split the pool. This is a testnet prediction game with no real money.

| Template | Example | Result |
|---|---|---|
| Match winner | "Who wins the carrom final?" | Organizer declares |
| Battle of the bands | "Who wins tonight's battle?" (options from the lineup) | Organizer declares |
| Setlist | "What's the encore song?" | Organizer declares |
| **Best clip** | "Whose clip gets the most real watch time tonight?" | **MUSO settles it automatically** from verified watch time; the winning creator gets up to 20% |
| Custom | anything | Organizer declares |

**On-chain** (`PredictionPools`, built for Arc):
- each stake, the totals per option, and the lock time
- the result and the creator share
- payouts and refunds
- a guaranteed refund for everyone if the market isn't settled by `resolveBy`

**Off-chain** (MUSO):
- the question and option labels
- **one person, one pick**: MUSO signs an EIP-712 *pick ticket* that binds the wallet to a `humanId`. The `humanId` is a hash of the World ID nullifier, or of the account id when there's no World ID. The contract accepts each `humanId` only once per market.
- for Best clip, counting verified watch time with the same anti-bot rules as reward pools

```
Organizer: POST /v1/events/:id/predictions ─▶ createMarket (resolver + gatekeeper = MUSO)
Fan: POST /v1/predictions/:id/pick-link ─▶ wallet page ─▶ pick ticket (signed) ─▶ approve + pick (USDC → contract)
Result: organizer POST /settle, or the worker settles Best clip from watch time ─▶ settle(option, creator)
Worker: claim / refund for every pick (MUSO pays gas; funds always go to the picker)
```

- **Tests:**
  - `packages/contracts/test/PredictionPools.t.sol`: 25 Foundry tests, including a funds-conservation fuzz test.
  - `apps/backend/test/predictions.e2e-spec.ts`: 5 e2e tests.
- **Enable:**
  1. Deploy `PredictionPools` (USDC on Arc).
  2. Set `PREDICTIONS_ENABLED=true` and `PREDICTIONS_CONTRACT_ADDRESS`. It uses the Arc RPC and `ARC_ALLOCATOR_PRIVATE_KEY`.

## ENS — a name for every creator (`alice.muso.eth`)

Every MUSO creator gets a free ENS subname from their username: `shiv.beats` → **`shiv-beats.muso.eth`** (`.` and `_` become `-`; if two usernames map to the same label, the older account keeps it). The name resolves to the creator's **linked payout wallet**, so anyone can tip or pay them by name from any wallet, and it carries their MUSO profile as text records. Issuing names costs no gas: the records live in MUSO's database and are served through a **CCIP-Read gateway** (EIP-3668 + ENSIP-10 wildcard resolution). The only on-chain piece is one resolver contract that checks MUSO's signature.

```
 Wallet / ENS app / viem            Ethereum (Sepolia)                          MUSO API (apps/backend/src/modules/ens)
 resolve("shiv-beats.muso.eth") ─▶ MusoOffchainResolver.resolve(name, data)
                                   revert OffchainLookup(url, callData)
 GET /v1/ens/gateway/{sender}/{data}.json ───────────────────────────────────▶ decode name + call (addr / text / …)
                                                                              user by label → wallet + profile
                                   ◀── { data: abi.encode(result, expires, sig) }   signed by ENS_SIGNER_PRIVATE_KEY
 resolveWithProof(response, callData) ─▶ checks signer + expiry ─▶ result
```

- **Records served:**
  - `addr`: the linked wallet, for ETH (60) and every EVM chain (ENSIP-11/19), including Arc.
  - Text records: `name`, `description` (bio), `avatar`, `location` (only if location is shown), `url`, and `com.twitter` / `com.instagram` / `com.github` / `org.telegram` / `com.youtube` taken from profile links. `xyz.muso.username` holds the MUSO username.
- **In the app:**
  - The wallet card shows your ENS name.
  - A pool's on-chain payouts list shows creators' ENS names.
  - A sponsor wallet shows its ENS primary name (e.g. `brand.eth`) when it has one.
- **API:**
  - `GET /v1/ens/status` (signer and gateway URL)
  - `GET /v1/me/ens`
  - `GET /v1/ens/resolve?name=` (MUSO names are answered locally; other names are read from Ethereum)
  - `GET /v1/ens/reverse/:address`
  - The gateway, in GET and POST form
- **Security:**
  - The resolver only accepts answers signed by a trusted signer before `expires` (default 5 min).
  - The signature covers the resolver address, the exact request and the result, so an answer can't be swapped or replayed for another name.
  - Answers for unknown names, deeper names and a mismatched `node` are empty.
  - Deleted accounts lose their name.
- **Tests:**
  - `packages/contracts/test/MusoOffchainResolver.t.sol`: 8 Foundry tests.
  - `apps/backend/test/ens.e2e-spec.ts`: 7 tests, covering records, signatures, label collisions, privacy and malformed requests.

### Live on Sepolia

- Parent name: **`musoapp.eth`** (ENSv2 on Sepolia), so creators are `<username>.musoapp.eth`.
- Resolver: [`0x83ef18ee33affe731386826d4282c3e9d836169d`](https://sepolia.etherscan.io/address/0x83ef18ee33affe731386826d4282c3e9d836169d) ([deploy tx](https://sepolia.etherscan.io/tx/0x1f4cf291d4da2f362afd25a4bf663c26a7c667ca8b137aab4c41d56d974fd226)).
- Gateway: the Railway API, `https://muso-api-production.up.railway.app/v1/ens/gateway/{sender}/{data}.json`.
- Check a name the way wallets do: `node scripts/ens-sepolia.mjs check blockparty-mum.musoapp.eth` → the creator's linked wallet and bio.

### Set it up (Sepolia)

`scripts/ens-sepolia.mjs` does steps 3–4 for you: `wallet` (makes a deployer wallet), `deploy` (uses `ARC_PUBLIC_URL` as the https gateway base), `set-url` (after the API address changes) and `check`.


1. Register a name (e.g. `muso.eth`) on [sepolia.app.ens.domains](https://sepolia.app.ens.domains) with Sepolia ETH.
2. Set `ENS_ENABLED=true`, `ENS_PARENT_NAME` and `ENS_SIGNER_PRIVATE_KEY` in `.env`. Make the API reachable over https (`PUBLIC_API_URL`, e.g. a tunnel), then read the `signer` and `gatewayUrl` from `GET /v1/ens/status`.
3. Deploy the resolver:
   ```sh
   cd packages/contracts
   ENS_GATEWAY_URL='<gatewayUrl>' ENS_SIGNER_ADDRESS=<signer> \
     arc-forge script script/DeployMusoOffchainResolver.s.sol --rpc-url <sepolia rpc> --private-key <key> --broadcast
   ```
4. In the ENS app, set the parent name's **resolver** to the deployed address. `<username>.muso.eth` now resolves in any ENS-aware wallet and in the ENS app.

## How we used AI

ETHGlobal asks teams to disclose AI usage. This project was built with an AI coding assistant (Claude, via Claude Code) working under the team's direction:

- **The team** set the product vision, the requirements, the sponsor-track choices, and all decisions on scope and trade-offs. The team reviewed and tested the results on device.
- **The AI assistant** wrote most of the implementation code, database migrations, automated tests and documentation, following the team's specifications. It also researched current SDK documentation (Expo, Prisma, NestJS, x402/Hedera, …) before using each library.
- Every feature is covered by automated tests that run against real services (PostgreSQL, Redis, MinIO, ffmpeg). See each milestone's test counts in `CHECKLIST.md`.

## License

[MIT](LICENSE)


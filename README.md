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

## Security notes

- `.env` files are git-ignored. Never commit secrets. Only `EXPO_PUBLIC_*` values reach the app bundle, so never put secrets there.
- No private keys, seed phrases or service credentials in the app or repo.
- Financial features (Milestone 4+) will use a server-side ledger, idempotency keys, and payment verification on the server. Clients never set balances or payment status.

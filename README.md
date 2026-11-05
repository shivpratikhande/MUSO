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
- PostgreSQL 17 and Redis:
  ```sh
  brew install postgresql@17 redis
  brew services start postgresql@17
  brew services start redis
  ```
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
pnpm db:seed                               # genres
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

On a physical phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your Mac's LAN IP (e.g. `http://192.168.1.20:4000/v1`).

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
| `pnpm db:seed` | Seed development data |
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

## Security notes

- `.env` files are git-ignored. Never commit secrets. Only `EXPO_PUBLIC_*` values reach the app bundle, so never put secrets there.
- No private keys, seed phrases or service credentials in the app or repo.
- Financial features (Milestone 4+) will use a server-side ledger, idempotency keys, and payment verification on the server. Clients never set balances or payment status.

# @muso/web

The MUSO marketing site: Next.js 16 (App Router), fully static, styled with the same tokens as the mobile app (`apps/mobile/src/theme/tokens.ts`).

```sh
pnpm --filter @muso/web dev         # http://localhost:3100
pnpm --filter @muso/web lint        # ESLint (eslint-config-next, flat config)
pnpm --filter @muso/web typecheck
pnpm --filter @muso/web build
```

## Layout

- `src/app/page.tsx`: every section. Static content is rendered on the server.
- `src/components/`: the interactive parts are client components (phone mockup, role tabs, watch-time simulator, pool split calculator, predictions, ENS name preview, "Built on" cards, sign-up).
- `src/lib/split.ts`: the proportional pool split with per-clip caps (whole cents, largest-remainder rounding).
- `src/lib/ens.ts`: username → `name.muso.eth` label, the same rule as `packages/shared/src/schemas/ens.ts`.

## Deploy on Vercel

1. Import the repo in Vercel and set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm. `vercel.json` runs lint before the build.
2. Optional: set `NEXT_PUBLIC_SIGNUP_ENDPOINT` to a URL that accepts `POST { email, role }` JSON. Without it, the early-access form only saves sign-ups in the visitor's browser.

Or from the CLI: `cd apps/web && npx vercel` (preview) / `npx vercel --prod`.

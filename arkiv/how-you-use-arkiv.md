# How MUSO uses Arkiv

**Do the things we filter on, who can edit each entity, and when it expires fit what the app does?**

MUSO pays fans who film live events for the clips real people actually watch. Sponsors fund the pools, so they need to trust the numbers. Arkiv is where those numbers become **public, read-only and checkable** without trusting MUSO.

## What we filter on, and why
- **`muso.attention-reports` by `poolId`:** the pool screen's **"Public proof on Arkiv"** card loads the report this way. That's the user-visible feature that reads from Arkiv: verified humans, watch time, clips paid and amount paid all come from Arkiv, not from MUSO's database. Our tests check that changing MUSO's database afterwards doesn't change what the card shows.
- **`muso.attention-shares` by `report`:** the per-clip lines under the report, each linking to its entity.
- **`muso.payout-receipts` by `poolId` (and `creator`):** links each payout to its USDC transaction on Arc. A creator can find every payment to their wallet with `eq('creator', addr(…))`.
- **`muso.clips` by `event`, `license`, `kind`:** an open catalogue of event clips (for example "paid videos from this event"), so other apps can find licensable clips without MUSO's API.
- **`muso.events` by `city`, `country`, `startsAt`/`endsAt`:** "events in Mumbai this week".
- **Always `createdBy(MUSO writer)`:** Arkiv is public, and anyone can write a `muso.*` entity, so the creator is the only thing we trust.

Indexes exist only on these columns. Display-only fields (`title`, `sponsor`, `creatorName`, amounts) aren't indexed.

## Who can edit each entity
- **Reports, shares, receipts: `readonly`.** Once a pool's report is published, **nobody, MUSO included, can change its numbers.** That's the point of an audit record. MUSO can only let it expire.
- **Clips: `readonly`, then handed to the creator.** When a creator links a wallet (signature-verified), MUSO transfers the clip's entity to that wallet (`changeOwnership`). From then on the creator decides: they can **extend** it (keep their clip listed) or **delete** it (take it out of the public catalogue). Nobody can rewrite the facts.
- **Takedowns:** if a clip is removed for copyright or privacy while MUSO still owns its record, MUSO deletes the entity too.
- **Events: owned by MUSO,** so we can correct details while the event is upcoming.

## When each entity expires
| Entity | Lifetime | Why |
|---|---|---|
| Event | **until 30 days after the event ends** | Discovery data is useful around the show; afterwards it's noise |
| Clip | **max (~182.5 days)**, extendable by its owner | The licensing window; the creator can extend their own clip |
| Attention report, shares, receipts | **max (~182.5 days)** | The sponsor's audit window for a campaign |

Lifetimes are computed from the real dates (`ExpirationTime.atDate(event end + 30 days, { atLeast: 1 day })`), and anything past Arkiv's maximum is capped at `ExpirationTime.max()`.

## How it runs
- `ArkivWorker` runs every 30 s. Each step batches up to 20 operations per transaction (`executeBatch`) and stores the returned entity keys, so nothing is written twice.
- Steps: events → clips → handovers → takedowns → reports + shares → payout receipts.
- Reads: `GET /v1/reward-pools/:id/arkiv` queries Arkiv live. `pnpm --filter @muso/backend arkiv:query [poolId]` does the same from a terminal, with no MUSO server or key needed.

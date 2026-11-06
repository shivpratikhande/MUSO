# MUSO on Arkiv — schema

Network: **Rabdi testnet** (chain 7794095) · SDK `@arkiv-network/sdk` 1.0.1 · Writer wallet (every entity's `$creator`):
**`0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB`** ([explorer](https://rabdi.explorer.arkiv.network/address/0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB)).

All schemas are named `muso.*` (Arkiv is shared and public). **Every read filters on `$creator = MUSO's writer`**, because anyone can write an entity with our tag. Only the columns we filter on are indexed.

Code: [`apps/backend/src/modules/arkiv/arkiv.schemas.ts`](../apps/backend/src/modules/arkiv/arkiv.schemas.ts) (schemas), [`arkiv.service.ts`](../apps/backend/src/modules/arkiv/arkiv.service.ts) (writes and reads).

| Schema | One entity per | Owner | Flags | Expires | Indexed (filtered on) |
|---|---|---|---|---|---|
| `muso.events` | approved event | MUSO | — | 30 days after the event ends | `eventId`, `city`, `country`, `startsAt`, `endsAt` |
| `muso.clips` | clip posted to an event | **the creator's wallet** once they link one (MUSO until then) | `readonly` | max (~182.5 days) | `postId`, `event`, `kind`, `license`, `postedAt` |
| `muso.attention-reports` | sponsored pool, written once when it ends | MUSO | `readonly` | max (~182.5 days) | `poolId`, `event`, `eventId` |
| `muso.attention-shares` | clip in a report | MUSO | `readonly` | max | `report`, `poolId`, `postId` |
| `muso.payout-receipts` | creator paid in USDC on Arc | MUSO | `readonly` | max | `poolId`, `report`, `creator` |

## Columns

**`muso.events`**: `eventId` str · `title` str · `city` str (lower case) · `country` str (ISO-2, lower case) · `startsAt` u64 (unix s) · `endsAt` u64 · `artists` str? (headliner first)

**`muso.clips`**: `postId` str · `event` key → `muso.events` · `kind` str (`photo`/`video`) · `license` str (`free`/`paid`) · `priceMinor` i32 · `currency` str · `creatorName` str · `postedAt` u64. No media or personal data: only the clip's public facts.

**`muso.attention-reports`**: `poolId` str · `event` key? · `eventId` str · `title` str · `sponsor` str · `currency` str (`USD` for Arc pools, `INR` otherwise) · `budget` dec · `paid` dec · `verifiedViewers` i32 (distinct viewers whose time counted; World ID–verified only in human-only pools) · `watchSeconds` u64 · `clips` i32 (clips paid) · `humanOnly` bool · `arcCampaign` i32? · `arcContract` addr? · `windowStart`/`windowEnd` u64

**`muso.attention-shares`**: `report` key → report · `poolId` str · `postId` str · `clip` key? → `muso.clips` · `rank` i32 · `watchSeconds` u64 · `viewers` i32 · `share` dec · `capped` bool

**`muso.payout-receipts`**: `poolId` str · `report` key? · `creator` addr · `amount` dec (USDC) · `arcCampaign` i32 · `claimTx` str (Arc tx hash) · `arcChainId` i32

## The relationships
```
muso.events ◀─event─ muso.clips ◀─clip─ muso.attention-shares ─report─▶ muso.attention-reports ◀─report─ muso.payout-receipts ──claimTx──▶ Arc (USDC)
```

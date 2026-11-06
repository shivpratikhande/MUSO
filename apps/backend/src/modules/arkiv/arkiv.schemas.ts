import { addr, bool, dec, defineSchema, i32, key, str, u64 } from '@arkiv-network/sdk/schema';

/**
 * MUSO's public data on Arkiv. Every schema is named `muso.*` (Arkiv is a shared public
 * database) and every read filters on MUSO's writer wallet as `$creator`, so nobody can
 * inject entities into what the app shows. Only columns that are filtered on are indexed.
 */

/** An approved live event. Owner: MUSO. Expires 30 days after the event ends. */
export const ArkivEvents = defineSchema('muso.events', {
  eventId: str().indexed(),
  title: str(),
  city: str().indexed(),
  country: str().indexed(),
  startsAt: u64().indexed(),
  endsAt: u64().indexed(),
  artists: str().optional(),
});

/** A clip posted to an event. Read-only; handed to the creator's wallet once they link one. */
export const ArkivClips = defineSchema('muso.clips', {
  postId: str().indexed(),
  event: key().indexed(),
  kind: str().indexed(), // photo | video
  license: str().indexed(), // free | paid
  priceMinor: i32(),
  currency: str(),
  creatorName: str(),
  postedAt: u64().indexed(),
});

/** A sponsored pool's final attention report. Read-only (MUSO can't change it after). */
export const ArkivReports = defineSchema('muso.attention-reports', {
  poolId: str().indexed(),
  event: key().indexed().optional(),
  eventId: str().indexed(),
  title: str(),
  sponsor: str(),
  currency: str(),
  budget: dec(),
  paid: dec(),
  verifiedViewers: i32(),
  watchSeconds: u64(),
  clips: i32(),
  humanOnly: bool(),
  arcCampaign: i32().optional(),
  arcContract: addr().optional(),
  windowStart: u64(),
  windowEnd: u64(),
});

/** One clip's line in a report: verified watch time, viewers, share. Read-only. */
export const ArkivShares = defineSchema('muso.attention-shares', {
  report: key().indexed(),
  poolId: str().indexed(),
  postId: str().indexed(),
  clip: key().optional(),
  rank: i32(),
  watchSeconds: u64(),
  viewers: i32(),
  share: dec(),
  capped: bool(),
});

/** A creator paid on Arc for a pool: links the report to the USDC transaction. Read-only. */
export const ArkivReceipts = defineSchema('muso.payout-receipts', {
  poolId: str().indexed(),
  report: key().indexed().optional(),
  creator: addr().indexed(),
  amount: dec(),
  arcCampaign: i32(),
  claimTx: str(),
  arcChainId: i32(),
});

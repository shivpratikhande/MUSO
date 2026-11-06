/** A sponsored pool's attention report as read back from Arkiv (MUSO's public proof layer). */
export interface ArkivProofDto {
  /** Arkiv publishing is configured on this server. */
  enabled: boolean;
  /** MUSO's writer wallet: every entity's `$creator`; reads filter on it. */
  writer: string | null;
  writerUrl: string | null;
  /** The exact query text anyone can run against Arkiv. */
  query: string | null;
  report: {
    key: string;
    url: string;
    expiresAtBlock: string;
    currency: string;
    budget: string;
    paid: string;
    verifiedViewers: number;
    watchSeconds: number;
    clips: number;
    humanOnly: boolean;
    arcCampaign: number | null;
  } | null;
  shares: {
    key: string;
    url: string;
    postId: string;
    rank: number;
    watchSeconds: number;
    viewers: number;
    share: string;
  }[];
  receipts: { key: string; url: string; creator: string; amount: string; claimTxUrl: string }[];
}

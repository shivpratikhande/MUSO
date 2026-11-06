import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { key } from '@arkiv-network/sdk/schema';
import { http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArkivReceipts, ArkivReports, ArkivShares } from './arkiv.schemas.js';

/** Injection token for the Arkiv gateway (an in-memory fake in tests). */
export const ARKIV_GATEWAY = Symbol('ARKIV_GATEWAY');

type AnySchema =
  | typeof import('./arkiv.schemas.js').ArkivEvents
  | typeof import('./arkiv.schemas.js').ArkivClips
  | typeof ArkivReports
  | typeof ArkivShares
  | typeof ArkivReceipts;

/** How long an entity lives: the longest lifetime Arkiv allows, or until a date. */
export type Lifetime = { kind: 'max' } | { kind: 'until'; date: Date };

export interface ArkivCreate {
  schema: AnySchema;
  values: Record<string, unknown>;
  lifetime: Lifetime;
  /** Attributes can never change afterwards (they can still be extended, handed over, deleted). */
  readonly?: boolean;
}

export interface ArkivBatch {
  creates?: ArkivCreate[];
  ownershipChanges?: { entityKey: Hex; newOwner: Address }[];
  deletes?: { entityKey: Hex }[];
}

/** A row read back from Arkiv, with plain JSON values. */
export type ArkivRow = Record<string, string | number | boolean | null> & {
  $key: string;
  $owner: string;
  $expiresAt: string;
};

export interface ArkivGateway {
  readonly writer: Address;
  readonly explorerUrl: string;
  readonly chainId: number;
  /** One transaction: every operation applies or none does. */
  execute(batch: ArkivBatch): Promise<{ txHash: Hex; createdEntities: Hex[] }>;
  /** Reads (always filtered on MUSO's writer as `$creator`). */
  reportsForPool(poolId: string): Promise<ArkivRow[]>;
  sharesForReport(reportKey: string): Promise<ArkivRow[]>;
  receiptsForPool(poolId: string): Promise<ArkivRow[]>;
  /** The query text a judge or sponsor can run themselves. */
  describeReportQuery(poolId: string): string;
}

const MAX_DAYS = 182;

function toExpiration(l: Lifetime) {
  if (l.kind === 'max') return ExpirationTime.max();
  const days = (l.date.getTime() - Date.now()) / 86_400_000;
  if (days >= MAX_DAYS) return ExpirationTime.max();
  return ExpirationTime.atDate(l.date, { atLeast: ExpirationTime.fromDays(1) });
}

/** Typed Arkiv values (`.value`) → plain JSON. */
function plain(row: Record<string, unknown>): ArkivRow {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(row)) {
    const raw = v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
    out[k] =
      raw === undefined || raw === null
        ? null
        : typeof raw === 'bigint'
          ? raw.toString()
          : (raw as string | number | boolean);
  }
  return out as ArkivRow;
}

export class SdkArkivGateway implements ArkivGateway {
  readonly writer: Address;
  readonly explorerUrl: string;
  readonly chainId: number;
  private readonly pub;
  private readonly wallet;

  constructor(opts: { privateKey: Hex; accessKey: string; explorerUrl: string }) {
    const chain = rabdi({ accessKey: opts.accessKey });
    const account = privateKeyToAccount(opts.privateKey);
    this.writer = account.address;
    this.chainId = chain.id;
    this.explorerUrl = opts.explorerUrl.replace(/\/$/, '');
    this.pub = createPublicClient({ chain, transport: http() });
    this.wallet = createWalletClient({ chain, transport: http(), account });
  }

  async execute(batch: ArkivBatch) {
    const res = await this.wallet.executeBatch({
      creates: batch.creates?.map((c) => ({
        schema: c.schema,
        values: c.values,
        expiration: toExpiration(c.lifetime),
        ...(c.readonly ? { flags: { readonly: true } } : {}),
      })),
      ownershipChanges: batch.ownershipChanges,
      deletes: batch.deletes,
    } as Parameters<typeof this.wallet.executeBatch>[0]);
    return {
      txHash: res.txHash as Hex,
      createdEntities: (res.createdEntities ?? []) as Hex[],
    };
  }

  private reportQuery(poolId: string) {
    return this.pub
      .select({
        $key: true,
        $owner: true,
        $expiresAt: true,
        poolId: true,
        event: true,
        eventId: true,
        title: true,
        sponsor: true,
        currency: true,
        budget: true,
        paid: true,
        verifiedViewers: true,
        watchSeconds: true,
        clips: true,
        humanOnly: true,
        arcCampaign: true,
        arcContract: true,
        windowStart: true,
        windowEnd: true,
      })
      .from(ArkivReports)
      .createdBy(this.writer)
      .where(eq('poolId', poolId));
  }

  async reportsForPool(poolId: string) {
    const { entities } = await this.reportQuery(poolId).fetch();
    return entities.map((e) => plain(e as Record<string, unknown>));
  }

  async sharesForReport(reportKey: string) {
    const { entities } = await this.pub
      .select({
        $key: true,
        $owner: true,
        $expiresAt: true,
        postId: true,
        clip: true,
        rank: true,
        watchSeconds: true,
        viewers: true,
        share: true,
        capped: true,
      })
      .from(ArkivShares)
      .createdBy(this.writer)
      .where(eq('report', key(reportKey as Hex)))
      .limit(100)
      .fetch();
    return entities.map((e) => plain(e as Record<string, unknown>));
  }

  async receiptsForPool(poolId: string) {
    const { entities } = await this.pub
      .select({
        $key: true,
        $owner: true,
        $expiresAt: true,
        creator: true,
        amount: true,
        arcCampaign: true,
        claimTx: true,
        arcChainId: true,
      })
      .from(ArkivReceipts)
      .createdBy(this.writer)
      .where(eq('poolId', poolId))
      .limit(100)
      .fetch();
    return entities.map((e) => plain(e as Record<string, unknown>));
  }

  describeReportQuery(poolId: string) {
    return this.reportQuery(poolId).toString();
  }
}

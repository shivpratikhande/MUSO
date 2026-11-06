/**
 * Read MUSO's public record straight from Arkiv (no MUSO server, no private key):
 *   pnpm --filter @muso/backend arkiv:query            → latest attention reports
 *   pnpm --filter @muso/backend arkiv:query <poolId>   → one pool's report, shares and payout receipts
 * Set ARKIV_ACCESS_KEY for a higher rate limit (the public RPC works without it, slowly).
 */
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { desc, eq } from '@arkiv-network/sdk/query';
import { key } from '@arkiv-network/sdk/schema';
import { config } from 'dotenv';
import { http, type Hex } from 'viem';
import { ArkivReceipts, ArkivReports, ArkivShares } from '../src/modules/arkiv/arkiv.schemas.js';

config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
/** MUSO's writer wallet: only entities it created are trusted. */
const WRITER = (process.env['ARKIV_WRITER_ADDRESS'] ??
  '0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB') as Hex;
const EXPLORER = 'https://rabdi.explorer.arkiv.network';
const pub = createPublicClient({
  chain: rabdi({ accessKey: process.env['ARKIV_ACCESS_KEY'] ?? '' }),
  transport: http(),
});
const v = (x: unknown) =>
  x && typeof x === 'object' && 'value' in x
    ? String((x as { value: unknown }).value)
    : String(x ?? '');

async function main() {
  const poolId = process.argv[2];
  const reports = pub
    .select({
      $key: true,
      $expiresAt: true,
      poolId: true,
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
    })
    .from(ArkivReports)
    .createdBy(WRITER);
  const q = poolId
    ? reports.where(eq('poolId', poolId))
    : reports.orderBy(desc('$expiresAt')).limit(10);
  console.log(`Query sent to Arkiv:\n  ${q.toString()}\n`);
  const { entities } = await q.fetch();
  if (!entities.length) return console.log('No attention reports yet.');
  for (const r of entities) {
    console.log(`${v(r.title)}  (sponsor: ${v(r.sponsor)})`);
    console.log(
      `  pool ${v(r.poolId)} · ${v(r.verifiedViewers)} ${v(r.humanOnly) === 'true' ? 'verified humans' : 'viewers'} · ${v(r.watchSeconds)} s watched · ${v(r.clips)} clips paid · ${v(r.paid)}/${v(r.budget)} ${v(r.currency)}${r.arcCampaign ? ` · Arc campaign #${v(r.arcCampaign)}` : ''}`,
    );
    console.log(`  ${EXPLORER}/entity/${r.$key}  (expires at block ${v(r.$expiresAt)})`);
    if (!poolId) continue;
    const shares = await pub
      .select({
        $key: true,
        rank: true,
        postId: true,
        watchSeconds: true,
        viewers: true,
        share: true,
      })
      .from(ArkivShares)
      .createdBy(WRITER)
      .where(eq('report', key(r.$key as Hex)))
      .fetch();
    for (const s of [...shares.entities].sort((a, b) => Number(v(a.rank)) - Number(v(b.rank))))
      console.log(
        `    #${v(s.rank)} clip ${v(s.postId)}: ${v(s.watchSeconds)} s from ${v(s.viewers)} viewers → ${v(s.share)}`,
      );
    const receipts = await pub
      .select({ $key: true, creator: true, amount: true, claimTx: true })
      .from(ArkivReceipts)
      .createdBy(WRITER)
      .where(eq('poolId', poolId))
      .fetch();
    for (const p of receipts.entities)
      console.log(`    paid ${v(p.amount)} USDC to ${v(p.creator)} · Arc tx ${v(p.claimTx)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

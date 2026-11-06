/**
 * MUSO buyer agent.
 *
 *  1. Discovers MUSO via /.well-known/x402 and reads the paid-content catalogue.
 *  2. Applies its own spending policy (budget, per-item cap, per-creator limit, allowlist, query).
 *  3. Calls the x402-protected endpoint; on `402 Payment Required` the x402 client signs a
 *     Hedera USDC transfer and retries automatically — no human approval.
 *  4. Downloads the content and logs each settled Hedera transaction with a HashScan link.
 */
import { config } from 'dotenv';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrivateKey } from '@hiero-ledger/sdk';
import { x402Client } from '@x402/core/client';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { wrapFetchWithPayment } from '@x402/fetch';
import { createClientHederaSigner } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import {
  decide,
  record,
  usdToCents,
  type CatalogItem,
  type Policy,
  type SpendState,
} from './policy.js';

config({ path: new URL('../.env', import.meta.url).pathname });

const env = (k: string, fallback?: string) => {
  const v = process.env[k]?.trim() || fallback;
  if (v === undefined) throw new Error(`Missing ${k} (see apps/agent/.env.example)`);
  return v;
};

const api = env('MUSO_API_URL', 'http://localhost:4000').replace(/\/+$/, '');
const network = env('HEDERA_NETWORK', 'hedera:testnet');
const policy: Policy = {
  budgetCents: usdToCents(env('AGENT_BUDGET_USD', '2.00')),
  maxPerItemCents: usdToCents(env('AGENT_MAX_PER_ITEM_USD', '0.75')),
  maxPerCreatorCents: usdToCents(env('AGENT_MAX_PER_CREATOR_USD', '1.00')),
  allowlist: env('AGENT_ALLOWLIST', '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  query: process.env['AGENT_QUERY']?.trim() || null,
  maxItems: Number(env('AGENT_MAX_ITEMS', '3')),
  network,
};

const outDir = new URL('../downloads/', import.meta.url).pathname;
const logFile = new URL('../spend-log.jsonl', import.meta.url).pathname;

function log(msg: string) {
  console.log(`[agent] ${msg}`);
}

/** AGENT_DRY_RUN=true: discover + decide only, never pay (useful before a funded account exists). */
const dryRun = process.env['AGENT_DRY_RUN'] === 'true';

async function main() {
  let paidFetch: typeof fetch = fetch;
  if (!dryRun) {
    const accountId = env('HEDERA_ACCOUNT_ID');
    const key = PrivateKey.fromString(env('HEDERA_PRIVATE_KEY'));
    const signer = createClientHederaSigner(accountId, key, { network });
    const client = x402Client.fromConfig({
      schemes: [{ network: 'hedera:*', client: new ExactHederaScheme(signer) }],
      // Second, protocol-level guard on top of our policy: never sign above the per-item cap.
      spendControls: { maxAmountPerPayment: `$${(policy.maxPerItemCents / 100).toFixed(2)}` },
    });
    paidFetch = wrapFetchWithPayment(fetch, client);
    log(`paying from ${accountId} on ${network}`);
  } else {
    log('DRY RUN — will decide but not pay');
  }
  log(
    `policy: budget $${(policy.budgetCents / 100).toFixed(2)}, ≤ $${(policy.maxPerItemCents / 100).toFixed(2)}/item, ≤ $${(policy.maxPerCreatorCents / 100).toFixed(2)}/creator, max ${policy.maxItems} items${policy.query ? `, query "${policy.query}"` : ''}${policy.allowlist.length ? `, allowlist ${policy.allowlist.join(',')}` : ''}`,
  );

  // 1. Discovery
  const wk = (await (await fetch(`${api}/.well-known/x402`)).json()) as {
    catalog: string;
    network: string;
  };
  log(`discovered MUSO x402 service → ${wk.catalog}`);
  const { items } = (await (await fetch(wk.catalog)).json()) as { items: CatalogItem[] };
  log(`catalogue: ${items.length} paid items`);

  // 2–4. Decide, pay, download
  const state: SpendState = { spentCents: 0, perCreatorCents: {}, bought: new Set() };
  mkdirSync(outDir, { recursive: true });
  for (const item of items) {
    const d = decide(item, policy, state);
    if (!d.buy) {
      log(`skip  ${item.id.slice(0, 8)} ${item.price.usd} — ${d.reason}`);
      continue;
    }
    log(
      `buy   ${item.id.slice(0, 8)} "${item.title.slice(0, 50)}" by ${item.creator.displayName ?? item.creator.username} for ${item.price.usd} USDC`,
    );
    if (dryRun) {
      const probe = await fetch(item.endpoint);
      log(
        `      (dry run) endpoint answered HTTP ${probe.status}${probe.status === 402 ? ' Payment Required ✓' : ''}`,
      );
      record(state, item, d.cents);
      continue;
    }
    const res = await paidFetch(item.endpoint);
    if (res.status !== 200) {
      log(`      payment not accepted (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const body = (await res.json()) as {
      mediaUrl: string | null;
      downloadUrl: string | null;
      type: string;
      settlement: { transaction: string; hashscan: string; payer: string | null };
    };
    const header = res.headers.get('PAYMENT-RESPONSE');
    const settlement = header ? decodePaymentResponseHeader(header) : null;
    record(state, item, d.cents);
    log(`      ✅ settled on Hedera: ${body.settlement.transaction}`);
    log(`      🔎 ${body.settlement.hashscan}`);

    const url = body.downloadUrl ?? body.mediaUrl;
    if (url) {
      const file = join(
        outDir,
        `${item.id}.${item.type === 'VIDEO' ? 'mp4' : body.downloadUrl ? 'jpg' : 'webp'}`,
      );
      writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      log(`      📥 saved ${file}`);
    }
    appendFileSync(
      logFile,
      JSON.stringify({
        at: new Date().toISOString(),
        postId: item.id,
        creator: item.creator.id,
        usd: item.price.usd,
        transaction: body.settlement.transaction,
        hashscan: body.settlement.hashscan,
        verified: settlement?.success ?? null,
      }) + '\n',
    );
  }
  log(
    `done: bought ${state.bought.size}, spent $${(state.spentCents / 100).toFixed(2)} of $${(policy.budgetCents / 100).toFixed(2)}`,
  );
}

main().catch((err) => {
  console.error(`[agent] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

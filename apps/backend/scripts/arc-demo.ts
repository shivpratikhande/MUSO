/**
 * Live Arc demo against a running MUSO API (pnpm dev:backend) and Arc Testnet:
 *   1. creates a demo organizer, two creators, two viewers, an approved event and a reward pool
 *   2. funds the pool on Arc: the sponsor wallet (ARC_DEMO_SPONSOR_PRIVATE_KEY) proves ownership,
 *      approves USDC and calls createCampaign with MUSO as allocator; MUSO verifies it on-chain
 *      (or, with --fund-link, prints MUSO's wallet page link and waits for you to fund there)
 *   3. viewers watch the creators' videos (real, server-timed heartbeats)
 *   4. when the pool ends the API's workers split it by watch time, call awardMany and relay
 *      claimFor; the creator without a wallet links one afterwards and is paid too
 *
 * Usage: pnpm --filter @muso/backend arc:demo [--fund-link]
 * Needs ARC_ENABLED=true and a funded ARC_ALLOCATOR_PRIVATE_KEY (gas) in the root .env.
 */
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEventLogs,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { PrismaClient, createPgAdapter } from '@muso/database';

config({ path: new URL('../../../.env', import.meta.url).pathname });
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} in the root .env`);
  return v;
};
const API = `http://localhost:${process.env['PORT'] ?? 4000}/v1`;
const FUND_LINK = process.argv.includes('--fund-link');
const BUDGET = 2_000_000n; // 2 USDC
const prisma = new PrismaClient({ adapter: createPgAdapter(env('DATABASE_URL')) });
const chain = defineChain({
  id: Number(env('ARC_CHAIN_ID')),
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [env('ARC_RPC_URL')] } },
});
const pub = createPublicClient({ chain, transport: http() });
const CONTRACT = env('ARC_REWARD_CAMPAIGNS_ADDRESS') as Hex;
const USDC = (process.env['ARC_USDC_ADDRESS'] ??
  '0x3600000000000000000000000000000000000000') as Hex;
const EXPLORER = process.env['ARC_EXPLORER_URL'] ?? 'https://testnet.arcscan.app';
const ALLOCATOR = privateKeyToAccount(env('ARC_ALLOCATOR_PRIVATE_KEY') as Hex).address;
const ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function createCampaign(string title, uint256 budget, uint256 maxPerRecipient, address allocator, uint64 endsAt) returns (uint256)',
  'event CampaignCreated(uint256 indexed id, address indexed sponsor, string title, uint256 budget, uint256 maxPerRecipient, address indexed allocator, uint64 endsAt, uint64 awardWindowEnd)',
]);

const log = (s: string) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error?.message ?? ''}`);
  return json.data as T;
}

interface Person {
  id: string;
  token: string;
  name: string;
}
const run = Date.now().toString(36);
async function person(name: string, organizer = false): Promise<Person> {
  const email = `arcdemo-${run}-${name.toLowerCase()}@demo.muso.dev`;
  const r = await api<{ user: { id: string }; tokens: { accessToken: string } }>(
    'POST',
    '/auth/sign-up',
    undefined,
    { email, password: 'arc-demo-password-1', displayName: name },
  );
  await prisma.user.update({ where: { id: r.user.id }, data: { emailVerifiedAt: new Date() } });
  if (organizer) {
    await prisma.userRole.create({ data: { userId: r.user.id, role: 'ORGANIZER' } });
    await prisma.organizerProfile.create({
      data: { userId: r.user.id, organizationName: 'Night Owl Presents', contactEmail: email },
    });
  }
  return { id: r.user.id, token: r.tokens.accessToken, name };
}

async function linkWallet(p: Person, acct: PrivateKeyAccount) {
  const ch = await api<{ message: string; issuedAt: string }>(
    'GET',
    `/me/wallet/challenge?address=${acct.address}`,
    p.token,
  );
  const signature = await acct.signMessage({ message: ch.message });
  await api('PUT', '/me/wallet', p.token, {
    address: acct.address,
    issuedAt: ch.issuedAt,
    signature,
  });
  log(`${p.name} linked wallet ${acct.address} (signature verified by MUSO)`);
}

async function video(author: Person, eventId: string) {
  const id = randomUUID();
  await prisma.post.create({
    data: {
      id,
      authorId: author.id,
      eventId,
      type: 'VIDEO',
      status: 'PUBLISHED',
      caption: `${author.name} live from the front row`,
      publishedAt: new Date(),
      rightsConfirmedAt: new Date(),
      clientRequestId: randomUUID(),
      media: {
        create: {
          type: 'VIDEO',
          originalKey: `originals/${author.id}/${id}.mp4`,
          mimeType: 'video/mp4',
          sizeBytes: 1,
          durationMs: 9_000,
          displayKey: `derived/${id}/display.mp4`,
          thumbKey: `derived/${id}/thumb.webp`,
        },
      },
    },
  });
  return id;
}

/** Real playback: a heartbeat every 3 seconds; the server credits elapsed on-screen time. */
async function watch(viewer: Person, postId: string, ms: number) {
  const s = await api<{ sessionId: string }>('POST', '/watch/sessions', viewer.token, {
    postId,
    deviceId: randomUUID(),
  });
  for (let pos = 3_000; pos <= ms; pos += 3_000) {
    await sleep(3_050);
    await api('POST', `/watch/sessions/${s.sessionId}/heartbeat`, viewer.token, {
      positionMs: pos,
      playing: true,
      foreground: true,
    });
  }
  await api('POST', `/watch/sessions/${s.sessionId}/end`, viewer.token);
}

interface PoolDetail {
  status: string;
  budgetMinor: number;
  currency: string;
  arc: { campaignId: number } | null;
  leaderboard: { creator: { id: string }; qualifiedSeconds: number; shareMinor: number }[];
  arcPayouts: {
    creatorId: string;
    amountMicro: string;
    status: string;
    claimTxUrl: string | null;
    awardTxUrl: string | null;
  }[];
}

async function fundWithScript(org: Person, poolId: string, endsAt: number) {
  const sponsor = privateKeyToAccount(env('ARC_DEMO_SPONSOR_PRIVATE_KEY') as Hex);
  const wallet = createWalletClient({ chain, account: sponsor, transport: http() });
  const bal = await pub.readContract({
    address: USDC,
    abi: ABI,
    functionName: 'balanceOf',
    args: [sponsor.address],
  });
  if (bal < BUDGET + 100_000n)
    throw new Error(
      `Sponsor ${sponsor.address} has ${Number(bal) / 1e6} USDC; get test USDC at https://faucet.circle.com (Arc Testnet)`,
    );
  await linkWallet(org, sponsor);
  const approve = await wallet.writeContract({
    address: USDC,
    abi: ABI,
    functionName: 'approve',
    args: [CONTRACT, BUDGET],
  });
  await pub.waitForTransactionReceipt({ hash: approve });
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'createCampaign',
    args: ['MUSO · Best live videos', BUDGET, BUDGET, ALLOCATOR, BigInt(endsAt)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const [ev] = parseEventLogs({ abi: ABI, logs: receipt.logs, eventName: 'CampaignCreated' });
  const id = Number(ev!.args.id);
  log(
    `Sponsor created campaign #${id} with ${Number(BUDGET) / 1e6} USDC in escrow: ${EXPLORER}/tx/${hash}`,
  );
  await api('POST', `/reward-pools/${poolId}/arc`, org.token, { campaignId: id });
  log(`MUSO verified campaign #${id} on-chain and marked the pool funded`);
}

async function main() {
  await api('GET', '/health');
  log(`MUSO API ${API} · contract ${CONTRACT} · allocator ${ALLOCATOR}`);

  const org = await person('Organizer', true);
  const alice = await person('Alice');
  const bob = await person('Bob');
  const viewers = [await person('Viewer1'), await person('Viewer2')];
  const now = Date.now();
  const event = await prisma.event.create({
    data: {
      organizerId: org.id,
      title: `Arc Night ${run}`,
      description: 'Live demo event for on-chain rewards',
      venueName: 'Arena',
      city: 'Mumbai',
      country: 'IN',
      startsAt: new Date(now - 3_600_000),
      endsAt: new Date(now + 2 * 3_600_000),
      reviewStatus: 'APPROVED',
    },
  });
  const poolEnd = new Date(now + (FUND_LINK ? 10 : 3) * 60_000);
  const pool = await api<{ id: string }>('POST', '/reward-pools', org.token, {
    eventId: event.id,
    title: 'Best live videos',
    sponsorName: 'Night Owl Presents',
    budgetMinor: 16_800,
    perVideoCapBps: 10_000,
    minQualifiedViewers: 2,
    endsAt: poolEnd.toISOString(),
  });
  log(`Pool ${pool.id} created for "${event.title}", ends ${poolEnd.toLocaleTimeString()}`);

  const aliceWallet = privateKeyToAccount(generatePrivateKey());
  const bobWallet = privateKeyToAccount(generatePrivateKey());
  await linkWallet(alice, aliceWallet);

  const endsAt = Math.floor(poolEnd.getTime() / 1000);
  if (FUND_LINK) {
    const { url } = await api<{ url: string }>(
      'POST',
      `/reward-pools/${pool.id}/arc/fund-link`,
      org.token,
      {
        returnUrl: 'muso://wallet/return',
      },
    );
    console.log(
      `\nOpen this link with a wallet that has Arc testnet USDC and fund the pool:\n${url}\n`,
    );
    for (;;) {
      const p = await api<PoolDetail>('GET', `/reward-pools/${pool.id}`, org.token);
      if (p.arc) {
        log(`Pool funded by campaign #${p.arc.campaignId} ($${p.budgetMinor / 100})`);
        break;
      }
      await sleep(3_000);
    }
  } else {
    await fundWithScript(org, pool.id, endsAt);
  }

  const a1 = await video(alice, event.id);
  const a2 = await video(alice, event.id);
  const b1 = await video(bob, event.id);
  log('Viewers are watching (real heartbeats, about 30 seconds)…');
  await Promise.all(
    viewers.map(async (v) => {
      await watch(v, a1, 9_000);
      await watch(v, a2, 3_000);
      await watch(v, b1, 6_000);
    }),
  );
  const live = await api<PoolDetail>('GET', `/reward-pools/${pool.id}`, org.token);
  for (const r of live.leaderboard)
    log(
      `  live estimate: ${r.creator.id === alice.id ? 'Alice' : 'Bob'} ${r.qualifiedSeconds}s → $${r.shareMinor / 100}`,
    );

  log(`Waiting for the pool to end and MUSO's workers to pay out on Arc…`);
  const names = new Map([
    [alice.id, 'Alice'],
    [bob.id, 'Bob'],
  ]);
  let bobLinked = false;
  for (;;) {
    const p = await api<PoolDetail>('GET', `/reward-pools/${pool.id}`, org.token);
    const alicePaid = p.arcPayouts.find((o) => o.creatorId === alice.id)?.status === 'CLAIMED';
    if (alicePaid && !bobLinked) {
      log('Alice was paid. Bob links his wallet only now (late) and should still be paid:');
      await linkWallet(bob, bobWallet);
      bobLinked = true;
    }
    if (p.arcPayouts.length && p.arcPayouts.every((o) => o.status === 'CLAIMED')) {
      console.log('');
      for (const o of p.arcPayouts)
        log(
          `${names.get(o.creatorId)} received ${Number(o.amountMicro) / 1e6} USDC · ${o.claimTxUrl}`,
        );
      for (const [n, w] of [
        ['Alice', aliceWallet],
        ['Bob', bobWallet],
      ] as const) {
        const b = await pub.readContract({
          address: USDC,
          abi: ABI,
          functionName: 'balanceOf',
          args: [w.address],
        });
        log(`On-chain balance ${n} ${w.address}: ${Number(b) / 1e6} USDC (paid no gas)`);
      }
      break;
    }
    await sleep(5_000);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

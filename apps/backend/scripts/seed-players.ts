/**
 * Ten sign-in-able test accounts to play with (dev only, idempotent):
 * 3 organizers, 5 creators, 2 supporters, each with a generated crypto-art avatar, a full
 * profile, genres, follows and a linked wallet (so their `<username>.muso.eth` ENS name resolves).
 * Creators are marked as verified humans so they can earn from human-only pools right away.
 *
 * Usage: pnpm --filter @muso/backend seed:players
 * Needs Postgres + MinIO running (same .env as the API). Prints the login table at the end.
 */
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { hash } from '@node-rs/argon2';
import { config } from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PrismaClient, createPgAdapter, type Role } from '@muso/database';

config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is missing from .env`);
  return v;
};
if (process.env['NODE_ENV'] === 'production') throw new Error('Not available in production.');

export const PLAYER_DOMAIN = '@play.muso';
export const PLAYER_PASSWORD = 'MusoPlay2026!';

type Kind = 'ORGANIZER' | 'CREATOR' | 'SUPPORTER';
type Style = 'pixel' | 'crystal' | 'coin';

interface Player {
  username: string;
  name: string;
  kind: Kind;
  style: Style;
  bio: string;
  city: string;
  genres: string[];
  links: { label: string; url: string }[];
  org?: { name: string; website: string; phone: string };
  focus?: ('PHOTOGRAPHY' | 'VIDEOGRAPHY')[];
}

const PLAYERS: Player[] = [
  {
    username: 'blockparty.mum',
    name: 'Neha Kapoor',
    kind: 'ORGANIZER',
    style: 'coin',
    bio: 'Founder, Block Party Mumbai. Rooftop gigs for builders, artists and degens.',
    city: 'Mumbai',
    genres: ['electronic', 'house'],
    links: [{ label: 'X', url: 'https://x.com/blockpartymum' }],
    org: {
      name: 'Block Party Mumbai',
      website: 'https://blockparty.example',
      phone: '+91 98200 11001',
    },
  },
  {
    username: 'chainreaction',
    name: 'Arjun Mehta',
    kind: 'ORGANIZER',
    style: 'crystal',
    bio: 'Chain Reaction Fest: three stages, one wallet, zero paper tickets.',
    city: 'Bengaluru',
    genres: ['techno', 'hip-hop'],
    links: [
      { label: 'Site', url: 'https://chainreaction.example' },
      { label: 'Instagram', url: 'https://instagram.com/chainreactionfest' },
    ],
    org: {
      name: 'Chain Reaction Fest',
      website: 'https://chainreaction.example',
      phone: '+91 98450 22002',
    },
  },
  {
    username: 'gwei.nights',
    name: 'Zoya Sheikh',
    kind: 'ORGANIZER',
    style: 'pixel',
    bio: 'Gwei Nights: low fees, loud bass. Monthly club nights for the onchain crowd.',
    city: 'Goa',
    genres: ['techno', 'electronic'],
    links: [{ label: 'X', url: 'https://x.com/gweinights' }],
    org: { name: 'Gwei Nights', website: 'https://gweinights.example', phone: '+91 98220 33003' },
  },
  {
    username: 'pixel.rohan',
    name: 'Rohan Das',
    kind: 'CREATOR',
    style: 'pixel',
    bio: 'Shooting crowds in 8-bit colours. Every frame an edition of one.',
    city: 'Mumbai',
    genres: ['electronic', 'indie'],
    links: [
      { label: 'X', url: 'https://x.com/pixelrohan' },
      { label: 'Portfolio', url: 'https://pixelrohan.example' },
    ],
    focus: ['PHOTOGRAPHY'],
  },
  {
    username: 'aisha.frames',
    name: 'Aisha Khan',
    kind: 'CREATOR',
    style: 'crystal',
    bio: 'Concert videographer. Slow-mo drops, fast payouts.',
    city: 'Delhi',
    genres: ['hip-hop', 'r-and-b'],
    links: [{ label: 'Instagram', url: 'https://instagram.com/aisha.frames' }],
    focus: ['VIDEOGRAPHY'],
  },
  {
    username: 'kabir_onchain',
    name: 'Kabir Rao',
    kind: 'CREATOR',
    style: 'coin',
    bio: 'Photo + video from the front row. gm from the mosh pit.',
    city: 'Pune',
    genres: ['rock', 'metal'],
    links: [
      { label: 'X', url: 'https://x.com/kabir_onchain' },
      { label: 'GitHub', url: 'https://github.com/kabir-onchain' },
    ],
    focus: ['PHOTOGRAPHY', 'VIDEOGRAPHY'],
  },
  {
    username: 'meera.mints',
    name: 'Meera Iyer',
    kind: 'CREATOR',
    style: 'crystal',
    bio: 'Film photographer turned onchain collector. Jazz bars and golden hour.',
    city: 'Chennai',
    genres: ['jazz', 'soul'],
    links: [{ label: 'Portfolio', url: 'https://meeramints.example' }],
    focus: ['PHOTOGRAPHY'],
  },
  {
    username: 'devlens',
    name: 'Dev Patel',
    kind: 'CREATOR',
    style: 'pixel',
    bio: 'Drone and gimbal shots of festival nights. Ask me about my ND filters.',
    city: 'Ahmedabad',
    genres: ['house', 'pop'],
    links: [{ label: 'YouTube', url: 'https://youtube.com/devlens' }],
    focus: ['VIDEOGRAPHY'],
  },
  {
    username: 'tara.hodl',
    name: 'Tara Singh',
    kind: 'SUPPORTER',
    style: 'coin',
    bio: 'Tipping my favourite creators since block one.',
    city: 'Mumbai',
    genres: ['pop', 'indie'],
    links: [{ label: 'X', url: 'https://x.com/tarahodl' }],
  },
  {
    username: 'vik.degen',
    name: 'Vikram Joshi',
    kind: 'SUPPORTER',
    style: 'pixel',
    bio: 'Here for the bass and the alpha. Front row, always.',
    city: 'Hyderabad',
    genres: ['techno', 'hip-hop'],
    links: [{ label: 'Telegram', url: 'https://t.me/vikdegen' }],
  },
];

// ─────────── Avatar art (original, generated from the username) ───────────

/** Deterministic PRNG (mulberry32) seeded from the username. */
function rng(seed: string) {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#0f0c29', '#7f5af0', '#2cb67d', '#fffffe', '#ff8906'],
  ['#120458', '#ff00a0', '#00f0ff', '#fdf500', '#ffffff'],
  ['#1a1a2e', '#e94560', '#0f3460', '#f5f5f5', '#ffd166'],
  ['#05141c', '#00c2a8', '#f72585', '#e0fbfc', '#ffbe0b'],
  ['#140028', '#9d4edd', '#ff9e00', '#f8f9fa', '#00f5d4'],
  ['#001219', '#0a9396', '#ee9b00', '#e9d8a6', '#ae2012'],
];

/** Mirrored 12×12 pixel creature with eyes, on a two-tone gradient. */
function pixelArt(r: () => number, p: string[]): string {
  const n = 12;
  const cell = 512 / (n + 4);
  const off = cell * 2;
  let rects = '';
  for (let y = 1; y < n - 1; y++) {
    for (let x = 0; x < n / 2; x++) {
      const dist = Math.abs(x - n / 2 + 0.5) + Math.abs(y - n / 2) * 0.6;
      if (r() < 0.85 - dist * 0.09) {
        const c = r() < 0.75 ? p[1] : p[4];
        for (const xx of [x, n - 1 - x])
          rects += `<rect x="${off + xx * cell}" y="${off + y * cell}" width="${cell + 0.5}" height="${cell + 0.5}" fill="${c}"/>`;
      }
    }
  }
  const ey = off + 4 * cell;
  for (const ex of [off + 3 * cell, off + 7 * cell]) {
    rects += `<rect x="${ex}" y="${ey}" width="${cell * 2}" height="${cell * 2}" fill="${p[3]}"/>`;
    rects += `<rect x="${ex + cell}" y="${ey + cell}" width="${cell}" height="${cell}" fill="${p[0]}"/>`;
  }
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[2]}"/><stop offset="1" stop-color="${p[0]}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>${rects}`;
}

/** Faceted crystal with orbit rings and a holographic glow. */
function crystalArt(r: () => number, p: string[]): string {
  const rot = Math.floor(r() * 40) - 20;
  const rings = [0, 1, 2]
    .map(
      (i) =>
        `<ellipse cx="256" cy="256" rx="${190 - i * 18}" ry="${60 + i * 14}" fill="none" stroke="${i % 2 ? p[4] : p[2]}" stroke-width="3" opacity="0.55" transform="rotate(${rot + i * 35} 256 256)"/>`,
    )
    .join('');
  const sparkles = Array.from({ length: 14 }, () => {
    const x = 30 + r() * 452;
    const y = 30 + r() * 452;
    const s = 2 + r() * 4;
    return `<circle cx="${x}" cy="${y}" r="${s}" fill="${p[3]}" opacity="${0.4 + r() * 0.6}"/>`;
  }).join('');
  return `<defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/></radialGradient>
    <linearGradient id="f1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[3]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient>
    <linearGradient id="f2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[4]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>${sparkles}${rings}
  <polygon points="256,92 352,236 256,420" fill="url(#f2)"/>
  <polygon points="256,92 160,236 256,420" fill="url(#f1)"/>
  <polygon points="256,92 352,236 256,270 160,236" fill="${p[3]}" opacity="0.35"/>`;
}

/** Minted coin: hexagon lattice, rim and the creator's initials. */
function coinArt(r: () => number, p: string[], initials: string): string {
  let hex = '';
  for (let y = -1; y < 9; y++) {
    for (let x = -1; x < 9; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0);
      const cy = y * 56;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${cx + 30 * Math.cos(a)},${cy + 30 * Math.sin(a)}`;
      }).join(' ');
      hex += `<polygon points="${pts}" fill="${r() < 0.25 ? p[2] : 'none'}" stroke="${p[1]}" stroke-width="2" opacity="0.5"/>`;
    }
  }
  return `<defs><radialGradient id="c" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="${p[4]}"/><stop offset="1" stop-color="${p[1]}"/></radialGradient></defs>
  <rect width="512" height="512" fill="${p[0]}"/>${hex}
  <circle cx="256" cy="256" r="170" fill="url(#c)" stroke="${p[3]}" stroke-width="10"/>
  <circle cx="256" cy="256" r="140" fill="none" stroke="${p[3]}" stroke-width="3" stroke-dasharray="6 10"/>
  <text x="256" y="292" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="800" fill="${p[0]}">${initials}</text>`;
}

async function avatarPng(pl: Player): Promise<Buffer> {
  const r = rng(pl.username);
  const p = PALETTES[Math.floor(r() * PALETTES.length)]!;
  const initials = pl.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const body =
    pl.style === 'pixel'
      ? pixelArt(r, p)
      : pl.style === 'crystal'
        ? crystalArt(r, p)
        : coinArt(r, p, initials);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─────────── Seeding ───────────

const prisma = new PrismaClient({ adapter: createPgAdapter(env('DATABASE_URL')) });
const s3 = new S3Client({
  region: process.env['S3_REGION'] ?? 'us-east-1',
  forcePathStyle: (process.env['S3_FORCE_PATH_STYLE'] ?? 'true') === 'true',
  endpoint: process.env['S3_ENDPOINT'] ?? env('S3_PUBLIC_ENDPOINT'),
  credentials: {
    accessKeyId: env('S3_ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
  },
});
const BUCKET = process.env['S3_BUCKET_PUBLIC'] ?? 'muso-public';

/** Test wallet derived from the username (testnet play only; never send real funds to it). */
const walletFor = (username: string) =>
  privateKeyToAccount(keccak256(toHex(`muso-play-wallet:${username}`))).address;

async function replaceAvatar(userId: string, png: Buffer): Promise<string> {
  const prefix = `avatars/${userId}/`;
  const old = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  if (old.Contents?.length) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: old.Contents.map((o) => ({ Key: o.Key! })) },
      }),
    );
  }
  const key = `${prefix}${randomUUID()}.png`;
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: png, ContentType: 'image/png' }),
  );
  return key;
}

async function main() {
  const passwordHash = await hash(PLAYER_PASSWORD);
  const now = new Date();
  const genres = new Map(
    (await prisma.genre.findMany({ select: { id: true, slug: true } })).map((g) => [g.slug, g.id]),
  );
  if (genres.size === 0) throw new Error('No genres found. Run `pnpm db:seed` first.');

  const ids: Record<string, string> = {};
  for (const pl of PLAYERS) {
    const email = `${pl.username.replace(/[._]/g, '')}${PLAYER_DOMAIN}`;
    const wallet = walletFor(pl.username).toLowerCase();
    const roles: Role[] = [pl.kind];
    const profile = {
      displayName: pl.name,
      bio: pl.bio,
      city: pl.city,
      country: 'IN',
      links: pl.links,
      showLocation: true,
      passwordHash,
      emailVerifiedAt: now,
      onboardedAt: now,
      walletAddress: wallet,
      walletLinkedAt: now,
      humanVerifiedAt: pl.kind === 'CREATOR' ? now : null,
      deletedAt: null,
    };
    // Free the username/wallet if an unrelated account holds them (dev data only).
    await prisma.user.updateMany({
      where: { OR: [{ username: pl.username }, { walletAddress: wallet }], NOT: { email } },
      data: { username: null, walletAddress: null, walletLinkedAt: null },
    });
    const user = await prisma.user.upsert({
      where: { email },
      update: { username: pl.username, ...profile },
      create: { email, username: pl.username, ...profile },
    });
    ids[pl.username] = user.id;

    await prisma.userRole.deleteMany({ where: { userId: user.id, role: { notIn: roles } } });
    for (const role of roles) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        update: {},
        create: { userId: user.id, role },
      });
    }
    if (pl.org) {
      const org = {
        organizationName: pl.org.name,
        contactEmail: email,
        contactPhone: pl.org.phone,
        website: pl.org.website,
      };
      await prisma.organizerProfile.upsert({
        where: { userId: user.id },
        update: org,
        create: { userId: user.id, ...org },
      });
    }
    if (pl.focus) {
      const portfolioUrl = pl.links.find((l) => l.label === 'Portfolio')?.url ?? null;
      await prisma.creatorProfile.upsert({
        where: { userId: user.id },
        update: { focus: pl.focus, portfolioUrl },
        create: { userId: user.id, focus: pl.focus, portfolioUrl },
      });
    }
    await prisma.userInterest.deleteMany({ where: { userId: user.id } });
    await prisma.userInterest.createMany({
      data: pl.genres
        .filter((g) => genres.has(g))
        .map((g) => ({ userId: user.id, genreId: genres.get(g)! })),
    });

    const avatarKey = await replaceAvatar(user.id, await avatarPng(pl));
    await prisma.user.update({ where: { id: user.id }, data: { avatarKey } });
  }

  // Everyone follows the organizers and a few creators, so feeds and follower counts aren't empty.
  const creators = PLAYERS.filter((p) => p.kind === 'CREATOR').map((p) => p.username);
  const organizers = PLAYERS.filter((p) => p.kind === 'ORGANIZER').map((p) => p.username);
  const follows: { followerId: string; followeeId: string }[] = [];
  PLAYERS.forEach((pl, i) => {
    const targets = [
      ...organizers,
      creators[i % creators.length]!,
      creators[(i + 2) % creators.length]!,
    ];
    for (const t of new Set(targets)) {
      if (t !== pl.username) follows.push({ followerId: ids[pl.username]!, followeeId: ids[t]! });
    }
  });
  await prisma.follow.createMany({ data: follows, skipDuplicates: true });

  const parent = process.env['ENS_PARENT_NAME'] ?? 'muso.eth';
  console.log(
    `\nSeeded ${PLAYERS.length} players (${follows.length} follows). Password for all: ${PLAYER_PASSWORD}\n`,
  );
  console.table(
    PLAYERS.map((pl) => ({
      email: `${pl.username.replace(/[._]/g, '')}${PLAYER_DOMAIN}`,
      name: pl.name,
      role: pl.kind,
      username: pl.username,
      ens: `${pl.username.replace(/[._]/g, '-')}.${parent}`,
      ...(pl.org ? { org: pl.org.name } : {}),
    })),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Ten sign-in-able test accounts to play with (dev only, idempotent):
 * 3 organizers, 5 creators, 2 supporters, each with a generated crypto-art avatar, a full
 * profile, genres, follows and a linked wallet (so their `<username>.muso.eth` ENS name resolves).
 * Creators are marked as verified humans so they can earn from human-only pools right away.
 * Also 9 approved events for the organizers (live now, upcoming, finished) with generated
 * posters, schedules, demo-artist lineups, followers and draft reward pools to fund in the app.
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

// ─────────── Events (3 per organizer: live now, upcoming, finished) ───────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface SeedEvent {
  organizer: string;
  title: string;
  venue: string;
  address: string;
  city: string;
  /** Offsets from now. Negative start + positive end = live now. */
  start: number;
  end: number;
  policy: 'ALLOWED' | 'PHOTOS_ONLY';
  notes?: string;
  description: string;
  /** Demo artists from `pnpm db:seed` (matched by username). */
  lineup: string[];
  schedule: { title: string; stage?: string; at: number; len?: number; artist?: string }[];
  pool?: { title: string; sponsor: string; budgetInr: number; humanOnly: boolean; rules: string };
}

const EVENTS: SeedEvent[] = [
  {
    organizer: 'blockparty.mum',
    title: 'Block Party: Rooftop Genesis',
    venue: 'The Terrace',
    address: 'Kamala Mills, Lower Parel',
    city: 'Mumbai',
    start: -1 * HOUR,
    end: 5 * HOUR,
    policy: 'ALLOWED',
    description:
      'Our first rooftop of the season. Dream-pop at golden hour, bilingual bars after dark, and a skyline full of phone lights. Film it, post it, get paid.',
    lineup: ['nila.waves', 'kavya.k'],
    schedule: [
      { title: 'Doors + welcome drinks', at: 0, len: HOUR },
      { title: 'Nila Waves', stage: 'Roof Stage', at: HOUR, len: 1.5 * HOUR, artist: 'nila.waves' },
      { title: 'Kavya K', stage: 'Roof Stage', at: 3 * HOUR, len: 1.5 * HOUR, artist: 'kavya.k' },
    ],
    pool: {
      title: 'Best Rooftop Moments',
      sponsor: 'Ledger Lane Coffee',
      budgetInr: 5_000,
      humanOnly: false,
      rules: 'Post your best clips from tonight. The pool is split by real watch time.',
    },
  },
  {
    organizer: 'blockparty.mum',
    title: 'Gas Fees & Guitars',
    venue: 'Antisocial',
    address: 'Khar West',
    city: 'Mumbai',
    start: 5 * DAY,
    end: 5 * DAY + 4 * HOUR,
    policy: 'PHOTOS_ONLY',
    notes: 'Photos only, please: the band is recording a live album.',
    description: 'An unplugged night for builders who play. Acoustic sets, zero slide decks.',
    lineup: ['nila.waves'],
    schedule: [
      { title: 'Open mic for builders', at: 0, len: 1.5 * HOUR },
      { title: 'Nila Waves (acoustic)', at: 2 * HOUR, len: HOUR, artist: 'nila.waves' },
    ],
  },
  {
    organizer: 'blockparty.mum',
    title: 'Block Party: Monsoon Mint',
    venue: 'Bombay Canteen Courtyard',
    address: 'Kamala Mills, Lower Parel',
    city: 'Mumbai',
    start: -12 * DAY,
    end: -12 * DAY + 5 * HOUR,
    policy: 'ALLOWED',
    description: 'The rainy-season edition. Wet sneakers, warm synths, a sold-out courtyard.',
    lineup: ['kavya.k', 'nila.waves'],
    schedule: [
      { title: 'Kavya K', at: HOUR, len: HOUR, artist: 'kavya.k' },
      { title: 'Nila Waves', at: 2.5 * HOUR, len: 1.5 * HOUR, artist: 'nila.waves' },
    ],
  },
  {
    organizer: 'chainreaction',
    title: 'Hackers & Headliners Afterparty',
    venue: 'Bflat Bar',
    address: 'Indiranagar 100 Ft Road',
    city: 'Bengaluru',
    start: -2 * HOUR,
    end: 4 * HOUR,
    policy: 'ALLOWED',
    description:
      'The hackathon is over, the demos are in, and the brass band is warming up. Verified humans only for the reward pool.',
    lineup: ['the.brass.republic'],
    schedule: [
      { title: 'Demo-day toasts', at: 0, len: HOUR },
      {
        title: 'The Brass Republic',
        stage: 'Main Floor',
        at: 1.5 * HOUR,
        len: 2 * HOUR,
        artist: 'the.brass.republic',
      },
    ],
    pool: {
      title: 'Afterparty Highlight Reel',
      sponsor: 'Chain Reaction Fest',
      budgetInr: 8_000,
      humanOnly: true,
      rules: 'Only creators verified as unique humans earn. One person, one share.',
    },
  },
  {
    organizer: 'chainreaction',
    title: 'Chain Reaction Fest 2026: Day 1',
    venue: 'Palace Grounds',
    address: 'Jayamahal Road',
    city: 'Bengaluru',
    start: 2 * DAY,
    end: 2 * DAY + 10 * HOUR,
    policy: 'ALLOWED',
    description:
      'Three stages, one wallet, zero paper tickets. Day 1 brings brass, boom-bap and a sunset you will want to film.',
    lineup: ['the.brass.republic', 'kavya.k'],
    schedule: [
      { title: 'Gates open', at: 0, len: HOUR },
      {
        title: 'The Brass Republic',
        stage: 'Genesis Stage',
        at: 3 * HOUR,
        len: 1.5 * HOUR,
        artist: 'the.brass.republic',
      },
      { title: 'Kavya K', stage: 'Fork Stage', at: 6 * HOUR, len: HOUR, artist: 'kavya.k' },
    ],
    pool: {
      title: 'Fest Day 1 Highlights',
      sponsor: 'Hashbrown Labs',
      budgetInr: 10_000,
      humanOnly: true,
      rules: 'Best clips of Day 1, split by verified watch time. Max 25% per video.',
    },
  },
  {
    organizer: 'chainreaction',
    title: 'Chain Reaction Fest 2026: Day 2',
    venue: 'Palace Grounds',
    address: 'Jayamahal Road',
    city: 'Bengaluru',
    start: 3 * DAY,
    end: 3 * DAY + 10 * HOUR,
    policy: 'ALLOWED',
    description: 'Day 2 goes deep: house at noon, techno at night, fireworks at the finale.',
    lineup: ['saltwater.static', 'the.brass.republic'],
    schedule: [
      {
        title: 'Saltwater Static',
        stage: 'Genesis Stage',
        at: 7 * HOUR,
        len: 2 * HOUR,
        artist: 'saltwater.static',
      },
      { title: 'Finale + fireworks', stage: 'Genesis Stage', at: 9.5 * HOUR, len: 0.5 * HOUR },
    ],
  },
  {
    organizer: 'gwei.nights',
    title: 'Gwei Nights: Sunset Validator',
    venue: 'Thalassa Cliffside',
    address: 'Vagator',
    city: 'Goa',
    start: -2 * HOUR,
    end: 6 * HOUR,
    policy: 'ALLOWED',
    description:
      'Low fees, loud bass. A cliffside sunset set that runs deep into the night. Bring a power bank.',
    lineup: ['saltwater.static'],
    schedule: [
      { title: 'Sunset warm-up', at: 0, len: 2 * HOUR },
      {
        title: 'Saltwater Static',
        stage: 'Cliff Deck',
        at: 2.5 * HOUR,
        len: 3 * HOUR,
        artist: 'saltwater.static',
      },
    ],
    pool: {
      title: 'Sunset Clip Bounty',
      sponsor: 'Gwei Nights',
      budgetInr: 3_000,
      humanOnly: true,
      rules: 'Sunset and drop moments. Verified humans only.',
    },
  },
  {
    organizer: 'gwei.nights',
    title: 'Gwei Nights: Low Fee Rave',
    venue: 'Hilltop',
    address: 'Vagator',
    city: 'Goa',
    start: 7 * DAY,
    end: 7 * DAY + 8 * HOUR,
    policy: 'ALLOWED',
    description: 'Our monthly rave. Entry costs less than a swap on mainnet.',
    lineup: ['saltwater.static'],
    schedule: [
      {
        title: 'Saltwater Static (all night long)',
        at: HOUR,
        len: 6 * HOUR,
        artist: 'saltwater.static',
      },
    ],
  },
  {
    organizer: 'gwei.nights',
    title: 'Gwei Nights: Genesis Block',
    venue: 'Curlies Beach Shack',
    address: 'Anjuna',
    city: 'Goa',
    start: -20 * DAY,
    end: -20 * DAY + 6 * HOUR,
    policy: 'ALLOWED',
    description: 'Where it all started: one speaker, two hundred people, and a very long sunrise.',
    lineup: ['saltwater.static'],
    schedule: [{ title: 'Saltwater Static', at: HOUR, len: 4 * HOUR, artist: 'saltwater.static' }],
  },
];

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Splits a title into at most 3 lines of ~18 characters. */
function wrap(text: string, max = 18): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** 1200×675 event poster: neon block grid, glow orbs, title, venue and date. */
async function posterPng(e: SeedEvent, startsAt: Date): Promise<Buffer> {
  const r = rng(e.title);
  const p = PALETTES[Math.floor(r() * PALETTES.length)]!;
  let blocks = '';
  for (let y = 0; y < 675; y += 45) {
    for (let x = 0; x < 1200; x += 45) {
      const v = r();
      if (v < 0.12)
        blocks += `<rect x="${x + 4}" y="${y + 4}" width="37" height="37" rx="6" fill="${v < 0.05 ? p[4] : p[2]}" opacity="${0.25 + r() * 0.5}"/>`;
    }
  }
  const orbs = [0, 1, 2]
    .map(
      (i) =>
        `<circle cx="${700 + r() * 450}" cy="${80 + r() * 520}" r="${90 + r() * 120}" fill="${p[(i % 3) + 1]}" opacity="0.35" filter="url(#blur)"/>`,
    )
    .join('');
  const title = wrap(e.title)
    .map(
      (l, i) =>
        `<text x="64" y="${230 + i * 92}" font-size="82" font-weight="800">${esc(l)}</text>`,
    )
    .join('');
  const date = startsAt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="50"/></filter>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>${blocks}${orbs}
  <rect x="0" y="0" width="1200" height="675" fill="${p[0]}" opacity="0.25"/>
  <g font-family="Helvetica, Arial, sans-serif" fill="${p[3]}">
    <text x="64" y="110" font-size="28" font-weight="700" letter-spacing="6" fill="${p[4]}">${esc(EVENT_ORG[e.organizer] ?? '').toUpperCase()}</text>
    ${title}
    <text x="64" y="600" font-size="34" font-weight="600">${esc(`${e.venue} · ${e.city} · ${date}`)}</text>
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const EVENT_ORG: Record<string, string> = Object.fromEntries(
  PLAYERS.filter((p) => p.org).map((p) => [p.username, p.org!.name]),
);

async function putPublic(key: string, png: Buffer) {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: png, ContentType: 'image/png' }),
  );
}

async function seedEvents(ids: Record<string, string>) {
  const now = Date.now();
  const artistRows = await prisma.artistProfile.findMany({
    where: { user: { username: { in: [...new Set(EVENTS.flatMap((e) => e.lineup))] } } },
    select: { id: true, user: { select: { username: true } } },
  });
  const artist = new Map(artistRows.map((a) => [a.user.username!, a.id]));
  if (artist.size === 0)
    console.warn('No demo artists found (run `pnpm db:seed`): events get no lineup.');

  let pools = 0;
  const eventIds: string[] = [];
  for (const e of EVENTS) {
    const organizerId = ids[e.organizer]!;
    const startsAt = new Date(now + e.start);
    const endsAt = new Date(now + e.end);
    const data = {
      description: e.description,
      venueName: e.venue,
      address: e.address,
      city: e.city,
      country: 'IN',
      startsAt,
      endsAt,
      recordingPolicy: e.policy,
      recordingNotes: e.notes ?? null,
      reviewStatus: 'APPROVED' as const,
      reviewedAt: new Date(),
      cancelledAt: null,
      deletedAt: null,
    };
    const existing = await prisma.event.findFirst({ where: { organizerId, title: e.title } });
    const event = existing
      ? await prisma.event.update({ where: { id: existing.id }, data })
      : await prisma.event.create({ data: { organizerId, title: e.title, ...data } });
    eventIds.push(event.id);

    // Fresh poster each run (old one removed).
    if (event.coverKey)
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: [{ Key: event.coverKey }] },
        }),
      );
    const coverKey = `event-covers/${organizerId}/${randomUUID()}.png`;
    await putPublic(coverKey, await posterPng(e, startsAt));
    await prisma.event.update({ where: { id: event.id }, data: { coverKey } });

    await prisma.eventArtist.deleteMany({ where: { eventId: event.id } });
    await prisma.eventArtist.createMany({
      data: e.lineup
        .filter((h) => artist.has(h))
        .map((h, position) => ({ eventId: event.id, artistId: artist.get(h)!, position })),
    });
    await prisma.eventScheduleItem.deleteMany({ where: { eventId: event.id } });
    await prisma.eventScheduleItem.createMany({
      data: e.schedule.map((s) => ({
        eventId: event.id,
        title: s.title,
        stage: s.stage ?? null,
        startsAt: new Date(startsAt.getTime() + s.at),
        endsAt: s.len ? new Date(startsAt.getTime() + s.at + s.len) : null,
        artistId: s.artist ? (artist.get(s.artist) ?? null) : null,
      })),
    });

    // Draft pool (the organizer funds it in the app with the sandbox checkout). Kept if it exists.
    if (e.pool) {
      const has = await prisma.rewardPool.findFirst({
        where: { eventId: event.id, title: e.pool.title },
      });
      if (!has) {
        await prisma.rewardPool.create({
          data: {
            eventId: event.id,
            creatorId: organizerId,
            title: e.pool.title,
            sponsorName: e.pool.sponsor,
            rules: e.pool.rules,
            budgetMinor: e.pool.budgetInr * 100,
            currency: 'INR',
            humanOnly: e.pool.humanOnly,
            startsAt,
            endsAt: new Date(endsAt.getTime() + 7 * DAY),
          },
        });
      }
      pools++;
    }
  }

  // Creators and supporters follow most events; organizers follow their own.
  const follows: { userId: string; eventId: string }[] = [];
  PLAYERS.forEach((pl, i) => {
    EVENTS.forEach((e, j) => {
      const own = e.organizer === pl.username;
      if (own || (pl.kind !== 'ORGANIZER' && (i + j) % 3 !== 0))
        follows.push({ userId: ids[pl.username]!, eventId: eventIds[j]! });
    });
  });
  await prisma.eventFollow.createMany({ data: follows, skipDuplicates: true });

  console.log(
    `Seeded ${EVENTS.length} events, ${pools} reward pools (draft until funded), ${follows.length} event follows.\n`,
  );
  console.table(
    EVENTS.map((e) => ({
      event: e.title,
      organizer: EVENT_ORG[e.organizer],
      city: e.city,
      when:
        e.start < 0 && e.end > 0
          ? 'LIVE NOW'
          : e.start > 0
            ? `in ${Math.round(e.start / DAY)} days`
            : 'finished',
      pool: e.pool
        ? `₹${e.pool.budgetInr.toLocaleString('en-IN')}${e.pool.humanOnly ? ' · humans only' : ''}`
        : '',
    })),
  );
  return new Map(EVENTS.map((e, i) => [e.title, eventIds[i]!]));
}

// ─────────── Predictions (testnet prediction game on Arc) ───────────

interface SeedPrediction {
  event: string;
  template: 'MATCH_WINNER' | 'BATTLE' | 'SETLIST' | 'BEST_CLIP' | 'CUSTOM';
  question: string;
  options?: string[];
  /** BEST_CLIP: creator usernames. */
  creators?: string[];
}

const PREDICTIONS: SeedPrediction[] = [
  {
    event: 'Block Party: Rooftop Genesis',
    template: 'BATTLE',
    question: 'Who plays the best set tonight?',
    options: ['Nila Waves', 'Kavya K'],
  },
  {
    event: 'Block Party: Rooftop Genesis',
    template: 'BEST_CLIP',
    question: 'Whose clip gets the most real watch time tonight?',
    creators: ['pixel.rohan', 'aisha.frames', 'kabir_onchain'],
  },
  {
    event: 'Hackers & Headliners Afterparty',
    template: 'CUSTOM',
    question: 'Will The Brass Republic play an encore?',
    options: ['Yes', 'No'],
  },
  {
    event: 'Gwei Nights: Sunset Validator',
    template: 'SETLIST',
    question: 'Which track drops right at sunset?',
    options: ['Low Tide', 'Gas War', 'Validator Dawn'],
  },
  {
    event: 'Chain Reaction Fest 2026: Day 1',
    template: 'MATCH_WINNER',
    question: 'Which stage draws the biggest crowd on Day 1?',
    options: ['Genesis Stage', 'Fork Stage'],
  },
];

/**
 * Saved as PENDING: the API's predictions worker (PREDICTIONS_ENABLED=true) creates each market
 * on Arc within ~20 s. Open to any account (not human-only) so test wallets can play.
 */
async function seedPredictions(ids: Record<string, string>, events: Map<string, string>) {
  const now = Date.now();
  let created = 0;
  for (const p of PREDICTIONS) {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: events.get(p.event)! } });
    if (
      await prisma.predictionMarket.findFirst({
        where: { eventId: event.id, question: p.question },
      })
    )
      continue;
    const live = event.startsAt.getTime() <= now;
    // Live events: picks stay open 2 hours (but close 30 min before the end). Upcoming: at the start.
    const locksAt = new Date(
      live
        ? Math.min(now + 2 * HOUR, event.endsAt.getTime() - 30 * 60_000)
        : event.startsAt.getTime(),
    );
    const dataMarket = p.template === 'BEST_CLIP';
    const settlesAt = dataMarket ? new Date(event.endsAt.getTime() + HOUR) : null;
    const resolveBy = dataMarket
      ? new Date(settlesAt!.getTime() + DAY)
      : new Date(Math.max(locksAt.getTime(), event.endsAt.getTime()) + 3 * DAY);
    const options = dataMarket
      ? await Promise.all(
          p.creators!.map(async (u) => {
            const c = await prisma.user.findUniqueOrThrow({ where: { id: ids[u]! } });
            return { label: c.displayName ?? u, creatorId: c.id };
          }),
        )
      : p.options!.map((label) => ({ label, creatorId: null }));
    await prisma.predictionMarket.create({
      data: {
        eventId: event.id,
        creatorId: event.organizerId,
        question: p.question,
        template: p.template,
        resolution: dataMarket ? 'DATA' : 'MANUAL',
        options,
        locksAt,
        settlesAt,
        resolveBy,
        minStakeMicro: 1_000_000n,
        maxStakeMicro: 10_000_000n,
        creatorBps: dataMarket ? 1_000 : 0,
        humanOnly: false,
        note: 'Setting up on Arc…',
      },
    });
    created++;
  }
  console.log(
    `Predictions: ${created} new (${PREDICTIONS.length - created} already there). The API puts them on Arc within ~20 s.\n`,
  );
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

  const events = await seedEvents(ids);
  await seedPredictions(ids, events);

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
